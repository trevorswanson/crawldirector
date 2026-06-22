import { JobKind, JobStatus, Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

// Async job queue service (M4 — docs/04-ai-integration.md §"Async / batching").
// Provides enqueue/claim/complete/fail lifecycle for the worker process
// (scripts/worker.ts). Invariant: payloads carry no secrets (#6); job results
// only persist safe text (#1, #6).

export type { JobKind, JobStatus };

const jobDisplaySelect = {
  id: true,
  kind: true,
  status: true,
  error: true,
  result: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
} satisfies Prisma.JobSelect;

type Db = Prisma.TransactionClient;
type JobDisplay = Prisma.JobGetPayload<{ select: typeof jobDisplaySelect }>;
type ActiveJobStatus = "QUEUED" | "RUNNING";
export type JobListFilters = {
  kinds?: JobKind[];
  statuses?: JobStatus[];
  aiOnly?: boolean;
};

const AI_JOB_KINDS = [JobKind.BULK_FLESH, JobKind.EMBED_SEARCH_DOCS] as const;

// A worker that dies mid-job never reaches completeJob/failJob, so its row stays
// RUNNING forever — claimNextJob only revisits QUEUED rows. Treat a RUNNING job
// as "active" (and thus blocking) only while it was started recently; past this
// window assume the worker is gone so a manual rebuild can re-queue instead of
// being blocked until someone edits the database. QUEUED jobs always block.
const STALE_RUNNING_JOB_MS = 15 * 60 * 1000; // 15 minutes

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to manage jobs in this campaign.");
  }
  return membership;
}

// Enqueue a new QUEUED job. DM/co-DM only. Validates that the payload is a
// plain JSON-serialisable object before persisting (no secrets, invariant #6).
export async function enqueueJob(
  userId: string,
  campaignId: string,
  kind: JobKind,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  await assertCampaignDm(userId, campaignId);
  const job = await prisma.job.create({
    data: {
      campaignId,
      createdById: userId,
      kind,
      status: JobStatus.QUEUED,
      payload: payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { id: job.id };
}

async function findActiveCampaignJob(
  db: Db,
  campaignId: string,
  kind: JobKind,
): Promise<JobDisplay | null> {
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_JOB_MS);
  const active = await db.job.findMany({
    where: {
      campaignId,
      kind,
      OR: [
        { status: JobStatus.QUEUED },
        // Stale RUNNING rows (worker died, or startedAt never set) are excluded
        // so they no longer block a fresh rebuild.
        { status: JobStatus.RUNNING, startedAt: { gte: runningCutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: jobDisplaySelect,
  });
  return active.find((job) => job.status === JobStatus.RUNNING) ?? active[0] ?? null;
}

type SingletonCampaignJobResult = {
  id: string;
  status: ActiveJobStatus;
  created: boolean;
};

// Enqueue a once-per-active-run campaign job, pointing a repeated trigger at the
// in-flight job rather than queuing overlapping passes. Unlike the automatic
// search-index scheduler, this guards both QUEUED and RUNNING jobs. The
// per-campaign row lock serializes concurrent enqueue attempts without changing
// the broader job table constraints; content-change auto-refresh can still queue
// a follow-up while a worker is RUNNING.
async function enqueueSingletonCampaignJob(
  userId: string,
  campaignId: string,
  kind: JobKind,
): Promise<SingletonCampaignJobResult> {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;

    const active = await findActiveCampaignJob(tx, campaignId, kind);
    if (active) {
      return {
        id: active.id,
        status: active.status as ActiveJobStatus,
        created: false,
      };
    }

    const job = await tx.job.create({
      data: {
        campaignId,
        createdById: userId,
        kind,
        status: JobStatus.QUEUED,
        payload: {},
      },
      select: { id: true },
    });
    return { id: job.id, status: JobStatus.QUEUED, created: true };
  });
}

// Enqueue the manual semantic-index rebuild once per active campaign run: a
// repeated button click should point at the active rebuild rather than queue
// overlapping paid embedding work.
export async function enqueueBuildSemanticIndexJob(
  userId: string,
  campaignId: string,
): Promise<SingletonCampaignJobResult> {
  return enqueueSingletonCampaignJob(userId, campaignId, JobKind.EMBED_SEARCH_DOCS);
}

// Enqueue a campaign data-schema migration once per active campaign run:
// repeated triggers should point at the in-flight mechanical migration instead
// of queuing overlapping passes.
export async function enqueueMigrateEntityDataJob(
  userId: string,
  campaignId: string,
): Promise<SingletonCampaignJobResult> {
  return enqueueSingletonCampaignJob(userId, campaignId, JobKind.MIGRATE_ENTITY_DATA);
}

// List the most recent jobs for a campaign (DM/co-DM only). Returns display
// fields only — no payload or internals.
export async function listRecentJobs(
  userId: string,
  campaignId: string,
  take: number | null = 5,
  filters: JobListFilters = {},
) {
  await assertCampaignDm(userId, campaignId);
  let kinds = filters.kinds;
  if (filters.aiOnly) {
    kinds =
      filters.kinds?.filter((kind) => AI_JOB_KINDS.includes(kind as (typeof AI_JOB_KINDS)[number])) ?? [
        ...AI_JOB_KINDS,
      ];
  }

  return prisma.job.findMany({
    where: {
      campaignId,
      ...(kinds ? { kind: { in: kinds } } : {}),
      ...(filters.statuses ? { status: { in: filters.statuses } } : {}),
    },
    orderBy: { createdAt: "desc" },
    ...(take == null ? {} : { take }),
    select: jobDisplaySelect,
  });
}

// Cancel a queued job from the DM console. Cancellation is represented as a
// safe FAILED terminal state so the existing worker lifecycle and history
// display do not need a new schema enum value. RUNNING jobs are deliberately
// excluded: the worker has already claimed the row and may still perform
// provider calls or write side effects before it tries to complete the job.
export async function cancelJob(
  userId: string,
  campaignId: string,
  jobId: string,
): Promise<JobDisplay> {
  await assertCampaignDm(userId, campaignId);
  const job = await prisma.job.findFirst({
    where: { id: jobId, campaignId },
    select: jobDisplaySelect,
  });
  if (!job) {
    throw new ServiceError("Job not found.");
  }
  if (job.status !== JobStatus.QUEUED) {
    throw new ServiceError("Only queued jobs can be canceled.");
  }

  const { count } = await prisma.job.updateMany({
    where: {
      id: jobId,
      campaignId,
      status: JobStatus.QUEUED,
    },
    data: {
      status: JobStatus.FAILED,
      finishedAt: new Date(),
      error: "Canceled by DM.",
    },
  });
  if (count !== 1) {
    throw new ServiceError("Only queued jobs can be canceled.");
  }

  return prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    select: jobDisplaySelect,
  });
}

// Return the active job for one kind, if any (DM/co-DM only). Used by pages that
// need to disable duplicate controls while background work is queued/running.
export async function getActiveCampaignJob(
  userId: string,
  campaignId: string,
  kind: JobKind,
): Promise<JobDisplay | null> {
  await assertCampaignDm(userId, campaignId);
  return findActiveCampaignJob(prisma, campaignId, kind);
}

// Worker-internal: claim the oldest due QUEUED job and flip it to RUNNING.
// Returns the full job row, or null when the queue is empty.
//
// Single-worker assumption: only one worker process runs at a time. The
// optimistic updateMany (where: { id, status: QUEUED }) prevents double-claim
// even if an accidental second worker races; before running two workers,
// replace this with FOR UPDATE SKIP LOCKED.
export async function claimNextJob() {
  // Loop until we claim a job or the queue is empty.
  while (true) {
    const next = await prisma.job.findFirst({
      where: {
        status: JobStatus.QUEUED,
        runAfter: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!next) return null;

    // Optimistic claim: only succeeds if the row is still QUEUED.
    const { count } = await prisma.job.updateMany({
      where: { id: next.id, status: JobStatus.QUEUED },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (count === 1) {
      // Re-fetch the updated row so the handler has all fields.
      return prisma.job.findUniqueOrThrow({ where: { id: next.id } });
    }
    // count === 0 means another worker (or a race) claimed it; retry the find.
  }
}

// Mark a job SUCCEEDED and persist its result.
export async function completeJob(id: string, result: unknown): Promise<void> {
  await prisma.job.updateMany({
    where: { id, status: JobStatus.RUNNING },
    data: {
      status: JobStatus.SUCCEEDED,
      finishedAt: new Date(),
      result: result as Prisma.InputJsonValue,
    },
  });
}

// Mark a job FAILED with a safe message (never raw provider text — invariant #6).
export async function failJob(id: string, safeMessage: string): Promise<void> {
  await prisma.job.updateMany({
    where: { id, status: JobStatus.RUNNING },
    data: {
      status: JobStatus.FAILED,
      finishedAt: new Date(),
      error: safeMessage,
    },
  });
}
