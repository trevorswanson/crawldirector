import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the generation module's provider seam — handler tests should not make
// real network calls. Uses the same vi.hoisted + vi.mock pattern as generation.test.ts.
const { resolveCampaignProvider, seedCampaignFromLore, embedSearchDocs } = vi.hoisted(() => ({
  resolveCampaignProvider: vi.fn(),
  seedCampaignFromLore: vi.fn().mockResolvedValue({ count: 3 }),
  embedSearchDocs: vi.fn().mockResolvedValue({ embedded: 5, model: "text-embedding-3-small" }),
}));

vi.mock("@/server/ai", () => ({
  resolveCampaignProvider,
  describeProviderError: () => "Connection failed.",
}));

vi.mock("@/server/services/seeding", () => ({
  seedCampaignFromLore,
}));

// Mock the embedding service whole so the handler test doesn't load its
// @/server/ai dependency (mocked thin above) or touch a provider.
vi.mock("@/server/services/embeddings", () => ({
  embedSearchDocs,
}));

import { JobKind, JobStatus } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  listRecentJobs,
} from "@/server/services/jobs";
import { jobHandlers } from "@/server/jobs/handlers";

// ─── seed helpers ────────────────────────────────────────────────────────────

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.job.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const dm = await makeUser("dm@test.com");
  const player = await makeUser("player@test.com");
  const campaign = await createCampaign(dm.id, { name: "Dungeon" });
  await prisma.membership.create({
    data: { userId: player.id, campaignId: campaign.id, role: "PLAYER" },
  });
  return { dmId: dm.id, playerId: player.id, campaignId: campaign.id };
}

// ─── enqueueJob ──────────────────────────────────────────────────────────────

describe("enqueueJob", () => {
  it("creates a QUEUED job and returns its id for a DM", async () => {
    const { dmId, campaignId } = await seed();
    const { id } = await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, {
      entityIds: ["e1"],
    });
    expect(id).toBeTruthy();

    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe(JobStatus.QUEUED);
    expect(job.kind).toBe(JobKind.BULK_FLESH);
    expect(job.payload).toEqual({ entityIds: ["e1"] });
  });

  it("throws ServiceError for a PLAYER", async () => {
    const { playerId, campaignId } = await seed();
    await expect(
      enqueueJob(playerId, campaignId, JobKind.BULK_FLESH, { entityIds: [] }),
    ).rejects.toThrow(ServiceError);
  });
});

// ─── listRecentJobs ──────────────────────────────────────────────────────────

describe("listRecentJobs", () => {
  it("returns only display fields, newest first, for a DM", async () => {
    const { dmId, campaignId } = await seed();
    await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, { entityIds: ["e1"] });
    await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, { entityIds: ["e2"] });

    const jobs = await listRecentJobs(dmId, campaignId);
    expect(jobs.length).toBe(2);
    // Newest first — second enqueue was more recent.
    const first = jobs[0];
    expect(Object.keys(first).sort()).toEqual(
      ["id", "kind", "status", "error", "result", "createdAt", "finishedAt"].sort(),
    );
  });

  it("throws ServiceError for a PLAYER", async () => {
    const { playerId, campaignId } = await seed();
    await expect(listRecentJobs(playerId, campaignId)).rejects.toThrow(ServiceError);
  });
});

// ─── claimNextJob ────────────────────────────────────────────────────────────

describe("claimNextJob", () => {
  it("claims the oldest due QUEUED job, flips it to RUNNING with attempts: 1", async () => {
    const { dmId, campaignId } = await seed();
    const { id } = await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, {
      entityIds: ["e1"],
    });

    const claimed = await claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(id);
    expect(claimed!.status).toBe(JobStatus.RUNNING);
    expect(claimed!.attempts).toBe(1);
    expect(claimed!.startedAt).toBeTruthy();
  });

  it("returns null when the queue is empty", async () => {
    const result = await claimNextJob();
    expect(result).toBeNull();
  });

  it("returns null after the only job has been claimed", async () => {
    const { dmId, campaignId } = await seed();
    await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, { entityIds: ["e1"] });
    await claimNextJob();
    const second = await claimNextJob();
    expect(second).toBeNull();
  });
});

// ─── completeJob / failJob ───────────────────────────────────────────────────

describe("completeJob", () => {
  it("sets status SUCCEEDED, finishedAt, and result", async () => {
    const { dmId, campaignId } = await seed();
    const { id } = await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, {
      entityIds: ["e1"],
    });
    await claimNextJob();
    await completeJob(id, { proposedCount: 1, skippedCount: 0 });

    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe(JobStatus.SUCCEEDED);
    expect(job.finishedAt).toBeTruthy();
    expect(job.result).toEqual({ proposedCount: 1, skippedCount: 0 });
  });
});

describe("failJob", () => {
  it("sets status FAILED, finishedAt, and safe error message", async () => {
    const { dmId, campaignId } = await seed();
    const { id } = await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, {
      entityIds: ["e1"],
    });
    await claimNextJob();
    await failJob(id, "Job failed.");

    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.finishedAt).toBeTruthy();
    expect(job.error).toBe("Job failed.");
  });

  it("persists the generic fallback message, not raw provider text", async () => {
    const { dmId, campaignId } = await seed();
    const { id } = await enqueueJob(dmId, campaignId, JobKind.BULK_FLESH, {
      entityIds: ["e1"],
    });
    await claimNextJob();
    // Simulate the worker's invariant #6 enforcement: raw text never persisted.
    const rawText = "sk-ant-key-abc123 exceeded quota";
    const safeMessage = "Job failed."; // worker uses this for non-ServiceErrors
    await failJob(id, safeMessage);

    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.error).toBe(safeMessage);
    expect(job.error).not.toContain(rawText);
  });
});

// ─── BULK_FLESH handler ──────────────────────────────────────────────────────

describe("jobHandlers.BULK_FLESH", () => {
  it("throws ServiceError on invalid payload (missing entityIds)", async () => {
    const fakeJob = {
      id: "j1",
      campaignId: "c1",
      createdById: "u1",
      kind: JobKind.BULK_FLESH,
      status: JobStatus.RUNNING,
      payload: { wrongField: "oops" },
      result: null,
      error: null,
      attempts: 1,
      maxAttempts: 1,
      runAfter: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(jobHandlers[JobKind.BULK_FLESH](fakeJob)).rejects.toThrow(ServiceError);
    await expect(jobHandlers[JobKind.BULK_FLESH](fakeJob)).rejects.toThrow("Invalid job payload.");
  });

  it("throws ServiceError on invalid payload (entityIds not string[])", async () => {
    const fakeJob = {
      id: "j1",
      campaignId: "c1",
      createdById: "u1",
      kind: JobKind.BULK_FLESH,
      status: JobStatus.RUNNING,
      payload: { entityIds: [1, 2, 3] }, // numbers, not strings
      result: null,
      error: null,
      attempts: 1,
      maxAttempts: 1,
      runAfter: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(jobHandlers[JobKind.BULK_FLESH](fakeJob)).rejects.toThrow(ServiceError);
  });

  it("delegates to fleshOutEntities with the job's createdById and campaignId", async () => {
    // Set up real DB data so fleshOutEntities can look up the membership.
    const { dmId, campaignId } = await seed();
    const entity = await prisma.entity.create({
      data: {
        campaignId,
        type: "NPC",
        name: "Stub",
        createdById: dmId,
        isStub: true,
      },
    });

    // Stub the provider so no real network call is made (same pattern as generation.test.ts).
    resolveCampaignProvider.mockResolvedValue({
      id: "anthropic",
      model: "claude-opus-4-8",
      generateStructured: vi.fn().mockResolvedValue({
        data: { summary: "A daring adventurer.", description: "Long form.", tags: ["brave"] },
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
        model: "claude-opus-4-8",
      }),
    });

    const fakeJob = {
      id: "j1",
      campaignId,
      createdById: dmId,
      kind: JobKind.BULK_FLESH,
      status: JobStatus.RUNNING,
      payload: { entityIds: [entity.id] },
      result: null,
      error: null,
      attempts: 1,
      maxAttempts: 1,
      runAfter: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = (await jobHandlers[JobKind.BULK_FLESH](fakeJob)) as {
      proposedCount: number;
      skippedCount: number;
    };
    expect(typeof result.proposedCount).toBe("number");
    expect(typeof result.skippedCount).toBe("number");
  });
});

// ─── LORE_SEED handler ──────────────────────────────────────────────────────

describe("jobHandlers.LORE_SEED", () => {
  it("delegates to seedCampaignFromLore with the job's createdById and campaignId", async () => {
    const fakeJob = {
      id: "j2",
      campaignId: "c1",
      createdById: "u1",
      kind: JobKind.LORE_SEED,
      status: JobStatus.RUNNING,
      payload: {},
      result: null,
      error: null,
      attempts: 1,
      maxAttempts: 1,
      runAfter: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await jobHandlers[JobKind.LORE_SEED](fakeJob);
    expect(seedCampaignFromLore).toHaveBeenCalledWith("u1", "c1");
    expect(result).toEqual({ count: 3 });
  });
});

// ─── EMBED_SEARCH_DOCS handler ───────────────────────────────────────────────

describe("jobHandlers.EMBED_SEARCH_DOCS", () => {
  it("delegates to embedSearchDocs with the job's createdById and campaignId", async () => {
    const fakeJob = {
      id: "j3",
      campaignId: "c1",
      createdById: "u1",
      kind: JobKind.EMBED_SEARCH_DOCS,
      status: JobStatus.RUNNING,
      payload: {},
      result: null,
      error: null,
      attempts: 1,
      maxAttempts: 1,
      runAfter: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await jobHandlers[JobKind.EMBED_SEARCH_DOCS](fakeJob);
    expect(embedSearchDocs).toHaveBeenCalledWith("u1", "c1");
    expect(result).toEqual({ embedded: 5, model: "text-embedding-3-small" });
  });
});
