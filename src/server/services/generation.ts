import { CanonStatus, ChangeSource, OpKind, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { describeProviderError, resolveCampaignProvider } from "@/server/ai";
import { ProviderError, emptyUsage, type LLMUsage } from "@/server/ai/types";
import {
  assertWithinSpendCap,
  linkAiUsageChangeSet,
  recordAiUsage,
} from "@/server/services/ai-usage";
import {
  FLESH_ENTITY_GENERATOR,
  type FleshableField,
  buildFleshEntityPrompt,
  fleshEntityOutputSchema,
  fleshEntityToPatch,
  patchHasChanges,
} from "@/server/ai/generators/flesh-entity";
import {
  INFER_RELATIONSHIPS_GENERATOR,
  buildInferRelationshipsPrompt,
  inferRelationshipOutputSchema,
  inferenceToRelationshipOperations,
  type InferRelationshipExistingEdge,
} from "@/server/ai/generators/infer-relationships";
import {
  SCAFFOLD_STUBS_GENERATOR,
  buildScaffoldStubsPrompt,
  scaffoldStubsOutputSchema,
  scaffoldStubsToSpecs,
} from "@/server/ai/generators/scaffold-stubs";
import { buildStubCreatePatch } from "@/server/services/entities";
import {
  createPendingEntityChangeSet,
  createPendingRelationshipChangeSet,
} from "@/server/services/review";

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

export type InferRelationshipsResult = {
  changeSetId: string;
  providerId: string;
  model: string;
  operationCount: number;
};

export type ScaffoldStubsResult = {
  changeSetId: string;
  providerId: string;
  model: string;
  stubCount: number;
};

const MAX_SCAFFOLD_INSTRUCTION = 2000;

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

  await assertWithinSpendCap(campaignId);

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
  let usage: LLMUsage = emptyUsage();
  try {
    const result = await provider.generateStructured({
      schemaName: "flesh_entity",
      schema: fleshEntityOutputSchema,
      system,
      messages,
      maxTokens: 2048,
    });
    output = result.data;
    usage = result.usage ?? usage;
  } catch (error) {
    // Keep messages safe: never reflect a provider's raw free text, which (for an
    // OpenAI-compatible endpoint) could echo key-bearing config (invariant #6).
    const message =
      error instanceof ProviderError ? error.message : describeProviderError(error);
    throw new ServiceError(message);
  }

  // The provider call spent tokens — record usage now, before any no-op check can
  // throw, so a paid-but-no-op run still appears in spend and counts toward the cap.
  const usageRow = await recordAiUsage({
    campaignId,
    userId,
    providerId: provider.id,
    model: provider.model,
    generatorId: FLESH_ENTITY_GENERATOR.id,
    usage,
  });

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

  await linkAiUsageChangeSet(usageRow.id, changeSet.id);

  return { changeSetId: changeSet.id, providerId: provider.id, model: provider.model };
}

// Infer new relationships involving one existing entity and file them as a
// PENDING `CREATE_RELATIONSHIP` proposal set. This synchronous slice is scoped
// to the entity detail rail; bulk/async jobs remain a later M4 slice.
export async function inferRelationshipsForEntity(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<InferRelationshipsResult> {
  await assertCampaignDm(userId, campaignId);

  const [campaign, target] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true, styleGuide: true },
    }),
    prisma.entity.findFirst({
      where: { id: entityId, campaignId, status: CanonStatus.CANON },
      select: {
        id: true,
        type: true,
        name: true,
        summary: true,
        description: true,
        tags: true,
        locked: true,
      },
    }),
  ]);
  if (!campaign) throw new ServiceError("Campaign not found.");
  if (!target) throw new ServiceError("Entity not found.");
  if (target.locked) {
    throw new ServiceError("This entity is locked. Unlock it before generating.");
  }

  const provider = await resolveCampaignProvider(campaignId);
  if (!provider) {
    throw new ServiceError(
      "No AI provider is configured. Add a provider key in campaign Settings first.",
    );
  }

  await assertWithinSpendCap(campaignId);

  const [candidates, existing, pendingCreates] = await Promise.all([
    prisma.entity.findMany({
      where: {
        campaignId,
        status: CanonStatus.CANON,
        locked: false,
        id: { not: entityId },
      },
      orderBy: [{ name: "asc" }],
      take: 40,
      select: {
        id: true,
        type: true,
        name: true,
        summary: true,
        description: true,
        tags: true,
      },
    }),
    prisma.relationship.findMany({
      where: {
        campaignId,
        status: { not: CanonStatus.ARCHIVED },
        OR: [{ sourceId: entityId }, { targetId: entityId }],
      },
      select: {
        type: true,
        sourceId: true,
        targetId: true,
        sourceEntity: { select: { name: true } },
        targetEntity: { select: { name: true } },
      },
    }),
    prisma.changeOperation.findMany({
      where: {
        targetType: "RELATIONSHIP",
        op: "CREATE_RELATIONSHIP",
        decision: { not: "REJECTED" },
        changeSet: {
          campaignId,
          status: "PENDING",
        },
      },
      select: {
        patch: true,
        editedPatch: true,
        decision: true,
      },
    }),
  ]);

  if (candidates.length === 0) {
    throw new ServiceError("Add at least one other canon entity before inferring relationships.");
  }

  const entityNameById = new Map([
    [target.id, target.name],
    ...candidates.map((candidate) => [candidate.id, candidate.name] as const),
  ]);
  const pendingExisting = pendingCreates
    .map((operation) =>
      relationshipCreatePatchToExistingEdge(
        operation.decision === "EDITED" && operation.editedPatch
          ? operation.editedPatch
          : operation.patch,
        entityNameById,
      ),
    )
    .filter((edge): edge is InferRelationshipExistingEdge => {
      if (!edge) return false;
      return edge.sourceId === entityId || edge.targetId === entityId;
    });

  const context = {
    campaignName: campaign.name,
    styleGuide: campaign.styleGuide,
    target,
    candidates,
    existingRelationships: [
      ...existing.map(
        (edge): InferRelationshipExistingEdge => ({
          sourceId: edge.sourceId,
          sourceName: edge.sourceEntity.name,
          targetId: edge.targetId,
          targetName: edge.targetEntity.name,
          type: edge.type,
        }),
      ),
      ...pendingExisting,
    ],
  };
  const { system, messages } = buildInferRelationshipsPrompt(context);

  let output;
  let usage: LLMUsage = emptyUsage();
  try {
    const result = await provider.generateStructured({
      schemaName: "infer_relationships",
      schema: inferRelationshipOutputSchema,
      system,
      messages,
      maxTokens: 2048,
    });
    output = result.data;
    usage = result.usage ?? usage;
  } catch (error) {
    const message =
      error instanceof ProviderError ? error.message : describeProviderError(error);
    throw new ServiceError(message);
  }

  // Record usage before the no-op check so a paid run that yields no usable
  // relationships still counts toward spend + the cap.
  const usageRow = await recordAiUsage({
    campaignId,
    userId,
    providerId: provider.id,
    model: provider.model,
    generatorId: INFER_RELATIONSHIPS_GENERATOR.id,
    usage,
  });

  const operations = inferenceToRelationshipOperations(context, output);
  if (operations.length === 0) {
    throw new ServiceError("The model did not propose any usable relationships.");
  }

  const changeSet = await createPendingRelationshipChangeSet(userId, campaignId, {
    source: ChangeSource.AI,
    title: `Infer relationships for ${target.name}`,
    summary: `AI-inferred relationship proposals (${provider.model}) — review before they become canon.`,
    providerId: provider.id,
    model: provider.model,
    promptId: INFER_RELATIONSHIPS_GENERATOR.id,
    promptVersion: INFER_RELATIONSHIPS_GENERATOR.version,
    operations,
  });

  await linkAiUsageChangeSet(usageRow.id, changeSet.id);

  return {
    changeSetId: changeSet.id,
    providerId: provider.id,
    model: provider.model,
    operationCount: operations.length,
  };
}

// Scaffold a batch of thin stub entities from a DM's free-text instruction,
// filed as a single PENDING change set of `CREATE_ENTITY` proposals — never
// canon (invariant #1). DM/co-DM only. Throws a ServiceError (safe message) when
// the instruction is empty, no provider is configured, the provider call fails,
// or the model proposes nothing usable.
export async function scaffoldStubEntities(
  userId: string,
  campaignId: string,
  instruction: string,
): Promise<ScaffoldStubsResult> {
  await assertCampaignDm(userId, campaignId);

  const trimmed = instruction.trim();
  if (!trimmed) {
    throw new ServiceError("Describe what you'd like to scaffold first.");
  }
  if (trimmed.length > MAX_SCAFFOLD_INSTRUCTION) {
    throw new ServiceError("That instruction is too long. Trim it and try again.");
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true, styleGuide: true },
  });
  if (!campaign) throw new ServiceError("Campaign not found.");

  const provider = await resolveCampaignProvider(campaignId);
  if (!provider) {
    throw new ServiceError(
      "No AI provider is configured. Add a provider key in campaign Settings first.",
    );
  }

  await assertWithinSpendCap(campaignId);

  // Existing entity names (to dedupe against) and campaign tags (to encourage
  // reuse), scoped to live (non-archived) canon.
  const existing = await prisma.entity.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { name: true, tags: true },
    orderBy: { name: "asc" },
  });
  const existingNames = existing.map((e) => e.name);
  const campaignTags = Array.from(new Set(existing.flatMap((e) => e.tags))).sort();

  const context = {
    campaignName: campaign.name,
    styleGuide: campaign.styleGuide,
    instruction: trimmed,
    existingNames,
    campaignTags,
  };
  const { system, messages } = buildScaffoldStubsPrompt(context);

  let output;
  let usage: LLMUsage = emptyUsage();
  try {
    const result = await provider.generateStructured({
      schemaName: "scaffold_stubs",
      schema: scaffoldStubsOutputSchema,
      system,
      messages,
      maxTokens: 2048,
    });
    output = result.data;
    usage = result.usage ?? usage;
  } catch (error) {
    // Keep messages safe: never reflect a provider's raw free text (invariant #6).
    const message =
      error instanceof ProviderError ? error.message : describeProviderError(error);
    throw new ServiceError(message);
  }

  // Record usage before the no-op check so a paid run that yields no usable stubs
  // still counts toward spend + the cap.
  const usageRow = await recordAiUsage({
    campaignId,
    userId,
    providerId: provider.id,
    model: provider.model,
    generatorId: SCAFFOLD_STUBS_GENERATOR.id,
    usage,
  });

  const specs = scaffoldStubsToSpecs(context, output);
  if (specs.length === 0) {
    throw new ServiceError("The model did not propose any usable new entities.");
  }

  const changeSet = await createPendingEntityChangeSet(userId, campaignId, {
    source: ChangeSource.AI,
    title: `Scaffold ${specs.length} stub${specs.length === 1 ? "" : "s"}`,
    summary: `AI-scaffolded stub entities (${provider.model}) — review before they become canon.`,
    providerId: provider.id,
    model: provider.model,
    promptId: SCAFFOLD_STUBS_GENERATOR.id,
    promptVersion: SCAFFOLD_STUBS_GENERATOR.version,
    operations: specs.map((spec) => ({
      op: OpKind.CREATE_ENTITY,
      patch: buildStubCreatePatch(userId, campaignId, spec),
    })),
  });

  await linkAiUsageChangeSet(usageRow.id, changeSet.id);

  return {
    changeSetId: changeSet.id,
    providerId: provider.id,
    model: provider.model,
    stubCount: specs.length,
  };
}

function relationshipCreatePatchToExistingEdge(
  rawPatch: unknown,
  entityNameById: Map<string, string>,
): InferRelationshipExistingEdge | null {
  if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) return null;
  const patch = rawPatch as Record<string, { to?: unknown }>;
  const sourceId = patch.sourceId?.to;
  const targetId = patch.targetId?.to;
  const type = patch.type?.to;
  if (typeof sourceId !== "string" || typeof targetId !== "string" || typeof type !== "string") {
    return null;
  }

  const sourceName = entityNameById.get(sourceId);
  const targetName = entityNameById.get(targetId);
  if (!sourceName || !targetName) return null;

  return {
    sourceId,
    sourceName,
    targetId,
    targetName,
    type: type as InferRelationshipExistingEdge["type"],
  };
}
