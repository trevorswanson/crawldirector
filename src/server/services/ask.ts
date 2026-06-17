import { Role } from "@/generated/prisma/client";
import { formatEntityType } from "@/lib/entities";
import { ServiceError } from "@/lib/errors";
import { relationshipTypeMeta } from "@/lib/relationship-types";
import { describeProviderError, resolveCampaignProvider } from "@/server/ai";
import { prisma } from "@/server/db";
import {
  ASK_ANSWER_MAX_TOKENS,
  ASK_CAMPAIGN_GENERATOR,
  MAX_QUESTION_LENGTH,
  buildAskPrompt,
  parseCitedIndices,
  type AskSourceContext,
} from "@/server/ai/generators/ask-campaign";
import { assertWithinSpendCap, recordAiUsage } from "@/server/services/ai-usage";
import { searchCanon, type SearchHit } from "@/server/services/search";
import {
  SEARCH_TARGET_EVENT,
  SEARCH_TARGET_RELATIONSHIP,
} from "@/server/services/search-index";

// "Ask the Campaign" — retrieval-augmented Q&A (M5 slice 5 — docs/07-search-
// retrieval.md). The seam between scoped retrieval and a BYO-key chat model:
// retrieve the top-k canon docs the requester may see, hand them to the model as
// numbered sources, and return a grounded, **cited** prose answer. Strictly
// **read-only** (invariant #1) — answering a question never writes canon; the
// result is a synthesized view with citations, not a proposal.
//
// Visibility is enforced *at retrieval* (invariant #5): the only canon the model
// ever sees is what `searchCanon` already projected for this member's role, so a
// player's question can never surface DM-only or secret canon. The chat model is
// handed the denormalized `SearchDoc.content` for the retrieved hits — exactly
// the text already scoped to the requester — never raw canon.

// How many canon documents to retrieve as grounding. Tight enough to fit a chat
// context window and keep the answer focused; the hybrid (full-text + semantic)
// ranking puts the most relevant docs first.
export const ASK_RETRIEVAL_LIMIT = 12;

// Returned to the UI per cited/retrieved source: enough to render a verifiable
// link back to the canon the claim came from. Serializable across the server-
// action boundary (no class instances).
export type AskSource = {
  index: number;
  cited: boolean;
  targetType: SearchHit["targetType"];
  targetId: string;
  kind: string;
  label: string;
  href: string;
};

export type AskResult = {
  role: Role;
  question: string;
  answer: string;
  // false when no canon matched the question — we return a "canon is silent"
  // answer *without* spending a provider call (and without inviting a
  // hallucination from an empty context).
  grounded: boolean;
  sources: AskSource[];
  model: string | null;
  providerId: string | null;
};

// Describe a search hit for both the prompt (kind + title) and the UI (label +
// href). Kept here so the relationship-phrase / type-formatting logic lives in
// one place rather than being duplicated client-side.
function describeHit(
  campaignId: string,
  hit: SearchHit,
): { kind: string; title: string; href: string } {
  if (hit.targetType === SEARCH_TARGET_RELATIONSHIP) {
    const { relationship: rel } = hit;
    return {
      kind: "Relationship",
      title: `${rel.sourceEntity.name} ${relationshipTypeMeta[rel.type].forward} ${rel.targetEntity.name}`,
      href: `/campaigns/${campaignId}/graph`,
    };
  }
  if (hit.targetType === SEARCH_TARGET_EVENT) {
    return {
      kind: "Event",
      title: hit.event.title,
      href: `/campaigns/${campaignId}/timeline`,
    };
  }
  return {
    kind: formatEntityType(hit.entity.type),
    title: hit.entity.name,
    href: `/campaigns/${campaignId}/entities/${hit.entity.id}`,
  };
}

const NO_CANON_ANSWER =
  "I couldn't find anything in this campaign's canon to answer that. Try rephrasing the question, or flesh out the relevant entities, relationships, and events first.";

/**
 * Answer a natural-language question over a campaign's canon for one user.
 * Retrieves the top-k docs the requester may see, synthesizes a cited answer
 * with the campaign's configured chat provider, and records the usage/cost.
 *
 * DM and player both supported — retrieval is role-scoped, so a player's "Ask"
 * only ever sees player-visible canon (invariant #5). Read-only: never writes
 * canon. Throws a `ServiceError` (safe message — invariant #6) for a non-member,
 * a blank/oversized question, no configured chat provider, a reached spend cap,
 * or a provider failure.
 */
export async function askCampaign(
  userId: string,
  campaignId: string,
  rawQuestion: string,
): Promise<AskResult> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership) {
    throw new ServiceError("You do not have access to this campaign.");
  }

  const question = rawQuestion.trim();
  if (!question) throw new ServiceError("Enter a question to ask the campaign.");
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new ServiceError(`Keep your question under ${MAX_QUESTION_LENGTH} characters.`);
  }

  // "Ask" needs a chat model to synthesize the answer. Full-text/keyword search
  // works with no key, but there is no answer to give without a provider — so
  // this is a clear, safe error rather than a silent degrade (the UI gates the
  // form on a configured provider, this is defense in depth).
  const provider = await resolveCampaignProvider(campaignId);
  if (!provider) {
    throw new ServiceError(
      "Add an AI provider key in Settings to ask the campaign questions.",
    );
  }

  // Honor the spend cap before doing any paid work (cap reached → throw, no
  // retrieval embed, no synthesis call).
  await assertWithinSpendCap(campaignId);

  // Retrieve the grounding canon. `searchCanon` is role-scoped and applies the
  // full two-layer visibility projection — the model only ever sees what this
  // member may see.
  const { hits } = await searchCanon(userId, campaignId, question, {
    limit: ASK_RETRIEVAL_LIMIT,
  });

  if (hits.length === 0) {
    return {
      role: membership.role,
      question,
      answer: NO_CANON_ANSWER,
      grounded: false,
      sources: [],
      model: null,
      providerId: null,
    };
  }

  // Re-check the cap before the (more expensive) synthesis call. When semantic
  // search is configured, `searchCanon` may have made and recorded a paid
  // query-embedding call above — if that pushed total spend up to the cap, the
  // chat answer must not proceed and spend past it.
  await assertWithinSpendCap(campaignId);

  // Pull the denormalized content for each hit to use as synthesis context. The
  // hits already passed the live-canon visibility projection, so their stored
  // SearchDoc content is safe to hand the model.
  const [campaign, docs] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true, styleGuide: true },
    }),
    prisma.searchDoc.findMany({
      where: {
        campaignId,
        OR: hits.map((hit) => ({ targetType: hit.targetType, targetId: hit.targetId })),
      },
      select: { targetType: true, targetId: true, content: true },
    }),
  ]);
  const contentByKey = new Map(
    docs.map((doc) => [`${doc.targetType}:${doc.targetId}`, doc.content]),
  );

  const sources: AskSource[] = [];
  const promptSources: AskSourceContext[] = [];
  hits.forEach((hit, i) => {
    const index = i + 1;
    const { kind, title, href } = describeHit(campaignId, hit);
    sources.push({
      index,
      cited: false,
      targetType: hit.targetType,
      targetId: hit.targetId,
      kind,
      label: title,
      href,
    });
    promptSources.push({
      index,
      kind,
      title,
      content: contentByKey.get(`${hit.targetType}:${hit.targetId}`) ?? "",
    });
  });

  const prompt = buildAskPrompt({
    campaignName: campaign?.name ?? "Campaign",
    styleGuide: campaign?.styleGuide,
    question,
    sources: promptSources,
    isPlayer: membership.role === Role.PLAYER,
  });

  let answer: string;
  let usageModel: string;
  let usageProviderId: string;
  try {
    const result = await provider.generate({
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: ASK_ANSWER_MAX_TOKENS,
    });
    answer = result.text.trim();
    usageModel = result.model;
    usageProviderId = result.providerId;

    // Best-effort: never lose a paid answer over a usage-tracking write.
    try {
      await recordAiUsage({
        campaignId,
        userId,
        providerId: result.providerId,
        model: result.model,
        generatorId: ASK_CAMPAIGN_GENERATOR.id,
        usage: result.usage,
      });
    } catch {
      // usage tracking is non-critical
    }
  } catch (error) {
    throw new ServiceError(describeProviderError(error));
  }

  // Map the model's inline [n] citations back to the sources it actually used.
  const citedIndices = new Set(parseCitedIndices(answer, sources.length));
  for (const source of sources) source.cited = citedIndices.has(source.index);

  return {
    role: membership.role,
    question,
    answer: answer || NO_CANON_ANSWER,
    grounded: true,
    sources,
    model: usageModel,
    providerId: usageProviderId,
  };
}
