import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  assertWithinSpendCap,
  getCampaignAiUsage,
  recordAiUsage,
  setCampaignSpendCap,
} from "@/server/services/ai-usage";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

const usage = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

async function seed() {
  const dm = await makeUser("dm@test.com");
  const player = await makeUser("player@test.com");
  const campaign = await createCampaign(dm.id, { name: "Crawl" });
  await prisma.membership.create({
    data: { userId: player.id, campaignId: campaign.id, role: "PLAYER" },
  });
  return { dmId: dm.id, playerId: player.id, campaignId: campaign.id };
}

beforeEach(async () => {
  await prisma.aiUsage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("recordAiUsage", () => {
  it("stores tokens and an estimated cost for a priced model", async () => {
    const { dmId, campaignId } = await seed();

    const row = await recordAiUsage({
      campaignId,
      userId: dmId,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      generatorId: "flesh-entity",
      usage,
      changeSetId: "cs_123",
    });

    expect(row.inputTokens).toBe(1_000_000);
    expect(row.outputTokens).toBe(1_000_000);
    expect(row.changeSetId).toBe("cs_123");
    // 1M input ($15) + 1M output ($75) on opus.
    expect(row.estimatedCostUsd).toBeCloseTo(90, 6);
    expect(row.generatorId).toBe("flesh-entity");
  });

  it("records null cost (tokens still counted) for an unpriced model", async () => {
    const { dmId, campaignId } = await seed();

    const row = await recordAiUsage({
      campaignId,
      userId: dmId,
      providerId: "openai-compatible",
      model: "local-llama",
      generatorId: "scaffold-stubs",
      usage,
    });

    expect(row.estimatedCostUsd).toBeNull();
    expect(row.inputTokens).toBe(1_000_000);
    expect(row.changeSetId).toBeNull();
  });

  it("freezes each run's cost at record time — a later rate change is not retroactive", async () => {
    const { dmId, campaignId } = await seed();
    const oneMInput = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

    // Day 1: rate $1 / 1M input. Record a 1M-input run → $1.
    await prisma.aiKey.create({
      data: {
        campaignId,
        providerId: "openai-compatible",
        ciphertext: "x",
        lastFour: "",
        baseUrl: "http://localhost:11434/v1",
        model: "local-llama",
        inputPerMTokUsd: 1,
        outputPerMTokUsd: 1,
        createdById: dmId,
      },
    });
    const day1 = await recordAiUsage({
      campaignId, userId: dmId, providerId: "openai-compatible", model: "local-llama", generatorId: "scaffold-stubs", usage: oneMInput,
    });
    expect(day1.estimatedCostUsd).toBeCloseTo(1, 6);

    // Day 2: provider raised prices — DM bumps the rate to $2 / 1M.
    await prisma.aiKey.update({
      where: { campaignId_providerId: { campaignId, providerId: "openai-compatible" } },
      data: { inputPerMTokUsd: 2, outputPerMTokUsd: 2 },
    });
    const day2 = await recordAiUsage({
      campaignId, userId: dmId, providerId: "openai-compatible", model: "local-llama", generatorId: "scaffold-stubs", usage: oneMInput,
    });
    expect(day2.estimatedCostUsd).toBeCloseTo(2, 6);

    // The Day-1 row is untouched, and the total is $1 + $2 = $3 — not 2 × $2.
    const stored = await prisma.aiUsage.findUniqueOrThrow({ where: { id: day1.id } });
    expect(stored.estimatedCostUsd).toBeCloseTo(1, 6);
    const summary = await getCampaignAiUsage(dmId, campaignId);
    expect(summary.totalCostUsd).toBeCloseTo(3, 6);
  });

  it("costs an unpriced model from the AiKey's per-token override", async () => {
    const { dmId, campaignId } = await seed();
    // The DM sets their own rates on the self-hosted/proxy key.
    await prisma.aiKey.create({
      data: {
        campaignId,
        providerId: "openai-compatible",
        ciphertext: "x",
        lastFour: "",
        baseUrl: "http://localhost:11434/v1",
        model: "local-llama",
        inputPerMTokUsd: 0.5,
        outputPerMTokUsd: 1.5,
        createdById: dmId,
      },
    });

    const row = await recordAiUsage({
      campaignId,
      userId: dmId,
      providerId: "openai-compatible",
      model: "local-llama",
      generatorId: "scaffold-stubs",
      usage, // 1M in + 1M out
    });

    // $0.50 + $1.50 — no longer null, so it counts toward the cap too.
    expect(row.estimatedCostUsd).toBeCloseTo(2, 6);
  });
});

describe("getCampaignAiUsage", () => {
  it("aggregates cost, runs, and tokens, and flags unpriced runs", async () => {
    const { dmId, campaignId } = await seed();
    await recordAiUsage({ campaignId, userId: dmId, providerId: "anthropic", model: "claude-opus-4-8", generatorId: "flesh-entity", usage });
    await recordAiUsage({ campaignId, userId: dmId, providerId: "openai-compatible", model: "local-llama", generatorId: "scaffold-stubs", usage });

    const summary = await getCampaignAiUsage(dmId, campaignId);
    expect(summary.runCount).toBe(2);
    expect(summary.totalCostUsd).toBeCloseTo(90, 6); // unpriced run contributes no dollars
    expect(summary.unpricedRunCount).toBe(1);
    expect(summary.totalInputTokens).toBe(2_000_000);
    expect(summary.totalOutputTokens).toBe(2_000_000);
    expect(summary.spendCapUsd).toBeNull();
  });

  it("returns zeroed totals for a campaign with no runs", async () => {
    const { dmId, campaignId } = await seed();
    const summary = await getCampaignAiUsage(dmId, campaignId);
    expect(summary).toMatchObject({
      runCount: 0,
      totalCostUsd: 0,
      unpricedRunCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      spendCapUsd: null,
    });
  });

  it("rejects a player (DM-only operational data)", async () => {
    const { playerId, campaignId } = await seed();
    await expect(getCampaignAiUsage(playerId, campaignId)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("setCampaignSpendCap", () => {
  it("sets a cap and writes a SET_SPEND_CAP audit row", async () => {
    const { dmId, campaignId } = await seed();
    const result = await setCampaignSpendCap(dmId, campaignId, 25);
    expect(result.spendCapUsd).toBe(25);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.spendCapUsd).toBe(25);

    const audit = await prisma.auditLog.findFirstOrThrow();
    expect(audit.action).toBe("SET_SPEND_CAP");
    expect(audit.targetType).toBe("CAMPAIGN");
    expect((audit.detail as { spendCapUsd?: number }).spendCapUsd).toBe(25);
  });

  it("clears the cap when passed null", async () => {
    const { dmId, campaignId } = await seed();
    await setCampaignSpendCap(dmId, campaignId, 25);
    const result = await setCampaignSpendCap(dmId, campaignId, null);
    expect(result.spendCapUsd).toBeNull();
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.spendCapUsd).toBeNull();
  });

  it("rejects a negative cap and a player", async () => {
    const { dmId, playerId, campaignId } = await seed();
    await expect(setCampaignSpendCap(dmId, campaignId, -1)).rejects.toBeInstanceOf(ServiceError);
    await expect(setCampaignSpendCap(playerId, campaignId, 10)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("assertWithinSpendCap", () => {
  it("allows generation when no cap is set", async () => {
    const { dmId, campaignId } = await seed();
    await recordAiUsage({ campaignId, userId: dmId, providerId: "anthropic", model: "claude-opus-4-8", generatorId: "flesh-entity", usage });
    await expect(assertWithinSpendCap(campaignId)).resolves.toBeUndefined();
  });

  it("allows generation while known spend is under the cap", async () => {
    const { dmId, campaignId } = await seed();
    await setCampaignSpendCap(dmId, campaignId, 1000);
    await recordAiUsage({ campaignId, userId: dmId, providerId: "anthropic", model: "claude-opus-4-8", generatorId: "flesh-entity", usage }); // $90
    await expect(assertWithinSpendCap(campaignId)).resolves.toBeUndefined();
  });

  it("blocks generation once known spend reaches the cap", async () => {
    const { dmId, campaignId } = await seed();
    await setCampaignSpendCap(dmId, campaignId, 50);
    await recordAiUsage({ campaignId, userId: dmId, providerId: "anthropic", model: "claude-opus-4-8", generatorId: "flesh-entity", usage }); // $90 ≥ $50
    await expect(assertWithinSpendCap(campaignId)).rejects.toBeInstanceOf(ServiceError);
  });

  it("ignores unpriced runs when measuring spend against the cap", async () => {
    const { dmId, campaignId } = await seed();
    await setCampaignSpendCap(dmId, campaignId, 50);
    // Only an unpriced run exists — its cost is unknown, so it can't trip the cap.
    await recordAiUsage({ campaignId, userId: dmId, providerId: "openai-compatible", model: "local-llama", generatorId: "scaffold-stubs", usage });
    await expect(assertWithinSpendCap(campaignId)).resolves.toBeUndefined();
  });
});
