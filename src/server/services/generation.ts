import { CanonStatus, ChangeSource, OpKind, Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { describeProviderError, resolveCampaignProvider } from "@/server/ai";
import { ProviderError, emptyUsage, type LLMUsage } from "@/server/ai/types";
import { logActionError } from "@/server/log";
import {
  assertWithinSpendCap,
  linkAiUsageChangeSet,
  recordAiUsage,
} from "@/server/services/ai-usage";
import { withCampaignAiLock } from "@/server/services/ai-lock";
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
  type StubSpec,
} from "@/server/ai/generators/scaffold-stubs";
import { buildStubCreatePatch } from "@/server/services/entities";
import { getActiveSystemPersonaPrompt } from "@/server/services/persona";
import { isPersonaVoicedEntityType } from "@/lib/persona";
import { retrieveRelatedEntityIds } from "@/server/services/retrieval";
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
const MAX_BULK_FLESH = 20;
const SCAFFOLD_EXISTING_NAME_PROMPT_LIMIT = 80;

function entityNameKey(name: string) {
  return name.trim().toLowerCase();
}

function dropExistingNameCollisions(
  specs: StubSpec[],
  existingNames: string[],
): StubSpec[] {
  const taken = new Set(existingNames.map(entityNameKey).filter(Boolean));
  const filtered: StubSpec[] = [];
  for (const spec of specs) {
    const key = entityNameKey(spec.name);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    filtered.push(spec);
  }
  return filtered;
}

// How many entities to offer the relationship-inference generator as candidate
// edge endpoints. Retrieval picks the most relevant ones; the alphabetical
// baseline fills any remaining budget (see `inferRelationshipsForEntityLocked`).
const CANDIDATE_LIMIT = 40;

// How many related canon entities the flesh-out generator carries as read-only
// reference context. Smaller than CANDIDATE_LIMIT: this is consistency context,
// not a candidate pool, so a focused, token-cheap set of the most relevant
// entities serves better than a long list.
const FLESH_RELATED_LIMIT = 8;

const candidateSelect = {
  id: true,
  type: true,
  name: true,
  summary: true,
  description: true,
  tags: true,
} satisfies Prisma.EntitySelect;

type CandidateRow = Prisma.EntityGetPayload<{ select: typeof candidateSelect }>;

export type BulkFleshOutcome = {
  entityId: string;
  entityName: string;
  status: "proposed" | "skipped";
  changeSetId?: string;
  detail?: string;
};

export type BulkFleshResult = {
  outcomes: BulkFleshOutcome[];
  proposedCount: number;
  skippedCount: number;
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

  return withCampaignAiLock(campaignId, () =>
    fleshOutEntityLocked(userId, campaignId, entityId),
  );
}

async function fleshOutEntityLocked(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<FleshOutEntityResult> {
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

  // Build context: (1) the relevant slice of surrounding canon via retrieval, so
  // the model's additions stay consistent with the world instead of being written
  // in isolation (M5 slice 6 — docs/07-search-retrieval.md §"Retrieval-augmented
  // context"); and (2) existing campaign tags so it reuses them rather than
  // minting near-duplicates. Retrieval reuses `searchCanon`, so it is scoped to
  // the DM's full canon and degrades to full-text when no embedder is configured.
  // Unlike relationship inference, locked entities are intentionally KEPT as
  // reference here (doc 07: locked items relevant to the task are included as
  // read-only "do not modify" context) — flesh-out only ever proposes against its
  // own target, so referencing locked canon can't violate invariant #2.
  const [relatedIds, tagRows] = await Promise.all([
    retrieveRelatedEntityIds(
      userId,
      campaignId,
      { id: entityId, name: entity.name, tags: entity.tags },
      { limit: FLESH_RELATED_LIMIT },
    ),
    prisma.entity.findMany({
      where: { campaignId, status: { not: CanonStatus.ARCHIVED }, NOT: { id: entityId } },
      select: { tags: true },
    }),
  ]);
  const campaignTags = Array.from(
    new Set(tagRows.flatMap((r) => r.tags)),
  ).sort();

  const relatedRows =
    relatedIds.length === 0
      ? []
      : await prisma.entity.findMany({
          where: { id: { in: relatedIds }, campaignId, status: CanonStatus.CANON },
          select: { id: true, type: true, name: true, summary: true, description: true, tags: true },
        });
  // findMany doesn't guarantee order; restore retrieval's relevance ranking.
  const relatedById = new Map(relatedRows.map((r) => [r.id, r] as const));
  const relatedCanon = relatedIds
    .map((id) => relatedById.get(id))
    .filter((r): r is (typeof relatedRows)[number] => r !== undefined)
    .map((r) => ({
      type: r.type,
      name: r.name,
      summary: r.summary,
      description: r.description,
      tags: r.tags,
    }));

  // Re-check the cap after retrieval: with an embedding-capable key, searchCanon
  // spent (and recorded) a paid query-embedding above, which can bring known
  // spend to the cap. The early check ran before retrieval, so without this a
  // campaign just under its cap could still incur the extra paid generation call.
  // (Mirrors inferRelationshipsForEntityLocked.)
  await assertWithinSpendCap(campaignId);

  // M6 persona injection (docs/05): for dungeon-voiced kinds, flesh out in the
  // active System AI persona's current voice. `getActiveSystemPersonaPrompt` is
  // DM-scoped (we already asserted DM above) and returns null when no active
  // System AI persona exists, so non-persona campaigns are unaffected.
  const activePersona = isPersonaVoicedEntityType(entity.type)
    ? await getActiveSystemPersonaPrompt(userId, campaignId)
    : null;

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
    relatedCanon,
    lockedFields,
    personaPrompt: activePersona?.prompt ?? null,
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
    // Log the real error server-side first so a failing BYO setup is diagnosable
    // behind the vague user message — walking the `.cause` chain surfaces the
    // network errno, and the provider's redactor scrubs the decrypted key.
    logActionError(`Flesh-entity generation failed (provider=${provider.id})`, error, provider.redactSecrets);
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
    personaSnapshotId: activePersona?.snapshotId,
    personaPromptVersion: activePersona?.version,
    operations: [{ op: OpKind.UPDATE_ENTITY, targetId: entityId, patch }],
  });

  await linkAiUsageChangeSet(usageRow.id, changeSet.id);

  return { changeSetId: changeSet.id, providerId: provider.id, model: provider.model };
}

// Flesh out several entities in one bulk run — the multi-entity counterpart to
// `fleshOutEntity`. Each selected entity is fleshed independently and lands as
// its own PENDING `UPDATE_ENTITY` proposal (so the DM reviews them one by one),
// and one entity's failure (locked, no usable change) never blocks the others.
// This slice is synchronous; an async `Job` worker for long batches stays a
// later M4 slice. DM/co-DM only. Throws a ServiceError (safe message) only for
// whole-batch problems (bad selection, no provider configured).
// NOT wrapped in withCampaignAiLock — each per-entity fleshOutEntity call
// acquires the lock independently, giving correct interleaving between a bulk
// run and other concurrent single-entity runs. Wrapping here too would deadlock
// on the first entity (re-entrancy is not supported).
export async function fleshOutEntities(
  userId: string,
  campaignId: string,
  entityIds: string[],
): Promise<BulkFleshResult> {
  await assertCampaignDm(userId, campaignId);

  // Normalize the selection: drop blanks, dedupe (order-preserving), bound the batch.
  const ids = Array.from(new Set(entityIds.map((value) => value.trim()).filter(Boolean)));
  if (ids.length === 0) {
    throw new ServiceError("Select at least one entity to flesh out.");
  }
  if (ids.length > MAX_BULK_FLESH) {
    throw new ServiceError(`You can flesh out at most ${MAX_BULK_FLESH} entities at once.`);
  }

  // Resolve the provider once so a missing key fails the whole batch with one
  // clear message instead of repeating per entity.
  const provider = await resolveCampaignProvider(campaignId);
  if (!provider) {
    throw new ServiceError(
      "No AI provider is configured. Add a provider key in campaign Settings first.",
    );
  }

  // Names up front so every outcome — including ids that vanished between the
  // page load and submit — can be labelled.
  const rows = await prisma.entity.findMany({
    where: { id: { in: ids }, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, name: true },
  });
  const nameById = new Map(rows.map((row) => [row.id, row.name] as const));

  const outcomes: BulkFleshOutcome[] = [];
  let capReached = false;
  for (const entityId of ids) {
    const entityName = nameById.get(entityId);
    if (!entityName) {
      outcomes.push({
        entityId,
        entityName: "(unknown entity)",
        status: "skipped",
        detail: "Entity not found.",
      });
      continue;
    }
    if (capReached) {
      outcomes.push({ entityId, entityName, status: "skipped", detail: "Spend cap reached." });
      continue;
    }
    // Stop spending once the cap is hit; mark this entity and the rest as
    // skipped rather than making more (no-op) provider calls.
    try {
      await assertWithinSpendCap(campaignId);
    } catch (error) {
      capReached = true;
      outcomes.push({
        entityId,
        entityName,
        status: "skipped",
        detail: error instanceof ServiceError ? error.message : "Spend cap reached.",
      });
      continue;
    }
    try {
      const result = await fleshOutEntity(userId, campaignId, entityId);
      outcomes.push({ entityId, entityName, status: "proposed", changeSetId: result.changeSetId });
    } catch (error) {
      // Per-entity failures (locked, no usable change, a transient provider
      // error) are recorded and the run continues. Messages are already safe
      // ServiceError text (no key/raw provider output — invariant #6).
      outcomes.push({
        entityId,
        entityName,
        status: "skipped",
        detail: error instanceof ServiceError ? error.message : "Generation failed.",
      });
    }
  }

  const proposedCount = outcomes.filter((outcome) => outcome.status === "proposed").length;
  return {
    outcomes,
    proposedCount,
    skippedCount: outcomes.length - proposedCount,
    model: provider.model,
  };
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

  return withCampaignAiLock(campaignId, () =>
    inferRelationshipsForEntityLocked(userId, campaignId, entityId),
  );
}

async function inferRelationshipsForEntityLocked(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<InferRelationshipsResult> {
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

  // Build the candidate set via retrieval rather than an arbitrary alphabetical
  // slice (M5 slice 6 — docs/07-search-retrieval.md §"Retrieval-augmented
  // context"). At DCC's scale the entities actually related to the target rarely
  // fall in the first N alphabetically; `retrieveRelatedEntityIds` surfaces them
  // by keyword + semantic similarity, scoped to the DM's full canon (degrading to
  // full-text when no embedder is configured). We still fetch an alphabetical
  // baseline so the model always has candidates and a small campaign keeps full
  // coverage — retrieval just orders the relevant entities first and guarantees
  // they're inside the window even when the campaign is large.
  const [relevantIds, existing, pendingCreates] = await Promise.all([
    retrieveRelatedEntityIds(
      userId,
      campaignId,
      { id: target.id, name: target.name, tags: target.tags },
      { limit: CANDIDATE_LIMIT },
    ),
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

  // Hydrate candidate details. Locked endpoints stay out of the proposable set
  // (invariant #2 — AI never modifies locked targets); the baseline is the old
  // alphabetical query, kept as a coverage floor so retrieval is purely additive.
  const [relevantPool, baseline] = await Promise.all([
    relevantIds.length === 0
      ? Promise.resolve([] as CandidateRow[])
      : prisma.entity.findMany({
          where: { id: { in: relevantIds }, campaignId, status: CanonStatus.CANON, locked: false },
          select: candidateSelect,
        }),
    prisma.entity.findMany({
      where: { campaignId, status: CanonStatus.CANON, locked: false, id: { not: entityId } },
      orderBy: [{ name: "asc" }],
      take: CANDIDATE_LIMIT,
      select: candidateSelect,
    }),
  ]);

  // Relevant entities first (in rank order), then the alphabetical baseline fills
  // the remaining budget; dedupe and cap so the window stays bounded.
  const relevantById = new Map(relevantPool.map((entity) => [entity.id, entity] as const));
  const seenCandidates = new Set<string>();
  const candidates: CandidateRow[] = [];
  const pushCandidate = (entity: CandidateRow | undefined) => {
    if (!entity || seenCandidates.has(entity.id) || candidates.length >= CANDIDATE_LIMIT) return;
    seenCandidates.add(entity.id);
    candidates.push(entity);
  };
  for (const id of relevantIds) pushCandidate(relevantById.get(id));
  for (const entity of baseline) pushCandidate(entity);

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

  // Re-check the cap before the chat call: retrieval above may have spent (and
  // recorded) a paid query-embedding when the campaign has an embedding-capable
  // key, which can bring known spend to the cap. The early check happens before
  // retrieval, so without this a campaign just under its cap could still incur an
  // extra paid generation call.
  await assertWithinSpendCap(campaignId);

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
    logActionError(`Infer-relationships generation failed (provider=${provider.id})`, error, provider.redactSecrets);
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

  return withCampaignAiLock(campaignId, () =>
    scaffoldStubEntitiesLocked(userId, campaignId, trimmed),
  );
}

async function scaffoldStubEntitiesLocked(
  userId: string,
  campaignId: string,
  trimmed: string,
): Promise<ScaffoldStubsResult> {
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

  // Existing entity names are kept in full for service-side collision filtering,
  // while the prompt receives only a bounded sample so large campaigns do not
  // spend unbounded tokens just listing canon names.
  const existing = await prisma.entity.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { name: true, tags: true },
    orderBy: { name: "asc" },
  });
  const existingNames = existing.map((e) => e.name);
  const promptExistingNames = existingNames.slice(0, SCAFFOLD_EXISTING_NAME_PROMPT_LIMIT);
  const campaignTags = Array.from(new Set(existing.flatMap((e) => e.tags))).sort();

  const context = {
    campaignName: campaign.name,
    styleGuide: campaign.styleGuide,
    instruction: trimmed,
    existingNames: promptExistingNames,
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
    logActionError(`Scaffold-stubs generation failed (provider=${provider.id})`, error, provider.redactSecrets);
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

  const specs = dropExistingNameCollisions(
    scaffoldStubsToSpecs(context, output),
    existingNames,
  );
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
