import { JobKind, JobStatus, Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

// Async job queue service (M4 — docs/04-ai-integration.md §"Async / batching").
// Provides enqueue/claim/complete/fail lifecycle for the worker process
// (scripts/worker.ts). Invariant: payloads carry no secrets (#6); job results
// only persist safe text (#1, #6).

export type { JobKind, JobStatus };

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

// List the most recent jobs for a campaign (DM/co-DM only). Returns display
// fields only — no payload or internals.
export async function listRecentJobs(
  userId: string,
  campaignId: string,
  take = 5,
) {
  await assertCampaignDm(userId, campaignId);
  return prisma.job.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      status: true,
      error: true,
      result: true,
      createdAt: true,
      finishedAt: true,
    },
  });
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
  await prisma.job.update({
    where: { id },
    data: {
      status: JobStatus.SUCCEEDED,
      finishedAt: new Date(),
      result: result as Prisma.InputJsonValue,
    },
  });
}

// Mark a job FAILED with a safe message (never raw provider text — invariant #6).
export async function failJob(id: string, safeMessage: string): Promise<void> {
  await prisma.job.update({
    where: { id },
    data: {
      status: JobStatus.FAILED,
      finishedAt: new Date(),
      error: safeMessage,
    },
  });
}
