import { ServiceError } from "@/lib/errors";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { prisma } from "@/server/db";
import type { LLMUsage } from "@/server/ai/types";
import { assertCampaignDm } from "@/server/services/ai-keys";

// AI usage tracking + spend caps (M4 — docs/04-ai-integration.md). Every
// successful generation records its token usage and an estimated cost so a DM
// can see what BYO generation is costing, and so a DM-set spend cap can block
// further runs once the campaign's known spend reaches the ceiling. These records
// carry NO secret — the API key is never referenced here (invariant #6) — and are
// a cost/usage trail, distinct from review-pipeline provenance.

export type RecordAiUsageInput = {
  campaignId: string;
  userId: string;
  providerId: string;
  model: string;
  generatorId: string;
  usage: LLMUsage;
  changeSetId?: string;
};

// Persist one run's usage. Cost is estimated from the model's price table; an
// unpriced model records null cost (tokens stay authoritative). Best-effort: a
// generation that already produced a proposal should not fail because we couldn't
// write its usage row, so callers may ignore a thrown error here.
export async function recordAiUsage(input: RecordAiUsageInput) {
  const estimatedCostUsd = estimateCostUsd(input.model, input.usage);
  return prisma.aiUsage.create({
    data: {
      campaignId: input.campaignId,
      createdById: input.userId,
      providerId: input.providerId,
      model: input.model,
      generatorId: input.generatorId,
      changeSetId: input.changeSetId ?? null,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cacheReadTokens: input.usage.cacheReadTokens,
      cacheCreationTokens: input.usage.cacheCreationTokens,
      estimatedCostUsd,
    },
  });
}

// Sum the campaign's known (priced) estimated spend. Unpriced runs contribute no
// dollar figure (their cost is unknown), so they don't count toward the cap.
async function totalKnownSpendUsd(campaignId: string): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({
    where: { campaignId },
    _sum: { estimatedCostUsd: true },
  });
  return agg._sum.estimatedCostUsd ?? 0;
}

// Throw a ServiceError if the campaign's spend cap is set and already reached.
// Called before a generation spends money. No cap (null) → always allowed.
export async function assertWithinSpendCap(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { spendCapUsd: true },
  });
  const cap = campaign?.spendCapUsd;
  if (cap == null) return;

  const spent = await totalKnownSpendUsd(campaignId);
  if (spent >= cap) {
    throw new ServiceError(
      `This campaign's AI spend cap ($${cap.toFixed(2)}) has been reached. Raise or clear it in Settings to keep generating.`,
    );
  }
}

export type CampaignAiUsage = {
  spendCapUsd: number | null;
  totalCostUsd: number;
  runCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  // Runs whose model has no known price; their cost isn't in totalCostUsd.
  unpricedRunCount: number;
};

// Aggregate the campaign's usage for the Settings panel. DM/co-DM only — usage is
// DM-facing operational data, never exposed to players.
export async function getCampaignAiUsage(
  userId: string,
  campaignId: string,
): Promise<CampaignAiUsage> {
  await assertCampaignDm(userId, campaignId);

  const [campaign, totals, unpriced] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { spendCapUsd: true },
    }),
    prisma.aiUsage.aggregate({
      where: { campaignId },
      _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    prisma.aiUsage.count({ where: { campaignId, estimatedCostUsd: null } }),
  ]);

  return {
    spendCapUsd: campaign?.spendCapUsd ?? null,
    totalCostUsd: totals._sum.estimatedCostUsd ?? 0,
    runCount: totals._count,
    totalInputTokens: totals._sum.inputTokens ?? 0,
    totalOutputTokens: totals._sum.outputTokens ?? 0,
    unpricedRunCount: unpriced,
  };
}

// Set or clear (null) the campaign's spend cap. DM/co-DM only; audited. A
// negative cap is rejected; the value is stored as-is otherwise.
export async function setCampaignSpendCap(
  userId: string,
  campaignId: string,
  capUsd: number | null,
): Promise<{ spendCapUsd: number | null }> {
  await assertCampaignDm(userId, campaignId);

  if (capUsd != null && (!Number.isFinite(capUsd) || capUsd < 0)) {
    throw new ServiceError("Enter a spend cap of 0 or more, or clear it.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.campaign.update({
      where: { id: campaignId },
      data: { spendCapUsd: capUsd },
      select: { spendCapUsd: true },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "SET_SPEND_CAP",
        targetType: "CAMPAIGN",
        targetId: campaignId,
        detail: { spendCapUsd: capUsd },
      },
    });
    return row;
  });

  return { spendCapUsd: updated.spendCapUsd ?? null };
}
