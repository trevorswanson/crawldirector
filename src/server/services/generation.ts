import { CanonStatus, ChangeSource, OpKind, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { describeProviderError, resolveCampaignProvider } from "@/server/ai";
import { ProviderError } from "@/server/ai/types";
import {
  FLESH_ENTITY_GENERATOR,
  type FleshableField,
  buildFleshEntityPrompt,
  fleshEntityOutputSchema,
  fleshEntityToPatch,
  patchHasChanges,
} from "@/server/ai/generators/flesh-entity";
import { createPendingEntityChangeSet } from "@/server/services/review";

// AI generation orchestration (M4 — docs/04-ai-integration.md). This is the seam
// between a generator (pure prompt/schema/patch logic in `src/server/ai/
// generators`) and the review pipeline: it loads the relevant canon, calls the
// campaign's configured provider, and files the result as a PENDING proposal —
// never canon (invariant #1). Generators only ever produce proposals.

const FLESHABLE_FIELDS: FleshableField[] = ["summary", "description", "tags"];

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to generate in this campaign.");
  }
  return membership;
}

export type FleshOutEntityResult = {
  changeSetId: string;
  providerId: string;
  model: string;
};

// Flesh out an entity into a fuller summary/description/tags, filed as a PENDING
// `UPDATE_ENTITY` proposal for the DM to review. DM/co-DM only. Throws a
// ServiceError (safe message) when no provider is configured, the entity is
// locked, the provider call fails, or the model proposes nothing usable.
export async function fleshOutEntity(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<FleshOutEntityResult> {
  await assertCampaignDm(userId, campaignId);

  const [campaign, entity] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true, styleGuide: true },
    }),
    prisma.entity.findFirst({
      where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
      select: {
        version: true,
        type: true,
        name: true,
        summary: true,
        description: true,
        tags: true,
        isStub: true,
        locked: true,
        lockedFields: true,
      },
    }),
  ]);

  if (!campaign) throw new ServiceError("Campaign not found.");
  if (!entity) throw new ServiceError("Entity not found.");
  // A fully locked entity is read-only reference; AI never proposes against it
  // (invariant #2). Field-level locks are handled below by exclusion.
  if (entity.locked) {
    throw new ServiceError("This entity is locked. Unlock it before generating.");
  }

  const provider = await resolveCampaignProvider(campaignId);
  if (!provider) {
    throw new ServiceError(
      "No AI provider is configured. Add a provider key in campaign Settings first.",
    );
  }

  const lockedFields = entity.lockedFields.filter((f): f is FleshableField =>
    (FLESHABLE_FIELDS as string[]).includes(f),
  );

  // Gather existing campaign tags so the generator reuses them rather than
  // minting near-duplicates.
  const tagRows = await prisma.entity.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED }, NOT: { id: entityId } },
    select: { tags: true },
  });
  const campaignTags = Array.from(
    new Set(tagRows.flatMap((r) => r.tags)),
  ).sort();

  const { system, messages } = buildFleshEntityPrompt({
    campaignName: campaign.name,
    styleGuide: campaign.styleGuide,
    entity: {
      type: entity.type,
      name: entity.name,
      summary: entity.summary,
      description: entity.description,
      tags: entity.tags,
      isStub: entity.isStub,
    },
    campaignTags,
    lockedFields,
  });

  let output;
  try {
    const result = await provider.generateStructured({
      schemaName: "flesh_entity",
      schema: fleshEntityOutputSchema,
      system,
      messages,
      maxTokens: 2048,
    });
    output = result.data;
  } catch (error) {
    // Keep messages safe: never reflect a provider's raw free text, which (for an
    // OpenAI-compatible endpoint) could echo key-bearing config (invariant #6).
    const message =
      error instanceof ProviderError ? error.message : describeProviderError(error);
    throw new ServiceError(message);
  }

  const patch = fleshEntityToPatch(
    { version: entity.version, summary: entity.summary, description: entity.description, tags: entity.tags },
    output,
    lockedFields,
  );
  if (!patchHasChanges(patch)) {
    throw new ServiceError("The model did not propose any changes to apply.");
  }

  const changeSet = await createPendingEntityChangeSet(userId, campaignId, {
    source: ChangeSource.AI,
    title: `Flesh out ${entity.name}`,
    summary: `AI-generated draft (${provider.model}) — review before it becomes canon.`,
    providerId: provider.id,
    model: provider.model,
    promptId: FLESH_ENTITY_GENERATOR.id,
    promptVersion: FLESH_ENTITY_GENERATOR.version,
    operations: [{ op: OpKind.UPDATE_ENTITY, targetId: entityId, patch }],
  });

  return { changeSetId: changeSet.id, providerId: provider.id, model: provider.model };
}
