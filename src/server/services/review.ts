import {
  CanonStatus,
  ChangeSetStatus,
  ChangeSource,
  EntityType,
  EventParticipantRole,
  OpDecision,
  OpKind,
  Prisma,
  RelationshipType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import {
  allKindDataKeys,
  allSatelliteDataKeys,
  buildKindData,
  dataKeysFor,
  normalizeKindFieldValue,
  readKindData,
  RESERVED_DATA_KEY,
  satelliteRowOf,
  schemaVersionFor,
} from "@/lib/entity-kinds";
import { ServiceError } from "@/lib/errors";
import { readFloorData, type FloorData } from "@/lib/floor";
import {
  eventEffectKindValues,
  eventEffectKindMeta,
  eventEffectRequiresTarget,
  type EventEffectKind,
} from "@/lib/event-effect-kinds";
import { eventEffectSchema, sanitizeImageUrl } from "@/lib/validation";
import {
  clampPersonaDial,
  compilePersonaPrompt,
  normalizePersonaDials,
  PERSONA_DIAL_KEYS,
} from "@/lib/persona";
import { buildCampaignResolveContext } from "@/server/services/event-resolve-context";
import { generateRankBetween } from "@/lib/rank";
import {
  resolveAbsoluteDay,
  type ResolveContext,
} from "@/lib/time-resolve";
import { floorRelativeSortKey, readTimeRef } from "@/lib/time-ref";
import { prisma } from "@/server/db";
import {
  indexEntity,
  indexEvent,
  indexRelationship,
} from "@/server/services/search-index";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ReviewPatch = Record<
  string,
  {
    from?: JsonValue;
    to?: JsonValue;
  }
>;

export type EntityReviewOperationInput = {
  op: "CREATE_ENTITY" | "UPDATE_ENTITY" | "DELETE_ENTITY";
  targetId?: string;
  patch: ReviewPatch;
};

export type RelationshipReviewOperationInput = {
  op: "CREATE_RELATIONSHIP" | "UPDATE_RELATIONSHIP" | "DELETE_RELATIONSHIP";
  targetId?: string;
  patch: ReviewPatch;
};

export type EventReviewOperationInput = {
  op:
    | "CREATE_EVENT"
    | "UPDATE_EVENT"
    | "CREATE_EVENT_CAUSALITY"
    | "DELETE_EVENT_CAUSALITY"
    | "APPLY_EVENT_EFFECTS";
  targetId?: string;
  patch: ReviewPatch;
};

export type PersonaReviewOperationInput = {
  op: "CREATE_PERSONA_SNAPSHOT" | "UPDATE_PERSONA_SNAPSHOT";
  targetId?: string;
  patch: ReviewPatch;
};

export type ChangeOperationDecisionInput =
  | { decision: "PENDING" | "ACCEPTED" | "REJECTED"; editedPatch?: never }
  | { decision: "EDITED"; editedPatch: ReviewPatch };

export type ReviewFieldDecision = "ACCEPTED" | "REJECTED";

export type ChangeOperationFieldDecisionInput = {
  field: string;
  decision: ReviewFieldDecision | "PENDING";
  editedValue?: ReviewPatch[string];
};

export type ReviewEffectPreview = {
  id: string;
  targetEntityId: string;
  before: number | boolean | null;
  after: number | boolean | null;
};

export type ReviewQueueOperation =
  Prisma.ChangeOperationGetPayload<object> & {
    targetLabel: string | null;
    targetEntityType: string | null;
    targetLocked: boolean;
    lockedFields: string[];
    currentValues: Record<string, unknown>;
    effectPreviews: ReviewEffectPreview[];
  };

export type ReviewQueueItem = Omit<
  Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  "operations"
> & {
  operations: ReviewQueueOperation[];
};

const crawlerFields = new Set([
  "crawler.realName",
  "crawler.crawlerNo",
  "crawler.level",
  "crawler.hp",
  "crawler.mp",
  "crawler.gold",
  "crawler.viewCount",
  "crawler.followerCount",
  "crawler.favoriteCount",
  "crawler.killCount",
  "crawler.isAlive",
  "crawler.currentFloor",
]);

// Reviewable/lockable type-specific fields, derived wholesale from the
// entity-kind registry (ADR 0009 slice 2): every registered kind's bespoke
// `data.*` fields are reviewable/lockable, so the set can no longer drift from
// the schemas and a new field is never silently un-reviewable.
const dataFields = new Set(
  allKindDataKeys().map((key) => `data.${key}`),
);

// The subset of `data.*` fields physically stored in a 1:1 satellite table
// (ADR 0011 Part C), not the `Entity.data` JSON blob. They are still reviewable/
// lockable `data.*` canon — the apply path routes them to the satellite and keeps
// them out of the blob; reads merge the satellite back in via `readKindData`.
const satelliteDataFields = new Set(
  allSatelliteDataKeys().map((key) => `data.${key}`),
);

// Reusable select for the FLOOR satellite (ADR 0011 Part C), so every floor
// reader in this module loads the same columns and resolves floor data through
// `readFloorData(data, floor)` across the migration transition.
const floorSatelliteSelect = {
  select: { floorNumber: true, theme: true, startDay: true, collapseDay: true },
} as const;

function typeDataFields(type: string): Set<string> {
  return new Set(dataKeysFor(type).map((key) => `data.${key}`));
}

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
}

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to review this campaign.");
  }
  return membership;
}

function readTo(patch: ReviewPatch, field: string) {
  return patch[field]?.to;
}

function restoresArchivedStatus(patch: ReviewPatch) {
  return readTo(patch, "status") === CanonStatus.CANON;
}

function nullableString(value: JsonValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: JsonValue | undefined) {
  return typeof value === "number" ? value : null;
}

function readPersistedFloorDataWithoutMigrations(
  value: unknown,
  satellite?: unknown,
): FloorData {
  const blob =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  // Once a FLOOR is satellite-backed (ADR 0011 Part C) its anchors are typed Int
  // columns, the authoritative persisted shape — so read them from the satellite
  // (no migration ambiguity to detect). A pre-migration floor (no satellite row)
  // reads the raw blob, preserving the slice-2 string→number "storage resolved"
  // detection the rank rebuild depends on.
  const sat =
    satellite && typeof satellite === "object" && !Array.isArray(satellite)
      ? (satellite as Record<string, unknown>)
      : null;
  const data = sat ?? blob;
  return {
    floorNumber: typeof data.floorNumber === "number" ? data.floorNumber : null,
    theme: typeof data.theme === "string" && data.theme.length > 0 ? data.theme : null,
    startDay: typeof data.startDay === "number" ? data.startDay : null,
    collapseDay: typeof data.collapseDay === "number" ? data.collapseDay : null,
  };
}

/**
 * Floor number is the campaign-unique canonical key for a floor (ADR 0008 §1).
 * It lives in `Entity.data` (JSON), so it can't be a DB unique constraint — the
 * applier enforces it: a second live FLOOR entity claiming a taken number is a
 * validation error, reversing the soft "first wins" behavior of ADR 0005.
 */
async function assertFloorNumberAvailable(
  tx: Prisma.TransactionClient,
  campaignId: string,
  floorNumber: number,
  excludeEntityId?: string,
) {
  const floors = await tx.entity.findMany({
    where: {
      campaignId,
      type: EntityType.FLOOR,
      status: { not: CanonStatus.ARCHIVED },
      ...(excludeEntityId ? { id: { not: excludeEntityId } } : {}),
    },
    // floorNumber lives in the Floor satellite once migrated (ADR 0011 Part C);
    // read it through the satellite-aware seam so the uniqueness check stays
    // correct across a mixed migration state (some floors still blob-backed).
    select: { id: true, name: true, data: true, floor: floorSatelliteSelect },
  });
  const clash = floors.find(
    (floor) => readFloorData(floor.data, floor.floor).floorNumber === floorNumber,
  );
  if (clash) {
    throw new ServiceError(
      `Floor number ${floorNumber} is already used by “${clash.name}”. Floor numbers must be unique within a campaign.`,
    );
  }
}

function relationshipDayBound(
  value: JsonValue | undefined,
  label: "Since day" | "Until day",
) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ServiceError(`${label} must be a whole number.`);
  }
  if (value < 0) {
    throw new ServiceError(`${label} cannot be negative.`);
  }
  return value;
}

function validateRelationshipDayBounds(
  sinceDay: number | null,
  untilDay: number | null,
) {
  if (sinceDay !== null && untilDay !== null && sinceDay > untilDay) {
    throw new ServiceError("Since day must be before or equal to until day.");
  }
}

function numberWithDefault(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function booleanWithDefault(value: JsonValue | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: JsonValue | undefined) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function bigintWithDefault(value: JsonValue | undefined, fallback: bigint) {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return fallback;
}

function baseVersionsObject(baseVersions: Prisma.JsonValue): Record<string, number> {
  if (!baseVersions || typeof baseVersions !== "object" || Array.isArray(baseVersions)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(baseVersions)) {
    if (typeof value === "number") result[key] = value;
  }
  return result;
}

function patchFields(patch: ReviewPatch) {
  return Object.keys(patch).filter((field) => field !== "campaignId");
}

function reviewablePatchFields(patch: ReviewPatch) {
  return patchFields(patch).filter((field) => field !== "_baseVersion");
}

function readFieldDecisions(value: Prisma.JsonValue): Record<string, ReviewFieldDecision> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const decisions: Record<string, ReviewFieldDecision> = {};
  for (const [field, decision] of Object.entries(value)) {
    if (decision === "ACCEPTED" || decision === "REJECTED") {
      decisions[field] = decision;
    }
  }
  return decisions;
}

function operationFieldDecisions(
  operation: Pick<
    Prisma.ChangeOperationGetPayload<object>,
    "decision" | "editedPatch" | "fieldDecisions" | "patch"
  >,
) {
  const persisted = readFieldDecisions(operation.fieldDecisions);
  if (Object.keys(persisted).length > 0) return persisted;

  const fields = reviewablePatchFields(operation.patch as ReviewPatch);
  if (operation.decision === OpDecision.ACCEPTED) {
    return Object.fromEntries(fields.map((field) => [field, "ACCEPTED"])) as Record<
      string,
      ReviewFieldDecision
    >;
  }
  if (operation.decision === OpDecision.REJECTED) {
    return Object.fromEntries(fields.map((field) => [field, "REJECTED"])) as Record<
      string,
      ReviewFieldDecision
    >;
  }
  if (operation.decision === OpDecision.EDITED && operation.editedPatch) {
    const accepted = new Set(reviewablePatchFields(operation.editedPatch as ReviewPatch));
    return Object.fromEntries(
      fields.map((field) => [field, accepted.has(field) ? "ACCEPTED" : "REJECTED"]),
    ) as Record<string, ReviewFieldDecision>;
  }
  return {};
}

function effectiveOperationPatch(
  operation: Pick<
    Prisma.ChangeOperationGetPayload<object>,
    "decision" | "editedPatch" | "fieldDecisions" | "patch"
  >,
) {
  if (operation.decision !== OpDecision.EDITED) {
    const originalPatch = operation.patch as ReviewPatch;
    if (operation.decision !== OpDecision.PENDING) return originalPatch;
    const rejectedFields = new Set(
      Object.entries(readFieldDecisions(operation.fieldDecisions))
        .filter(([, decision]) => decision === "REJECTED")
        .map(([field]) => field),
    );
    if (rejectedFields.size === 0) return originalPatch;
    return Object.fromEntries(
      Object.entries(originalPatch).filter(
        ([field]) => field === "_baseVersion" || !rejectedFields.has(field),
      ),
    ) as ReviewPatch;
  }
  const originalPatch = operation.patch as ReviewPatch;
  const editedPatch = operation.editedPatch as ReviewPatch | null;
  if (!editedPatch) return originalPatch;
  return {
    ...("_baseVersion" in originalPatch
      ? { _baseVersion: originalPatch._baseVersion }
      : {}),
    ...editedPatch,
  };
}

function bulkApprovedOperationData(
  operation: Prisma.ChangeOperationGetPayload<object>,
) {
  const originalPatch = operation.patch as ReviewPatch;
  const fields = reviewablePatchFields(originalPatch);
  const existingDecisions = operationFieldDecisions(operation);
  const rejectedFields = new Set(
    fields.filter((field) => existingDecisions[field] === "REJECTED"),
  );
  if (rejectedFields.size === 0 && operation.decision !== OpDecision.EDITED) {
    return {
      decision: OpDecision.ACCEPTED,
      editedPatch: Prisma.DbNull,
      fieldDecisions:
        Object.keys(existingDecisions).length > 0
          ? (Object.fromEntries(
              fields.map((field) => [field, "ACCEPTED"]),
            ) as Prisma.InputJsonValue)
          : undefined,
    };
  }

  const priorEdits = operation.editedPatch as ReviewPatch | null;
  const acceptedPatch: ReviewPatch = {};
  for (const field of fields) {
    if (rejectedFields.has(field)) continue;
    acceptedPatch[field] = priorEdits?.[field] ?? originalPatch[field];
  }
  return {
    decision: OpDecision.EDITED,
    editedPatch: acceptedPatch as Prisma.InputJsonValue,
    fieldDecisions: Object.fromEntries(
      fields.map((field) => [
        field,
        rejectedFields.has(field) ? "REJECTED" : "ACCEPTED",
      ]),
    ) as Prisma.InputJsonValue,
  };
}

type OperationDecisionSnapshot = Pick<
  Prisma.ChangeOperationGetPayload<object>,
  "id" | "decision" | "editedPatch" | "fieldDecisions"
>;

async function restoreOperationDecisions(
  snapshots: OperationDecisionSnapshot[],
): Promise<void> {
  for (const snapshot of snapshots) {
    await prisma.changeOperation.update({
      where: { id: snapshot.id },
      data: {
        decision: snapshot.decision,
        editedPatch:
          snapshot.editedPatch === null
            ? Prisma.DbNull
            : (snapshot.editedPatch as Prisma.InputJsonValue),
        fieldDecisions: snapshot.fieldDecisions as Prisma.InputJsonValue,
      },
    });
  }
}

function lockedPatchFields(
  patch: ReviewPatch,
  locked: boolean,
  lockedFields: string[],
) {
  const fields = patchFields(patch);
  if (locked) return fields;
  return fields.filter((field) => lockedFields.includes(field));
}

async function evaluateEntityOperationFlags(
  tx: Prisma.TransactionClient,
  operation: EntityReviewOperationInput,
  campaignId: string,
  baseVersions: Record<string, number>,
) {
  if (operation.op === OpKind.CREATE_ENTITY || !operation.targetId) {
    return { blockedByLock: false, isStale: false };
  }

  const entity = await tx.entity.findFirst({
    where: {
      id: operation.targetId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, version: true, locked: true, lockedFields: true },
  });
  if (!entity) throw new ServiceError("Entity not found.");

  const expectedVersion = baseVersions[operation.targetId];
  return {
    blockedByLock:
      lockedPatchFields(operation.patch, entity.locked, entity.lockedFields).length > 0,
    isStale:
      typeof expectedVersion === "number" && expectedVersion !== entity.version,
  };
}

function operationBaseVersions(
  operations: { targetId?: string; patch: ReviewPatch }[],
) {
  const baseVersions: Record<string, number> = {};
  for (const operation of operations) {
    if (!operation.targetId) continue;
    const version = readTo(operation.patch, "_baseVersion");
    if (typeof version === "number") baseVersions[operation.targetId] = version;
  }
  return baseVersions;
}

function assertKnownEntityDataPatchFields(type: string, patch: ReviewPatch) {
  const allowed = typeDataFields(type);
  const unknown = patchFields(patch).find(
    (field) => field.startsWith("data.") && !allowed.has(field),
  );
  if (unknown) {
    throw new ServiceError(`Unknown data field "${unknown}" for entity type ${type}.`);
  }
}

function isEntityReviewOp(op: OpKind): op is EntityReviewOperationInput["op"] {
  return (
    op === OpKind.CREATE_ENTITY ||
    op === OpKind.UPDATE_ENTITY ||
    op === OpKind.DELETE_ENTITY
  );
}

function isRelationshipReviewOp(
  op: OpKind,
): op is RelationshipReviewOperationInput["op"] {
  return (
    op === OpKind.CREATE_RELATIONSHIP ||
    op === OpKind.UPDATE_RELATIONSHIP ||
    op === OpKind.DELETE_RELATIONSHIP
  );
}

// Lock/staleness flags for a pending relationship operation, mirroring
// evaluateEntityOperationFlags. AI/import/player CREATE proposals are blocked if
// either endpoint entity is locked; DM-authored creates stay ergonomic. Edges
// carry a whole-edge lock (no per-field locks), so any edit/remove of a locked
// edge is blocked. Staleness compares the captured base version against the live
// edge version.
async function evaluateRelationshipOperationFlags(
  tx: Prisma.TransactionClient,
  operation: { op: OpKind; targetId?: string; patch: ReviewPatch },
  campaignId: string,
  baseVersions: Record<string, number>,
  source: ChangeSource,
) {
  if (operation.op === OpKind.CREATE_RELATIONSHIP) {
    if (source === ChangeSource.DM) return { blockedByLock: false, isStale: false };

    const sourceId = readTo(operation.patch, "sourceId");
    const targetId = readTo(operation.patch, "targetId");
    if (typeof sourceId !== "string" || typeof targetId !== "string") {
      return { blockedByLock: false, isStale: false };
    }

    const endpoints = await tx.entity.findMany({
      where: {
        campaignId,
        id: { in: [sourceId, targetId] },
        status: CanonStatus.CANON,
      },
      select: { locked: true },
    });
    return {
      blockedByLock: endpoints.some((endpoint) => endpoint.locked),
      isStale: false,
    };
  }

  if (!operation.targetId) {
    return { blockedByLock: false, isStale: false };
  }

  const relationship = await tx.relationship.findFirst({
    where: {
      id: operation.targetId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, version: true, locked: true },
  });
  if (!relationship) throw new ServiceError("Relationship not found.");

  const expectedVersion = baseVersions[operation.targetId];
  return {
    blockedByLock: relationship.locked,
    isStale:
      typeof expectedVersion === "number" &&
      expectedVersion !== relationship.version,
  };
}

// Lock flags for a pending CREATE_EVENT_CAUSALITY, mirroring how
// evaluateRelationshipOperationFlags treats CREATE_RELATIONSHIP: AI/import/player
// proposals are blocked when either endpoint event is locked, while DM-authored
// links stay ergonomic. Only generated (AI) causality reaches this review path —
// DM links and every DELETE_EVENT_CAUSALITY auto-approve — and a CREATE carries
// no base version to stale-check, so this evaluates endpoint locks only. Without
// it refreshPendingOperationFlags would never evaluate causality ops, and
// applyCreateEventCausality only asserts canon endpoints, so a generated link
// could apply over an event locked during the review window.
async function evaluateCreateEventCausalityFlags(
  tx: Prisma.TransactionClient,
  patch: ReviewPatch,
  campaignId: string,
  source: ChangeSource,
) {
  if (source === ChangeSource.DM) return { blockedByLock: false, isStale: false };

  const causeId = readTo(patch, "causeId");
  const effectId = readTo(patch, "effectId");
  if (typeof causeId !== "string" || typeof effectId !== "string") {
    return { blockedByLock: false, isStale: false };
  }

  const endpoints = await tx.event.findMany({
    where: {
      campaignId,
      id: { in: [causeId, effectId] },
      status: CanonStatus.CANON,
    },
    select: { locked: true },
  });
  return {
    blockedByLock: endpoints.some((endpoint) => endpoint.locked),
    isStale: false,
  };
}

function isEventReviewOp(op: OpKind): op is EventReviewOperationInput["op"] {
  return (
    op === OpKind.CREATE_EVENT ||
    op === OpKind.UPDATE_EVENT ||
    op === OpKind.CREATE_EVENT_CAUSALITY ||
    op === OpKind.DELETE_EVENT_CAUSALITY ||
    op === OpKind.APPLY_EVENT_EFFECTS
  );
}

function isPersonaReviewOp(op: OpKind): op is PersonaReviewOperationInput["op"] {
  return (
    op === OpKind.CREATE_PERSONA_SNAPSHOT ||
    op === OpKind.UPDATE_PERSONA_SNAPSHOT
  );
}

async function evaluatePersonaOperationFlags(
  tx: Prisma.TransactionClient,
  operation: PersonaReviewOperationInput,
  campaignId: string,
  baseVersions: Record<string, number>,
  source: ChangeSource,
) {
  if (operation.op === OpKind.CREATE_PERSONA_SNAPSHOT) {
    const entityId = readTo(operation.patch, "entityId");
    if (typeof entityId !== "string") {
      return { blockedByLock: false, isStale: false };
    }
    const entity = await tx.entity.findFirst({
      where: { id: entityId, campaignId, status: CanonStatus.CANON },
      select: { locked: true },
    });
    if (!entity) throw new ServiceError("Entity not found.");
    // Activating a new snapshot deactivates the entity's current active one; if
    // that active snapshot is locked, hold the create rather than silently
    // flipping it (source-agnostic, like the UPDATE lock guard).
    const activatesOverLock =
      booleanWithDefault(readTo(operation.patch, "isActive"), false) &&
      (await hasLockedActivePersona(tx, campaignId, entityId));
    return {
      blockedByLock: (source !== ChangeSource.DM && entity.locked) || activatesOverLock,
      isStale: false,
    };
  }

  if (!operation.targetId) {
    return { blockedByLock: false, isStale: false };
  }
  const snapshot = await tx.personaSnapshot.findFirst({
    where: {
      id: operation.targetId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: {
      version: true,
      locked: true,
      promptLocked: true,
      entityId: true,
      isActive: true,
    },
  });
  if (!snapshot) throw new ServiceError("Persona snapshot not found.");

  const expectedVersion = baseVersions[operation.targetId];
  const fields = patchFields(operation.patch);
  const touchesCompiledPrompt = fields.includes("compiledPrompt");
  const nextActive = fields.includes("isActive")
    ? booleanWithDefault(readTo(operation.patch, "isActive"), false)
    : snapshot.isActive;
  const activatesOverLock =
    nextActive &&
    (await hasLockedActivePersona(tx, campaignId, snapshot.entityId, operation.targetId));
  return {
    blockedByLock:
      snapshot.locked ||
      (snapshot.promptLocked && touchesCompiledPrompt) ||
      activatesOverLock,
    isStale:
      typeof expectedVersion === "number" && expectedVersion !== snapshot.version,
  };
}

export async function createPendingEntityChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    title: string;
    summary?: string;
    runId?: string;
    // AI provenance (M4 generators): persisted on the ChangeSet so approval can
    // copy them onto each field's Provenance row (invariant #3 — "where did this
    // come from?"). Secret-free: the provider id/model/prompt are not the key.
    providerId?: string;
    model?: string;
    promptId?: string;
    promptVersion?: string;
    // M6 — when a persona-aware generator's prompt was driven by the active
    // System AI persona, record the snapshot + its version so provenance can
    // answer "which persona produced this?" (docs/05-system-ai-persona.md).
    personaSnapshotId?: string;
    personaPromptVersion?: number;
    operations: EntityReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);
  const baseVersions = operationBaseVersions(input.operations);

  return prisma.$transaction(async (tx) => {
    const flaggedOperations = [];
    for (const operation of input.operations) {
      flaggedOperations.push({
        operation,
        ...(await evaluateEntityOperationFlags(
          tx,
          operation,
          campaignId,
          baseVersions,
        )),
      });
    }

    return tx.changeSet.create({
      data: {
        campaignId,
        source: input.source ?? ChangeSource.DM,
        title: input.title,
        summary: input.summary,
        runId: input.runId,
        providerId: input.providerId,
        model: input.model,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        personaSnapshotId: input.personaSnapshotId,
        personaPromptVersion: input.personaPromptVersion,
        actorUserId: userId,
        baseVersions,
        operations: {
          create: flaggedOperations.map(({ operation, blockedByLock, isStale }) => ({
            op: operation.op,
            targetType: "ENTITY",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
            blockedByLock,
            isStale,
          })),
        },
      },
      select: { id: true, title: true, status: true },
    });
  });
}

export async function applyAutoApprovedEntityChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    auditAction?: string;
    title: string;
    summary?: string;
    operations: EntityReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);
  const baseVersions = operationBaseVersions(input.operations);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.create({
      data: {
        campaignId,
        source: input.source ?? ChangeSource.DM,
        title: input.title,
        summary: input.summary,
        actorUserId: userId,
        baseVersions,
        operations: {
          create: input.operations.map((operation) => ({
            op: operation.op,
            targetType: "ENTITY",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
          })),
        },
      },
      include: { operations: true },
    });

    const appliedIds: string[] = [];
    const applyingChangeSet = { ...changeSet, reviewedById: userId };
    for (const operation of changeSet.operations) {
      const targetId = await applyEntityOperation(tx, applyingChangeSet, operation);
      appliedIds.push(targetId);
      await tx.changeOperation.update({
        where: { id: operation.id },
        data: {
          targetId,
          decision: OpDecision.ACCEPTED,
        },
      });
    }

    await tx.changeSet.update({
      where: { id: changeSet.id },
      data: {
        status: ChangeSetStatus.APPROVED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: input.auditAction ?? "AUTO_APPROVE",
        targetType: "CHANGE_SET",
        targetId: changeSet.id,
        detail: { appliedIds },
      },
    });

    return { changeSetId: changeSet.id, targetIds: appliedIds };
  });
}

export async function applyAutoApprovedRelationshipChangeSet(
  userId: string,
  campaignId: string,
  input: {
    title: string;
    summary?: string;
    operations: RelationshipReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.create({
      data: {
        campaignId,
        source: ChangeSource.DM,
        title: input.title,
        summary: input.summary,
        actorUserId: userId,
        operations: {
          create: input.operations.map((operation) => ({
            op: operation.op,
            targetType: "RELATIONSHIP",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
          })),
        },
      },
      include: { operations: true },
    });

    const appliedIds: string[] = [];
    const applyingChangeSet = { ...changeSet, reviewedById: userId };
    for (const operation of changeSet.operations) {
      const targetId = await applyRelationshipOperation(tx, applyingChangeSet, operation);
      appliedIds.push(targetId);
      await tx.changeOperation.update({
        where: { id: operation.id },
        data: { targetId, decision: OpDecision.ACCEPTED },
      });
    }

    await tx.changeSet.update({
      where: { id: changeSet.id },
      data: {
        status: ChangeSetStatus.APPROVED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "AUTO_APPROVE",
        targetType: "CHANGE_SET",
        targetId: changeSet.id,
        detail: { appliedIds },
      },
    });

    return { changeSetId: changeSet.id, targetIds: appliedIds };
  });
}

// Pending (not auto-approved) relationship proposal — the symmetric counterpart
// to createPendingEntityChangeSet. AI/import producers (M4+) route any-to-any
// edges through the Review Queue this way; the DM reviews, edits, approves, or
// rejects before they touch canon. Operations are flagged for lock/staleness so
// the queue can hold blocked/stale edits instead of erroring on approval.
export async function createPendingRelationshipChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    title: string;
    summary?: string;
    runId?: string;
    // AI provenance (M4 generators): persisted on the ChangeSet so approval can
    // copy it onto relationship Provenance rows. Secret-free; never includes keys.
    providerId?: string;
    model?: string;
    promptId?: string;
    promptVersion?: string;
    operations: RelationshipReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);
  const baseVersions = operationBaseVersions(input.operations);

  return prisma.$transaction(async (tx) => {
    const flaggedOperations = [];
    for (const operation of input.operations) {
      flaggedOperations.push({
        operation,
        ...(await evaluateRelationshipOperationFlags(
          tx,
          operation,
          campaignId,
          baseVersions,
          input.source ?? ChangeSource.DM,
        )),
      });
    }

    return tx.changeSet.create({
      data: {
        campaignId,
        source: input.source ?? ChangeSource.DM,
        title: input.title,
        summary: input.summary,
        runId: input.runId,
        providerId: input.providerId,
        model: input.model,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        actorUserId: userId,
        baseVersions,
        operations: {
          create: flaggedOperations.map(({ operation, blockedByLock, isStale }) => ({
            op: operation.op,
            targetType: "RELATIONSHIP",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
            blockedByLock,
            isStale,
          })),
        },
      },
      select: { id: true, title: true, status: true },
    });
  });
}

export async function applyAutoApprovedEventChangeSet(
  userId: string,
  campaignId: string,
  input: {
    title: string;
    summary?: string;
    operations: EventReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.create({
      data: {
        campaignId,
        source: ChangeSource.DM,
        title: input.title,
        summary: input.summary,
        actorUserId: userId,
      },
    });

    // Some event operations depend on an earlier operation in the same change
    // set (for example UPDATE_EVENT declares effects before APPLY_EVENT_EFFECTS
    // applies them). Create and retain rows sequentially so application order is
    // the caller's declared order, not an unordered relation result.
    const operations: Prisma.ChangeOperationGetPayload<object>[] = [];
    for (const operation of input.operations) {
      operations.push(
        await tx.changeOperation.create({
          data: {
            changeSetId: changeSet.id,
            op: operation.op,
            targetType:
              operation.op === OpKind.CREATE_EVENT_CAUSALITY ||
              operation.op === OpKind.DELETE_EVENT_CAUSALITY
                ? "EVENT_CAUSALITY"
                : "EVENT",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
          },
        }),
      );
    }
    const changeSetWithOperations = { ...changeSet, reviewedById: userId, operations };
    const appliedIds: string[] = [];
    for (const operation of operations) {
      const targetId = await applyEventOperation(
        tx,
        changeSetWithOperations,
        operation,
      );
      appliedIds.push(targetId);
      await tx.changeOperation.update({
        where: { id: operation.id },
        data: { targetId, decision: OpDecision.ACCEPTED },
      });
    }

    await tx.changeSet.update({
      where: { id: changeSet.id },
      data: {
        status: ChangeSetStatus.APPROVED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "AUTO_APPROVE",
        targetType: "CHANGE_SET",
        targetId: changeSet.id,
        detail: { appliedIds },
      },
    });

    return { changeSetId: changeSet.id, targetIds: appliedIds };
  });
}

export async function createPendingEventChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    title: string;
    summary?: string;
    runId?: string;
    // AI provenance stays on the ChangeSet until an event/persona write is
    // approved, where it is copied into durable provenance rows.
    providerId?: string;
    model?: string;
    promptId?: string;
    promptVersion?: string;
    operations: EventReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) =>
    tx.changeSet.create({
      data: {
        campaignId,
        source: input.source ?? ChangeSource.DM,
        title: input.title,
        summary: input.summary,
        runId: input.runId,
        providerId: input.providerId,
        model: input.model,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        actorUserId: userId,
        operations: {
          create: input.operations.map((operation) => ({
            op: operation.op,
            targetType:
              operation.op === OpKind.CREATE_EVENT_CAUSALITY ||
              operation.op === OpKind.DELETE_EVENT_CAUSALITY
                ? "EVENT_CAUSALITY"
                : "EVENT",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
          })),
        },
      },
      include: { operations: true },
    }),
  );
}

export async function createPendingPersonaSnapshotChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    title: string;
    summary?: string;
    runId?: string;
    providerId?: string;
    model?: string;
    promptId?: string;
    promptVersion?: string;
    operations: PersonaReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);
  const baseVersions = operationBaseVersions(input.operations);
  const source = input.source ?? ChangeSource.DM;

  return prisma.$transaction(async (tx) => {
    const flaggedOperations = [];
    for (const operation of input.operations) {
      flaggedOperations.push({
        operation,
        ...(await evaluatePersonaOperationFlags(
          tx,
          operation,
          campaignId,
          baseVersions,
          source,
        )),
      });
    }

    return tx.changeSet.create({
      data: {
        campaignId,
        source,
        title: input.title,
        summary: input.summary,
        runId: input.runId,
        providerId: input.providerId,
        model: input.model,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        actorUserId: userId,
        baseVersions,
        operations: {
          create: flaggedOperations.map(({ operation, blockedByLock, isStale }) => ({
            op: operation.op,
            targetType: "PERSONA_SNAPSHOT",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
            blockedByLock,
            isStale,
          })),
        },
      },
      select: { id: true, title: true, status: true },
    });
  });
}

export async function applyAutoApprovedPersonaSnapshotChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    auditAction?: string;
    title: string;
    summary?: string;
    operations: PersonaReviewOperationInput[];
  },
) {
  await assertCampaignDm(userId, campaignId);
  const source = input.source ?? ChangeSource.DM;
  const baseVersions = operationBaseVersions(input.operations);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.create({
      data: {
        campaignId,
        source,
        title: input.title,
        summary: input.summary,
        actorUserId: userId,
        baseVersions,
        operations: {
          create: input.operations.map((operation) => ({
            op: operation.op,
            targetType: "PERSONA_SNAPSHOT",
            targetId: operation.targetId,
            patch: operation.patch as Prisma.InputJsonValue,
          })),
        },
      },
      include: { operations: true },
    });

    const appliedIds: string[] = [];
    const applyingChangeSet = { ...changeSet, reviewedById: userId };
    for (const operation of changeSet.operations) {
      const targetId = await applyPersonaSnapshotOperation(
        tx,
        applyingChangeSet,
        operation,
      );
      appliedIds.push(targetId);
      await tx.changeOperation.update({
        where: { id: operation.id },
        data: { targetId, decision: OpDecision.ACCEPTED },
      });
    }

    await tx.changeSet.update({
      where: { id: changeSet.id },
      data: {
        status: ChangeSetStatus.APPROVED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: input.auditAction ?? "AUTO_APPROVE",
        targetType: "CHANGE_SET",
        targetId: changeSet.id,
        detail: { appliedIds },
      },
    });

    return { changeSetId: changeSet.id, targetIds: appliedIds };
  });
}

export async function listPendingChangeSetsForUser(
  userId: string,
  campaignId: string,
): Promise<ReviewQueueItem[]> {
  await assertCampaignDm(userId, campaignId);
  await refreshPendingOperationFlags(campaignId);

  const changeSets = await prisma.changeSet.findMany({
    where: { campaignId, status: ChangeSetStatus.PENDING },
    orderBy: { createdAt: "asc" },
    include: { operations: { orderBy: { id: "asc" } } },
  });

  return enrichReviewQueueItems(campaignId, changeSets);
}

export async function listClosedChangeSetsForUser(
  userId: string,
  campaignId: string,
): Promise<ReviewQueueItem[]> {
  await assertCampaignDm(userId, campaignId);

  const changeSets = await prisma.changeSet.findMany({
    where: {
      campaignId,
      source: { not: ChangeSource.DM },
      status: { not: ChangeSetStatus.PENDING },
    },
    orderBy: [{ reviewedAt: "desc" }, { updatedAt: "desc" }],
    include: { operations: { orderBy: { id: "asc" } } },
  });

  return enrichReviewQueueItems(campaignId, changeSets);
}

export async function getReviewChangeSetForUser(
  userId: string,
  campaignId: string,
  changeSetId: string,
): Promise<ReviewQueueItem | null> {
  await assertCampaignDm(userId, campaignId);
  const changeSet = await prisma.changeSet.findFirst({
    where: { id: changeSetId, campaignId },
    include: { operations: { orderBy: { id: "asc" } } },
  });
  if (!changeSet) return null;
  return (await enrichReviewQueueItems(campaignId, [changeSet]))[0] ?? null;
}

async function enrichReviewQueueItems(
  campaignId: string,
  changeSets: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>[],
): Promise<ReviewQueueItem[]> {
  // Entity ids to resolve: every ENTITY-target op, plus the endpoints named by a
  // CREATE_RELATIONSHIP patch so a new edge can be labeled "Source → Target".
  const entityTargetIds = new Set<string>();
  for (const changeSet of changeSets) {
    for (const operation of changeSet.operations) {
      const patch = effectiveOperationPatch(operation);
      if (operation.targetType === "ENTITY" && operation.targetId) {
        entityTargetIds.add(operation.targetId);
      }
      if (operation.targetType === "RELATIONSHIP") {
        const sourceId = readTo(patch, "sourceId");
        const endpointTargetId = readTo(patch, "targetId");
        if (typeof sourceId === "string") entityTargetIds.add(sourceId);
        if (typeof endpointTargetId === "string") entityTargetIds.add(endpointTargetId);
      }
      const participants = readTo(patch, "participants");
      if (Array.isArray(participants)) {
        for (const participant of participants) {
          if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
            continue;
          }
          const entityId = (participant as Record<string, unknown>).entityId;
          if (typeof entityId === "string") entityTargetIds.add(entityId);
        }
      }
      if (operation.op === OpKind.APPLY_EVENT_EFFECTS) {
        for (const effect of parseEventEffects(readTo(patch, "effects"))) {
          if (effect.targetEntityId) entityTargetIds.add(effect.targetEntityId);
        }
      }
    }
  }
  const eventTargetIds = Array.from(
    new Set(
      changeSets.flatMap((changeSet) =>
        changeSet.operations
          .filter((operation) => operation.targetType === "EVENT")
          .map((operation) => operation.targetId)
          .filter((targetId): targetId is string => Boolean(targetId)),
      ),
    ),
  );
  const relationshipTargetIds = Array.from(
    new Set(
      changeSets.flatMap((changeSet) =>
        changeSet.operations
          .filter((operation) => operation.targetType === "RELATIONSHIP")
          .map((operation) => operation.targetId)
          .filter((targetId): targetId is string => Boolean(targetId)),
      ),
    ),
  );
  const personaTargetIds = Array.from(
    new Set(
      changeSets.flatMap((changeSet) =>
        changeSet.operations
          .filter((operation) => operation.targetType === "PERSONA_SNAPSHOT")
          .map((operation) => operation.targetId)
          .filter((targetId): targetId is string => Boolean(targetId)),
      ),
    ),
  );
  const targets = entityTargetIds.size
    ? await prisma.entity.findMany({
        where: { campaignId, id: { in: [...entityTargetIds] } },
        include: { crawler: true, faction: true, floor: true },
      })
    : [];
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const eventTargets = eventTargetIds.length
    ? await prisma.event.findMany({
        where: { campaignId, id: { in: eventTargetIds } },
        select: {
          id: true,
          title: true,
          summary: true,
          inGameTime: true,
          secret: true,
          participants: { select: { entityId: true, role: true } },
        },
      })
    : [];
  const eventById = new Map(eventTargets.map((event) => [event.id, event]));
  const relationshipTargets = relationshipTargetIds.length
    ? await prisma.relationship.findMany({
        where: { campaignId, id: { in: relationshipTargetIds } },
        select: {
          id: true,
          type: true,
          disposition: true,
          sinceDay: true,
          untilDay: true,
          notes: true,
          secret: true,
          locked: true,
          sourceEntity: { select: { name: true } },
          targetEntity: { select: { name: true } },
        },
      })
    : [];
  const relationshipById = new Map(
    relationshipTargets.map((relationship) => [relationship.id, relationship]),
  );
  const personaTargets = personaTargetIds.length
    ? await prisma.personaSnapshot.findMany({
        where: { campaignId, id: { in: personaTargetIds } },
        select: {
          id: true,
          entityId: true,
          label: true,
          inGameTime: true,
          orderKey: true,
          dials: true,
          values: true,
          agendas: true,
          resources: true,
          knowledgeScope: true,
          voiceGuide: true,
          constraints: true,
          compiledPrompt: true,
          isActive: true,
          status: true,
          locked: true,
          promptLocked: true,
          version: true,
          entity: { select: { name: true, type: true } },
        },
      })
    : [];
  const personaById = new Map(personaTargets.map((snapshot) => [snapshot.id, snapshot]));

  return changeSets.map((changeSet) => ({
    ...changeSet,
    operations: changeSet.operations.map((operation) => {
      const patch = operation.patch as ReviewPatch;
      const target =
        operation.targetType === "ENTITY" && operation.targetId
          ? targetById.get(operation.targetId)
          : undefined;
      const eventTarget =
        operation.targetType === "EVENT" && operation.targetId
          ? eventById.get(operation.targetId)
          : undefined;
      const relationshipTarget =
        operation.targetType === "RELATIONSHIP" && operation.targetId
          ? relationshipById.get(operation.targetId)
          : undefined;
      const personaTarget =
        operation.targetType === "PERSONA_SNAPSHOT" && operation.targetId
          ? personaById.get(operation.targetId)
          : undefined;
      const relationshipLabel =
        operation.targetType === "RELATIONSHIP"
          ? relationshipEdgeLabel(relationshipTarget, patch, targetById)
          : null;
      let personaLabel: string | null = null;
      if (operation.targetType === "PERSONA_SNAPSHOT") {
        if (personaTarget) {
          const suffix = personaTarget.label ? `: ${personaTarget.label}` : "";
          personaLabel = `${personaTarget.entity.name} persona${suffix}`;
        } else {
          personaLabel =
            stringFromReviewValue(readTo(patch, "label")) ?? "Persona snapshot";
        }
      }
      const targetEntityType =
        target?.type ??
        (eventTarget ? "EVENT" : null) ??
        (operation.targetType === "EVENT" ? "EVENT" : null) ??
        (personaTarget ? "PERSONA" : null) ??
        (operation.targetType === "PERSONA_SNAPSHOT" ? "PERSONA" : null) ??
        relationshipTarget?.type ??
        (operation.targetType === "RELATIONSHIP"
          ? stringFromReviewValue(readTo(patch, "type"))
          : null) ??
        stringFromReviewValue(readTo(patch, "type"));
      const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
      const currentValues: Record<string, unknown> = {};
      for (const field of fields) {
        let current: unknown;
        if (target) {
          current = currentEntityValue(target, field);
        } else if (relationshipTarget) {
          current = currentRelationshipValue(relationshipTarget, field);
        } else if (eventTarget) {
          current = currentEventValue(eventTarget, field);
        } else if (personaTarget) {
          current = currentPersonaSnapshotValue(personaTarget, field);
        }
        if (current !== undefined) currentValues[field] = current;
      }

      return {
        ...operation,
        targetLabel:
          target?.name ??
          eventTarget?.title ??
          personaLabel ??
          relationshipLabel ??
          stringFromReviewValue(readTo(patch, "name")) ??
          stringFromReviewValue(readTo(patch, "title")) ??
          operation.targetId ??
          null,
        targetEntityType,
        targetLocked:
          Boolean(target?.locked) ||
          Boolean(relationshipTarget?.locked) ||
          Boolean(personaTarget?.locked) ||
          Boolean(personaTarget?.promptLocked),
        lockedFields:
          target?.lockedFields ??
          (personaTarget?.promptLocked ? ["compiledPrompt"] : []),
        currentValues,
        effectPreviews:
          operation.op === OpKind.APPLY_EVENT_EFFECTS
            ? buildEffectPreviews(effectiveOperationPatch(operation), targetById)
            : [],
      };
    }),
  }));
}

function currentEventValue(
  event: {
    title: string;
    summary: string | null;
    inGameTime: Prisma.JsonValue;
    secret: boolean;
    participants: { entityId: string; role: EventParticipantRole }[];
  },
  field: string,
): unknown {
  switch (field) {
    case "title":
      return event.title;
    case "summary":
      return event.summary;
    case "inGameTime":
      return event.inGameTime;
    case "secret":
      return event.secret;
    case "participants":
      return event.participants.map((participant) => ({
        entityId: participant.entityId,
        role: participant.role,
      }));
  }
  return undefined;
}

// "Source → Target" label for a relationship op. UPDATE/DELETE resolve from the
// live edge; CREATE resolves endpoint names from the patch (falling back to the
// edge type if the endpoints aren't loaded).
function relationshipEdgeLabel(
  relationship:
    | { sourceEntity: { name: string }; targetEntity: { name: string } }
    | undefined,
  patch: ReviewPatch,
  targetById: Map<string, { name: string }>,
) {
  if (relationship) {
    return `${relationship.sourceEntity.name} → ${relationship.targetEntity.name}`;
  }
  const sourceId = readTo(patch, "sourceId");
  const targetId = readTo(patch, "targetId");
  const sourceName =
    typeof sourceId === "string" ? targetById.get(sourceId)?.name : undefined;
  const targetName =
    typeof targetId === "string" ? targetById.get(targetId)?.name : undefined;
  if (sourceName && targetName) return `${sourceName} → ${targetName}`;
  return stringFromReviewValue(readTo(patch, "type"));
}

function currentRelationshipValue(
  relationship: {
    type: RelationshipType;
    disposition: number | null;
    sinceDay: number | null;
    untilDay: number | null;
    notes: string | null;
    secret: boolean;
  },
  field: string,
): unknown {
  switch (field) {
    case "type":
      return relationship.type;
    case "disposition":
      return relationship.disposition;
    case "sinceDay":
      return relationship.sinceDay;
    case "untilDay":
      return relationship.untilDay;
    case "notes":
      return relationship.notes;
    case "secret":
      return relationship.secret;
  }
  return undefined;
}

function currentPersonaSnapshotValue(
  snapshot: {
    entityId: string;
    label: string | null;
    inGameTime: Prisma.JsonValue;
    orderKey: number | null;
    dials: Prisma.JsonValue;
    values: Prisma.JsonValue;
    agendas: Prisma.JsonValue;
    resources: Prisma.JsonValue;
    knowledgeScope: string;
    voiceGuide: string | null;
    constraints: string | null;
    compiledPrompt: string | null;
    isActive: boolean;
    status: CanonStatus;
    locked: boolean;
    promptLocked: boolean;
  },
  field: string,
): unknown {
  switch (field) {
    case "entityId":
      return snapshot.entityId;
    case "label":
      return snapshot.label;
    case "inGameTime":
      return snapshot.inGameTime;
    case "orderKey":
      return snapshot.orderKey;
    case "dials":
      return snapshot.dials;
    case "values":
      return snapshot.values;
    case "agendas":
      return snapshot.agendas;
    case "resources":
      return snapshot.resources;
    case "knowledgeScope":
      return snapshot.knowledgeScope;
    case "voiceGuide":
      return snapshot.voiceGuide;
    case "constraints":
      return snapshot.constraints;
    case "compiledPrompt":
      return snapshot.compiledPrompt;
    case "isActive":
      return snapshot.isActive;
    case "status":
      return snapshot.status;
    case "locked":
      return snapshot.locked;
    case "promptLocked":
      return snapshot.promptLocked;
  }
  return undefined;
}

function stringFromReviewValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function currentEntityValue(
  entity: Prisma.EntityGetPayload<{
    include: { crawler: true; faction: true; floor: true };
  }>,
  field: string,
): unknown {
  switch (field) {
    case "type":
      return entity.type;
    case "name":
      return entity.name;
    case "summary":
      return entity.summary;
    case "description":
      return entity.description;
    case "imageUrl":
      return entity.imageUrl;
    case "visibility":
      return entity.visibility;
    case "tags":
      return entity.tags;
    case "isStub":
      return entity.isStub;
    case "data":
      // Merge the satellite row so a FACTION's / FLOOR's `data.*` blob reflects
      // its satellite-backed fields, not stale JSON nulls (ADR 0011 Part C). The
      // right relation is picked from the type's descriptor (satelliteRowOf).
      return readKindData(entity.type, entity.data, satelliteRowOf(entity.type, entity));
    case "customFields":
      return entity.customFields;
  }

  // Bespoke `data.*` fields: normalize the stored value by the field's
  // entity-kind descriptor (ADR 0009) instead of a per-field switch. A `data.*`
  // field no kind declares is unknown → undefined (as the prior switch returned).
  if (field.startsWith("data.")) {
    const key = field.slice("data.".length);
    if (typeDataFields(entity.type).has(field)) {
      const metadata = readKindData(
        entity.type,
        entity.data,
        satelliteRowOf(entity.type, entity),
      );
      return metadata[key];
    }
    return undefined;
  }

  if (!field.startsWith("crawler.") || !entity.crawler) return undefined;
  const crawlerField = field.replace("crawler.", "") as keyof typeof entity.crawler;
  const value = entity.crawler[crawlerField];
  return typeof value === "bigint" ? value.toString() : value;
}

export async function setChangeOperationDecision(
  userId: string,
  campaignId: string,
  changeSetId: string,
  operationId: string,
  input: ChangeOperationDecisionInput,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      include: { operations: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");

    const operation = changeSet.operations.find((op) => op.id === operationId);
    if (!operation) throw new ServiceError("Change operation not found.");
    const entityOperation = operation.targetType === "ENTITY" && isEntityReviewOp(operation.op);
    const relationshipOperation =
      operation.targetType === "RELATIONSHIP" && isRelationshipReviewOp(operation.op);
    const eventOperation =
      (operation.targetType === "EVENT" || operation.targetType === "EVENT_CAUSALITY") &&
      isEventReviewOp(operation.op);
    const personaOperation =
      operation.targetType === "PERSONA_SNAPSHOT" && isPersonaReviewOp(operation.op);
    if (!entityOperation && !relationshipOperation && !eventOperation && !personaOperation) {
      throw new ServiceError("Unsupported operation target.");
    }
    if (input.decision === OpDecision.EDITED) {
      const originalFields = new Set(patchFields(operation.patch as ReviewPatch));
      const editedFields = patchFields(input.editedPatch);
      if (editedFields.length === 0) {
        throw new ServiceError("Edited operation patch must include at least one field.");
      }
      const unknownField = editedFields.find((field) => !originalFields.has(field));
      if (unknownField) {
        throw new ServiceError(`Edited operation includes unknown field "${unknownField}".`);
      }
      if (operation.op === OpKind.APPLY_EVENT_EFFECTS) {
        const originalEffectIds = new Set(
          parseEventEffects(readTo(operation.patch as ReviewPatch, "effects")).map(
            (effect) => effect.id,
          ),
        );
        const unknownEffect = parseEventEffects(
          readTo(input.editedPatch, "effects"),
        ).find((effect) => !originalEffectIds.has(effect.id));
        if (unknownEffect) {
          throw new ServiceError(
            `Edited effect operation includes unknown effect "${unknownEffect.id}".`,
          );
        }
      }
    }

    const editedPatch =
      input.decision === OpDecision.EDITED
        ? (input.editedPatch as Prisma.InputJsonValue)
        : Prisma.DbNull;
    const patchForFlags =
      input.decision === OpDecision.EDITED ? input.editedPatch : operation.patch as ReviewPatch;
    const flags =
      input.decision === OpDecision.REJECTED || eventOperation
        ? { blockedByLock: false, isStale: false }
        : relationshipOperation
          ? await evaluateRelationshipOperationFlags(
              tx,
              {
                op: operation.op,
                targetId: operation.targetId ?? undefined,
                patch: patchForFlags,
              },
              campaignId,
              baseVersionsObject(changeSet.baseVersions),
              changeSet.source,
            )
          : personaOperation
            ? await evaluatePersonaOperationFlags(
                tx,
                {
                  op: operation.op as PersonaReviewOperationInput["op"],
                  targetId: operation.targetId ?? undefined,
                  patch: patchForFlags,
                },
                campaignId,
                baseVersionsObject(changeSet.baseVersions),
                changeSet.source,
              )
          : await evaluateEntityOperationFlags(
              tx,
              {
                op: operation.op as EntityReviewOperationInput["op"],
                targetId: operation.targetId ?? undefined,
                patch: patchForFlags,
              },
              campaignId,
              baseVersionsObject(changeSet.baseVersions),
            );

    const updated = await tx.changeOperation.update({
      where: { id: operation.id },
      data: {
        decision: input.decision,
        editedPatch,
        fieldDecisions: {},
        ...flags,
      },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "SET_OPERATION_DECISION",
        targetType: "CHANGE_OPERATION",
        targetId: operation.id,
        detail: {
          changeSetId,
          decision: input.decision,
          editedFields:
            input.decision === OpDecision.EDITED
              ? patchFields(input.editedPatch)
              : [],
        },
      },
    });

    return updated;
  });
}

export async function setChangeOperationFieldDecision(
  userId: string,
  campaignId: string,
  changeSetId: string,
  operationId: string,
  input: ChangeOperationFieldDecisionInput,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      include: { operations: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");

    const operation = changeSet.operations.find((candidate) => candidate.id === operationId);
    if (!operation) throw new ServiceError("Change operation not found.");
    const originalPatch = operation.patch as ReviewPatch;
    const fields = reviewablePatchFields(originalPatch);
    if (!fields.includes(input.field)) {
      throw new ServiceError(`Change operation has no reviewable field "${input.field}".`);
    }

    const fieldDecisions = operationFieldDecisions(operation);
    if (input.decision === "PENDING") delete fieldDecisions[input.field];
    else fieldDecisions[input.field] = input.decision;
    const priorEdits = operation.editedPatch as ReviewPatch | null;
    const editedPatch: ReviewPatch = {};
    for (const field of fields) {
      if (fieldDecisions[field] !== "ACCEPTED") continue;
      editedPatch[field] =
        field === input.field && input.editedValue
          ? input.editedValue
          : priorEdits?.[field] ?? originalPatch[field];
    }

    const acceptedFields = fields.filter((field) => fieldDecisions[field] === "ACCEPTED");
    const allRejected =
      fields.length > 0 &&
      fields.every((field) => fieldDecisions[field] === "REJECTED");
    let decision: OpDecision = OpDecision.PENDING;
    if (acceptedFields.length > 0) {
      decision = OpDecision.EDITED;
    } else if (allRejected) {
      decision = OpDecision.REJECTED;
    }
    const entityOperation =
      operation.targetType === "ENTITY" && isEntityReviewOp(operation.op);
    const relationshipOperation =
      operation.targetType === "RELATIONSHIP" && isRelationshipReviewOp(operation.op);
    const eventOperation =
      (operation.targetType === "EVENT" || operation.targetType === "EVENT_CAUSALITY") &&
      isEventReviewOp(operation.op);
    const personaOperation =
      operation.targetType === "PERSONA_SNAPSHOT" && isPersonaReviewOp(operation.op);
    if (!entityOperation && !relationshipOperation && !eventOperation && !personaOperation) {
      throw new ServiceError("Unsupported operation target.");
    }
    const flags =
      decision === OpDecision.REJECTED ||
      decision === OpDecision.PENDING ||
      eventOperation
        ? { blockedByLock: false, isStale: false }
        : relationshipOperation
          ? await evaluateRelationshipOperationFlags(
              tx,
              {
                op: operation.op,
                targetId: operation.targetId ?? undefined,
                patch: editedPatch,
              },
              campaignId,
              baseVersionsObject(changeSet.baseVersions),
              changeSet.source,
            )
          : personaOperation
            ? await evaluatePersonaOperationFlags(
                tx,
                {
                  op: operation.op as PersonaReviewOperationInput["op"],
                  targetId: operation.targetId ?? undefined,
                  patch: editedPatch,
                },
                campaignId,
                baseVersionsObject(changeSet.baseVersions),
                changeSet.source,
              )
          : await evaluateEntityOperationFlags(
              tx,
              {
                op: operation.op as EntityReviewOperationInput["op"],
                targetId: operation.targetId ?? undefined,
                patch: editedPatch,
              },
              campaignId,
              baseVersionsObject(changeSet.baseVersions),
            );

    const updated = await tx.changeOperation.update({
      where: { id: operation.id },
      data: {
        decision,
        editedPatch:
          acceptedFields.length > 0
            ? (editedPatch as Prisma.InputJsonValue)
            : Prisma.DbNull,
        fieldDecisions: fieldDecisions as Prisma.InputJsonValue,
        ...flags,
      },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "SET_FIELD_DECISION",
        targetType: "CHANGE_OPERATION",
        targetId: operation.id,
        detail: {
          changeSetId,
          field: input.field,
          decision: input.decision,
          edited: Boolean(input.editedValue),
        },
      },
    });

    return updated;
  });
}

export async function approveChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await assertCampaignDm(userId, campaignId);
  await refreshPendingOperationFlags(campaignId, changeSetId);

  try {
    return await prisma.$transaction(async (tx) => {
      const changeSet = await tx.changeSet.findFirst({
        where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
        include: { operations: true },
      });
      if (!changeSet) throw new ServiceError("Change set not found.");
      const applicableOperations = changeSet.operations.filter(
        (operation) =>
          operation.decision === OpDecision.ACCEPTED ||
          operation.decision === OpDecision.EDITED,
      );
      if (applicableOperations.length === 0) {
        throw new ServiceError("Accept at least one operation before approval.", {
          code: "NO_ACCEPTED_OPERATIONS",
        });
      }
      if (applicableOperations.some((operation) => operation.blockedByLock)) {
        throw new ServiceError("One or more operations are blocked by locks.", {
          code: "OPERATION_BLOCKED",
        });
      }
      if (applicableOperations.some((operation) => operation.isStale)) {
        throw new ServiceError("One or more operations are stale.", {
          code: "OPERATION_STALE",
        });
      }

      const appliedIds: string[] = [];
      const applyingChangeSet = { ...changeSet, reviewedById: userId };
      for (const operation of applicableOperations) {
        const targetId = await applyReviewOperation(
          tx,
          applyingChangeSet,
          operation,
          effectiveOperationPatch(operation),
        );
        appliedIds.push(targetId);
        await tx.changeOperation.update({
          where: { id: operation.id },
          data: {
            targetId,
            decision:
              operation.decision === OpDecision.EDITED
                ? OpDecision.EDITED
                : OpDecision.ACCEPTED,
          },
        });
      }

      const rejectedOperations = changeSet.operations.filter(
        (operation) => !applicableOperations.some((applied) => applied.id === operation.id),
      );
      if (rejectedOperations.length > 0) {
        await markEventEffectReviewState(
          tx,
          changeSet,
          rejectedOperations,
          "REJECTED",
        );
      }

      const rejectedCount = changeSet.operations.length - applicableOperations.length;
      let status: ChangeSetStatus = ChangeSetStatus.APPROVED;
      if (applicableOperations.length === 0) {
        status = ChangeSetStatus.REJECTED;
      } else if (rejectedCount > 0) {
        status = ChangeSetStatus.PARTIALLY_APPLIED;
      }
      await tx.changeSet.update({
        where: { id: changeSet.id },
        data: {
          status,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          campaignId,
          actorUserId: userId,
          action: status === ChangeSetStatus.REJECTED ? "REJECT" : "APPROVE",
          targetType: "CHANGE_SET",
          targetId: changeSet.id,
          detail: { appliedIds, rejectedCount },
        },
      });

      return { id: changeSet.id, targetIds: appliedIds };
    });
  } catch (error) {
    // A lock can be acquired after the refresh above but before an apply
    // transaction obtains its row lock. Re-evaluate after the transaction rolls
    // back so the Review Queue retains the current held state.
    if (
      error instanceof ServiceError &&
      (error.code === "OPERATION_BLOCKED" || error.code === "OPERATION_STALE")
    ) {
      await refreshPendingOperationFlags(campaignId, changeSetId);
    }
    throw error;
  }
}

async function applyReviewOperation(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operation: Prisma.ChangeOperationGetPayload<object>,
  patchOverride?: ReviewPatch,
) {
  if (operation.targetType === "ENTITY" && isEntityReviewOp(operation.op)) {
    return applyEntityOperation(tx, changeSet, operation, patchOverride);
  }
  if (operation.targetType === "RELATIONSHIP" && isRelationshipReviewOp(operation.op)) {
    return applyRelationshipOperation(tx, changeSet, operation, patchOverride);
  }
  if (
    (operation.targetType === "EVENT" || operation.targetType === "EVENT_CAUSALITY") &&
    isEventReviewOp(operation.op)
  ) {
    return applyEventOperation(tx, changeSet, operation, patchOverride);
  }
  if (
    operation.targetType === "PERSONA_SNAPSHOT" &&
    isPersonaReviewOp(operation.op)
  ) {
    return applyPersonaSnapshotOperation(tx, changeSet, operation, patchOverride);
  }
  throw new ServiceError("Unsupported operation target.");
}

function reembedIndexOptions(changeSet: {
  reviewedById: string | null;
  actorUserId: string | null;
}) {
  return {
    reembedRequestedById: changeSet.reviewedById ?? changeSet.actorUserId,
  };
}

export type ChangeSetRunReviewResult = {
  runId: string;
  approvedIds: string[];
  rejectedIds: string[];
  heldIds: string[];
};

function normalizeRunId(runId: string) {
  const normalized = runId.trim();
  if (!normalized) throw new ServiceError("Run id is required.");
  return normalized;
}

async function pendingChangeSetsForRun(campaignId: string, runId: string) {
  return prisma.changeSet.findMany({
    where: { campaignId, runId, status: ChangeSetStatus.PENDING },
    orderBy: { createdAt: "asc" },
    include: { operations: { orderBy: { id: "asc" } } },
  });
}

export async function approveChangeSetRun(
  userId: string,
  campaignId: string,
  runId: string,
): Promise<ChangeSetRunReviewResult> {
  await assertCampaignDm(userId, campaignId);
  const normalizedRunId = normalizeRunId(runId);
  await refreshPendingOperationFlags(campaignId);

  const changeSets = await pendingChangeSetsForRun(campaignId, normalizedRunId);
  if (changeSets.length === 0) {
    throw new ServiceError("Pending generator run not found.");
  }

  const approvedIds: string[] = [];
  const heldIds: string[] = [];

  for (const changeSet of changeSets) {
    const applicableOperations = changeSet.operations.filter(
      (operation) => operation.decision !== OpDecision.REJECTED,
    );
    const held = applicableOperations.some(
      (operation) => operation.blockedByLock || operation.isStale,
    );
    if (held) {
      heldIds.push(changeSet.id);
      continue;
    }
    const snapshots = changeSet.operations
      .filter(
        (operation) =>
          operation.decision === OpDecision.PENDING ||
          operation.decision === OpDecision.EDITED,
      )
      .map(({ id, decision, editedPatch, fieldDecisions }) => ({
        id,
        decision,
        editedPatch,
        fieldDecisions,
      }));

    try {
      for (const operation of changeSet.operations) {
        if (
          operation.decision !== OpDecision.PENDING &&
          operation.decision !== OpDecision.EDITED
        ) {
          continue;
        }
        await prisma.changeOperation.update({
          where: { id: operation.id },
          data: bulkApprovedOperationData(operation),
        });
      }
      await approveChangeSet(userId, campaignId, changeSet.id);
      approvedIds.push(changeSet.id);
    } catch (error) {
      if (
        error instanceof ServiceError &&
        (error.code === "OPERATION_STALE" ||
          error.code === "OPERATION_BLOCKED" ||
          error.code === "NO_ACCEPTED_OPERATIONS")
      ) {
        await restoreOperationDecisions(snapshots);
        heldIds.push(changeSet.id);
      } else {
        throw error;
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      campaignId,
      actorUserId: userId,
      action: "BULK_APPROVE_RUN",
      targetType: "CHANGE_SET_RUN",
      targetId: normalizedRunId,
      detail: { approvedIds, heldIds },
    },
  });

  return {
    runId: normalizedRunId,
    approvedIds,
    rejectedIds: [],
    heldIds,
  };
}

async function refreshPendingOperationFlags(
  campaignId: string,
  changeSetId?: string,
) {
  await prisma.$transaction(async (tx) => {
    const changeSets = await tx.changeSet.findMany({
      where: {
        campaignId,
        status: ChangeSetStatus.PENDING,
        ...(changeSetId ? { id: changeSetId } : {}),
      },
      include: { operations: true },
    });

    for (const changeSet of changeSets) {
      const baseVersions = baseVersionsObject(changeSet.baseVersions);
      for (const operation of changeSet.operations) {
        if (operation.decision === OpDecision.REJECTED) {
          await tx.changeOperation.update({
            where: { id: operation.id },
            data: { blockedByLock: false, isStale: false },
          });
          continue;
        }
        if (
          operation.targetType === "EVENT" &&
          operation.op === OpKind.APPLY_EVENT_EFFECTS
        ) {
          const flags = await evaluateApplyEventEffectsOperationFlags(
            tx,
            changeSet,
            operation,
            effectiveOperationPatch(operation),
          );
          await tx.changeOperation.update({
            where: { id: operation.id },
            data: flags,
          });
          continue;
        }
        if (operation.targetType === "ENTITY" && isEntityReviewOp(operation.op)) {
          const operationInput = {
            op: operation.op,
            targetId: operation.targetId ?? undefined,
            patch: effectiveOperationPatch(operation),
          };
          const flags = await evaluatePendingOperationFlagsForRefresh(
            tx,
            operationInput,
            campaignId,
            baseVersions,
          );
          await tx.changeOperation.update({
            where: { id: operation.id },
            data: flags,
          });
          continue;
        }
        if (
          operation.targetType === "EVENT_CAUSALITY" &&
          operation.op === OpKind.CREATE_EVENT_CAUSALITY
        ) {
          const flags = await evaluateCreateEventCausalityFlags(
            tx,
            effectiveOperationPatch(operation),
            campaignId,
            changeSet.source,
          );
          await tx.changeOperation.update({
            where: { id: operation.id },
            data: flags,
          });
          continue;
        }
        if (
          operation.targetType === "RELATIONSHIP" &&
          isRelationshipReviewOp(operation.op)
        ) {
          const flags = await evaluateRelationshipFlagsForRefresh(
            tx,
            {
              op: operation.op,
              targetId: operation.targetId ?? undefined,
              patch: effectiveOperationPatch(operation),
            },
            campaignId,
            baseVersions,
            changeSet.source,
          );
          await tx.changeOperation.update({
            where: { id: operation.id },
            data: flags,
          });
          continue;
        }
        if (
          operation.targetType === "PERSONA_SNAPSHOT" &&
          isPersonaReviewOp(operation.op)
        ) {
          const flags = await evaluatePersonaFlagsForRefresh(
            tx,
            {
              op: operation.op,
              targetId: operation.targetId ?? undefined,
              patch: effectiveOperationPatch(operation),
            },
            campaignId,
            baseVersions,
            changeSet.source,
          );
          await tx.changeOperation.update({
            where: { id: operation.id },
            data: flags,
          });
        }
      }
    }
  });
}

async function evaluatePendingOperationFlagsForRefresh(
  tx: Prisma.TransactionClient,
  operation: EntityReviewOperationInput,
  campaignId: string,
  baseVersions: Record<string, number>,
) {
  try {
    return await evaluateEntityOperationFlags(tx, operation, campaignId, baseVersions);
  } catch (error) {
    if (error instanceof ServiceError && error.message === "Entity not found.") {
      return { blockedByLock: false, isStale: true };
    }
    throw error;
  }
}

async function evaluateRelationshipFlagsForRefresh(
  tx: Prisma.TransactionClient,
  operation: { op: OpKind; targetId?: string; patch: ReviewPatch },
  campaignId: string,
  baseVersions: Record<string, number>,
  source: ChangeSource,
) {
  try {
    return await evaluateRelationshipOperationFlags(
      tx,
      operation,
      campaignId,
      baseVersions,
      source,
    );
  } catch (error) {
    if (error instanceof ServiceError && error.message === "Relationship not found.") {
      // The edge was archived/removed under the proposal — hold it as stale
      // rather than throwing while refreshing the queue.
      return { blockedByLock: false, isStale: true };
    }
    throw error;
  }
}

async function evaluatePersonaFlagsForRefresh(
  tx: Prisma.TransactionClient,
  operation: PersonaReviewOperationInput,
  campaignId: string,
  baseVersions: Record<string, number>,
  source: ChangeSource,
) {
  try {
    return await evaluatePersonaOperationFlags(
      tx,
      operation,
      campaignId,
      baseVersions,
      source,
    );
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.message === "Persona snapshot not found." ||
        error.message === "Entity not found.")
    ) {
      return { blockedByLock: false, isStale: true };
    }
    throw error;
  }
}

async function evaluateApplyEventEffectsOperationFlags(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operation: Prisma.ChangeOperationGetPayload<object>,
  patch: ReviewPatch,
) {
  if (!operation.targetId) return { blockedByLock: false, isStale: true };
  const event = await tx.event.findFirst({
    where: {
      id: operation.targetId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true, effects: true },
  });
  if (!event) return { blockedByLock: false, isStale: true };
  if (event.locked) return { blockedByLock: true, isStale: false };

  const rawPatchEffects = readTo(patch, "effects");
  const canonicalAiPatchEffects =
    changeSet.source === ChangeSource.AI && "effects" in patch
      ? parseCanonicalAiPatchEffects(rawPatchEffects)
      : undefined;
  if (canonicalAiPatchEffects === null) {
    return { blockedByLock: false, isStale: true };
  }
  const reviewedEffects = uniqueEventEffectsById(
    canonicalAiPatchEffects ?? parseEventEffects(rawPatchEffects),
  );
  if ("effects" in patch && reviewedEffects.length === 0) {
    return { blockedByLock: false, isStale: false };
  }

  const storedById = new Map(
    parseEventEffects(event.effects as JsonValue).map((effect) => [effect.id, effect]),
  );
  const acceptsPatchCarriedEffects = changeSet.source === ChangeSource.AI;
  let blockedByLock = false;
  let isStale = false;
  for (const reviewed of reviewedEffects) {
    const stored = storedById.get(reviewed.id);
    // Effects declared on the event before review must still be owned by this
    // operation. A patch-only effect is new canon proposed by this operation;
    // it is deliberately absent from Event.effects until approval, so validate
    // it against live state instead of treating that absence as staleness.
    if (stored) {
      if (stored.applied || !effectBelongsToOperation(stored, changeSet.id, operation.id)) {
        isStale = true;
        continue;
      }
    } else if (!acceptsPatchCarriedEffects) {
      // DM-declared effects are written to Event.effects before their apply
      // operation is created. If one disappears, preserve the legacy stale
      // protection rather than treating it as a new effect.
      isStale = true;
      continue;
    }
    try {
      assertValidDeclaredEffect(reviewed);
      const target = eventEffectKindMeta[reviewed.kind].target;
      // Subject-derived kinds (COLLAPSE_FLOOR, target NONE) touch no hand-picked
      // entity — their floor-anchor writes are lock-checked when the op is applied.
      if (target === "NONE") continue;
      if (!reviewed.targetEntityId) continue;
      if (target === "PERSONA") {
        // A PERSONA_SHIFT drifts the target System AI's active persona into a
        // brand-new active snapshot, deactivating the current one. Surface the
        // same preconditions the apply (applyPersonaShiftEffect →
        // applyCreatePersonaSnapshot) enforces so they route through the
        // blocked/stale review workflow instead of throwing inside the approval
        // transaction: a missing/archived target or no active snapshot to shift
        // is stale; a locked active snapshot blocks the op (its activation can't
        // be flipped — same guard as assertActivePersonaUnlocked).
        await assertPersonaShiftTarget(tx, changeSet.campaignId, reviewed.targetEntityId);
        const active = await tx.personaSnapshot.findFirst({
          where: {
            campaignId: changeSet.campaignId,
            entityId: reviewed.targetEntityId,
            isActive: true,
            status: { not: CanonStatus.ARCHIVED },
          },
          select: { locked: true },
        });
        if (!active) {
          isStale = true;
          continue;
        }
        blockedByLock ||= active.locked;
        continue;
      }
      const crawler = await loadEffectTargetCrawler(
        tx,
        changeSet.campaignId,
        reviewed.targetEntityId,
      );
      const entityPatch = effectEntityPatch(reviewed, crawler);
      if (!entityPatch) continue;
      const flags = await evaluateEntityOperationFlags(
        tx,
        {
          op: OpKind.UPDATE_ENTITY,
          targetId: reviewed.targetEntityId,
          patch: entityPatch,
        },
        changeSet.campaignId,
        {},
      );
      blockedByLock ||= flags.blockedByLock;
    } catch (error) {
      if (error instanceof ServiceError) {
        isStale = true;
        continue;
      }
      throw error;
    }
  }

  return { blockedByLock, isStale };
}

async function markEventEffectReviewState(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operations: Prisma.ChangeOperationGetPayload<object>[],
  reviewStatus: "REJECTED" | "SUPERSEDED",
) {
  for (const operation of operations) {
    if (operation.op !== OpKind.APPLY_EVENT_EFFECTS || operation.targetType !== "EVENT") {
      continue;
    }
    if (!operation.targetId) continue;
    const event = await tx.event.findFirst({
      where: { id: operation.targetId, campaignId: changeSet.campaignId },
      select: { id: true, effects: true },
    });
    if (!event) continue;
    const reviewed = parseEventEffects(readTo(operation.patch as ReviewPatch, "effects"));
    const reviewedIds = new Set(reviewed.map((effect) => effect.id));
    const effects = parseEventEffects(event.effects as JsonValue);
    let changed = false;
    for (const effect of effects) {
      const matchesOperation =
        effect.pendingChangeSetId === changeSet.id ||
        effect.pendingOperationId === operation.id ||
        reviewedIds.has(effect.id);
      if (effect.applied || !matchesOperation) continue;
      effect.pendingChangeSetId = null;
      effect.pendingOperationId = null;
      effect.reviewStatus = reviewStatus;
      changed = true;
    }
    if (changed) {
      await tx.event.update({
        where: { id: event.id },
        data: { effects: serializeEventEffects(effects) },
        select: { id: true },
      });
    }
  }
}

export async function rejectChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      include: { operations: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");

    await markEventEffectReviewState(tx, changeSet, changeSet.operations, "REJECTED");
    await tx.changeOperation.updateMany({
      where: { changeSetId },
      data: { decision: OpDecision.REJECTED },
    });
    await tx.changeSet.update({
      where: { id: changeSetId },
      data: {
        status: ChangeSetStatus.REJECTED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "REJECT",
        targetType: "CHANGE_SET",
        targetId: changeSetId,
        detail: {},
      },
    });

    return { id: changeSetId };
  });
}

export async function rejectChangeSetRun(
  userId: string,
  campaignId: string,
  runId: string,
): Promise<ChangeSetRunReviewResult> {
  await assertCampaignDm(userId, campaignId);
  const normalizedRunId = normalizeRunId(runId);

  const changeSets = await pendingChangeSetsForRun(campaignId, normalizedRunId);
  if (changeSets.length === 0) {
    throw new ServiceError("Pending generator run not found.");
  }

  const rejectedIds: string[] = [];
  for (const changeSet of changeSets) {
    await rejectChangeSet(userId, campaignId, changeSet.id);
    rejectedIds.push(changeSet.id);
  }

  await prisma.auditLog.create({
    data: {
      campaignId,
      actorUserId: userId,
      action: "BULK_REJECT_RUN",
      targetType: "CHANGE_SET_RUN",
      targetId: normalizedRunId,
      detail: { rejectedIds },
    },
  });

  return {
    runId: normalizedRunId,
    approvedIds: [],
    rejectedIds,
    heldIds: [],
  };
}

/**
 * Retire a pending proposal as SUPERSEDED — obsolete or replaced, rather than
 * judged unwanted (that's reject). The set is retained for history (invariant:
 * superseded proposals are never hard-deleted); its operations keep whatever
 * decisions they carried. DM-only.
 */
export async function supersedeChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      include: { operations: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");

    await markEventEffectReviewState(tx, changeSet, changeSet.operations, "SUPERSEDED");
    await tx.changeSet.update({
      where: { id: changeSetId },
      data: {
        status: ChangeSetStatus.SUPERSEDED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "SUPERSEDE",
        targetType: "CHANGE_SET",
        targetId: changeSetId,
        detail: { reason: "manual" },
      },
    });

    return { id: changeSetId };
  });
}

// Inverse of markEventEffectReviewState: restore the effect rows a REJECTED/
// SUPERSEDED proposal had claimed back to PENDING review (re-pointing them at
// this change set/operation) so a reopened proposal is actionable again.
async function restoreEventEffectPendingState(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operations: Prisma.ChangeOperationGetPayload<object>[],
) {
  for (const operation of operations) {
    if (operation.op !== OpKind.APPLY_EVENT_EFFECTS || operation.targetType !== "EVENT") {
      continue;
    }
    if (!operation.targetId) continue;
    const event = await tx.event.findFirst({
      where: { id: operation.targetId, campaignId: changeSet.campaignId },
      select: { id: true, effects: true },
    });
    if (!event) continue;
    const reviewedIds = new Set(
      parseEventEffects(readTo(operation.patch as ReviewPatch, "effects")).map(
        (effect) => effect.id,
      ),
    );
    const effects = parseEventEffects(event.effects as JsonValue);
    let changed = false;
    for (const effect of effects) {
      if (effect.applied || !reviewedIds.has(effect.id)) continue;
      if (effect.reviewStatus !== "REJECTED" && effect.reviewStatus !== "SUPERSEDED") {
        continue;
      }
      effect.pendingChangeSetId = changeSet.id;
      effect.pendingOperationId = operation.id;
      effect.reviewStatus = "PENDING";
      changed = true;
    }
    if (changed) {
      await tx.event.update({
        where: { id: event.id },
        data: { effects: serializeEventEffects(effects) },
        select: { id: true },
      });
    }
  }
}

/**
 * Re-open a REJECTED or SUPERSEDED proposal back to PENDING so the DM can
 * reconsider it. Only safe for proposals that never touched canon — an APPROVED
 * (or PARTIALLY_APPLIED) set already wrote canon, and reverting that needs a
 * compensating change set (the deferred undo feature), so reopening it is
 * refused. Rejected operations restore edited patches (or return to PENDING),
 * superseded operation decisions stay intact, held effect rows return to
 * pending review, and a REOPEN audit row is written. DM-only.
 */
export async function reopenChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId },
      include: { operations: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");
    if (changeSet.status === ChangeSetStatus.PENDING) return { id: changeSetId };
    if (
      changeSet.status !== ChangeSetStatus.REJECTED &&
      changeSet.status !== ChangeSetStatus.SUPERSEDED
    ) {
      throw new ServiceError(
        "Approved canon can't be reopened — create a new proposal to revise it.",
      );
    }

    await restoreEventEffectPendingState(tx, changeSet, changeSet.operations);
    if (changeSet.status === ChangeSetStatus.REJECTED) {
      for (const operation of changeSet.operations) {
        await tx.changeOperation.update({
          where: { id: operation.id },
          data: {
            decision: operation.editedPatch ? OpDecision.EDITED : OpDecision.PENDING,
          },
        });
      }
    }
    await tx.changeSet.update({
      where: { id: changeSetId },
      data: {
        status: ChangeSetStatus.PENDING,
        reviewedById: null,
        reviewedAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "REOPEN",
        targetType: "CHANGE_SET",
        targetId: changeSetId,
        detail: { from: changeSet.status },
      },
    });

    return { id: changeSetId };
  });
}

export type ReviewChangeSetSummary = {
  id: string;
  title: string;
  source: ChangeSource;
  status: ChangeSetStatus;
};

// Minimal fetch for the Review Queue's post-decision "done" panel: a single
// change set in any status (so the page can show "Committed to canon" / "Run
// rejected" after it has left the pending list). DM-only; null when not found.
export async function getReviewChangeSetSummary(
  userId: string,
  campaignId: string,
  changeSetId: string,
): Promise<ReviewChangeSetSummary | null> {
  await assertCampaignDm(userId, campaignId);
  return prisma.changeSet.findFirst({
    where: {
      id: changeSetId,
      campaignId,
      status: { not: ChangeSetStatus.PENDING },
    },
    select: { id: true, title: true, source: true, status: true },
  });
}

export type EntityLockInput = {
  // Whole-entity lock. Omit to leave the current value unchanged.
  locked?: boolean;
  // Field-level locks. Omit to leave the current set unchanged; pass [] to clear.
  lockedFields?: string[];
};

function sortedUnique(fields: string[]) {
  return Array.from(new Set(fields)).sort();
}

/**
 * Place or release a canon lock on an entity. Locking is a deliberate DM action
 * — not a proposal — and is itself audited (docs/03-review-pipeline.md). It does
 * not bump `version`: a lock protects content from automated edits without
 * making pending proposals look stale.
 */
export async function setEntityLock(
  userId: string,
  campaignId: string,
  entityId: string,
  input: EntityLockInput,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const entity = await tx.entity.findFirst({
      where: {
        id: entityId,
        campaignId,
        status: { not: CanonStatus.ARCHIVED },
      },
      select: { id: true, locked: true, lockedFields: true },
    });
    if (!entity) throw new ServiceError("Entity not found.");

    const nextLocked = input.locked ?? entity.locked;
    const nextLockedFields =
      input.lockedFields !== undefined
        ? sortedUnique(input.lockedFields)
        : sortedUnique(entity.lockedFields);
    const prevLockedFields = sortedUnique(entity.lockedFields);

    const lockedChanged = nextLocked !== entity.locked;
    const fieldsChanged =
      JSON.stringify(nextLockedFields) !== JSON.stringify(prevLockedFields);
    if (!lockedChanged && !fieldsChanged) {
      return {
        id: entity.id,
        locked: entity.locked,
        lockedFields: prevLockedFields,
      };
    }

    const updated = await tx.entity.update({
      where: { id: entityId },
      data: { locked: nextLocked, lockedFields: nextLockedFields },
      select: { id: true, locked: true, lockedFields: true },
    });

    let action = "SET_FIELD_LOCKS";
    if (lockedChanged) {
      action = nextLocked ? "LOCK" : "UNLOCK";
    }
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action,
        targetType: "ENTITY",
        targetId: entityId,
        detail: {
          locked: updated.locked,
          lockedFields: updated.lockedFields,
          previousLocked: entity.locked,
          previousLockedFields: prevLockedFields,
        },
      },
    });

    return updated;
  });
}

export type EntityProvenance = {
  source: ChangeSource;
  authorLabel: string | null;
  createdAt: Date;
  model: string | null;
  approvedByLabel: string | null;
  approvedAt: Date | null;
  lastChangeTitle: string;
  lastChangeSource: ChangeSource;
  lastChangeModel: string | null;
  changeCount: number;
};

/**
 * Provenance summary for an entity, derived from the change operations that
 * targeted it: origin (who/what created it, and who approved it) plus the most
 * recent change. Provenance is permanent — this is the "where did this come
 * from?" answer the product promises. Any campaign member may read it.
 */
export async function getEntityProvenance(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<EntityProvenance | null> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return null;

  const ops = await prisma.changeOperation.findMany({
    where: {
      targetType: "ENTITY",
      targetId: entityId,
      changeSet: {
        campaignId,
        status: { in: [ChangeSetStatus.APPROVED, ChangeSetStatus.PARTIALLY_APPLIED] },
      },
      decision: { in: [OpDecision.ACCEPTED, OpDecision.EDITED] },
    },
    orderBy: { changeSet: { createdAt: "asc" } },
    select: {
      changeSet: {
        select: {
          title: true,
          source: true,
          model: true,
          createdAt: true,
          reviewedAt: true,
          actor: { select: { name: true, email: true } },
          reviewer: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (ops.length === 0) return null;

  const origin = ops[0].changeSet;
  const last = ops[ops.length - 1].changeSet;
  const label = (u: { name: string | null; email: string } | null) =>
    u?.name || u?.email || null;

  // The "Model" row should reflect the most recent change that actually ran a
  // model — typically an AI flesh-out — not the (usually null) origin model of a
  // DM-created entity. Otherwise an AI contribution is invisible in provenance.
  const latestModel = ops.reduce<string | null>(
    (acc, op) => op.changeSet.model ?? acc,
    null,
  );

  return {
    source: origin.source,
    authorLabel: label(origin.actor),
    createdAt: origin.createdAt,
    model: latestModel,
    approvedByLabel: label(origin.reviewer),
    approvedAt: origin.reviewedAt,
    lastChangeTitle: last.title,
    lastChangeSource: last.source,
    lastChangeModel: last.model,
    changeCount: ops.length,
  };
}

async function applyEntityOperation(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operation: Prisma.ChangeOperationGetPayload<object>,
  patchOverride?: ReviewPatch,
) {
  if (operation.targetType !== "ENTITY") {
    throw new ServiceError("Unsupported operation target.");
  }
  const patch = patchOverride ?? operation.patch as ReviewPatch;

  switch (operation.op) {
    case OpKind.CREATE_ENTITY:
      return applyCreateEntity(tx, changeSet, operation.id, patch);
    case OpKind.UPDATE_ENTITY:
      if (!operation.targetId) throw new ServiceError("Missing entity target.");
      return applyUpdateEntity(tx, changeSet, operation.id, operation.targetId, patch);
    case OpKind.DELETE_ENTITY:
      if (!operation.targetId) throw new ServiceError("Missing entity target.");
      return applyDeleteEntity(tx, changeSet, operation.id, operation.targetId, patch);
    default:
      throw new ServiceError("Unsupported entity operation.");
  }
}

async function applyCreateEntity(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  patch: ReviewPatch,
) {
  const type = readTo(patch, "type");
  if (typeof type !== "string") throw new ServiceError("Entity type is required.");
  assertKnownEntityDataPatchFields(type, patch);

  if (type === EntityType.FLOOR) {
    const floorNumber = optionalNumber(readTo(patch, "data.floorNumber"));
    if (floorNumber != null) {
      await assertFloorNumberAvailable(tx, changeSet.campaignId, floorNumber);
    }
  }

  const entity = await tx.entity.create({
    data: {
      campaignId: changeSet.campaignId,
      createdById: changeSet.actorUserId,
      type: type as EntityType,
      name: String(readTo(patch, "name") ?? ""),
      summary: nullableString(readTo(patch, "summary")),
      description: nullableString(readTo(patch, "description")),
      imageUrl: sanitizeImageUrl(readTo(patch, "imageUrl")),
      visibility: (readTo(patch, "visibility") as Visibility) ?? Visibility.DM_ONLY,
      source: changeSet.source,
      tags: stringArray(readTo(patch, "tags")),
      status: CanonStatus.CANON,
      isStub: Boolean(readTo(patch, "isStub") ?? false),
      // Bespoke `data.*` fields are composed from the type's entity-kind
      // descriptor (ADR 0009) instead of a `type === "X"` switch — each entity
      // stores only its own kind's fields.
      data: buildKindData(type, (key) =>
        readTo(patch, `data.${key}`),
      ) as Prisma.InputJsonValue,
      ...(type === EntityType.CRAWLER
        ? {
            crawler: {
              create: crawlerCreateData(patch),
            },
          }
        : {}),
      // FACTION's bespoke fields live in the 1:1 satellite (ADR 0011 Part C);
      // buildKindData already kept them out of the JSON blob above.
      ...(type === EntityType.FACTION
        ? {
            faction: {
              create: factionSatelliteData(patch),
            },
          }
        : {}),
      // FLOOR's bespoke fields likewise live in the 1:1 Floor satellite (ADR 0011
      // Part C); a freshly-created FLOOR's blob is just `{_v:3}`.
      ...(type === EntityType.FLOOR
        ? {
            floor: {
              create: floorSatelliteData(patch),
            },
          }
        : {}),
    },
    select: { id: true },
  });

  await writeEntityProvenance(tx, changeSet, entity.id, patch);
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { entityId: entity.id, op: OpKind.CREATE_ENTITY },
    },
  });
  // Mirror the new canon into the search index (M5, search-index.ts) in the
  // same transaction so retrieval is fresh the moment the write commits.
  await indexEntity(tx, changeSet.campaignId, entity.id, reembedIndexOptions(changeSet));
  return entity.id;
}

async function applyUpdateEntity(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  entityId: string,
  patch: ReviewPatch,
) {
  const isRestore = restoresArchivedStatus(patch);
  const entity = await tx.entity.findFirst({
    where: {
      id: entityId,
      campaignId: changeSet.campaignId,
      status: isRestore ? CanonStatus.ARCHIVED : { not: CanonStatus.ARCHIVED },
    },
    select: {
      id: true,
      type: true,
      version: true,
      locked: true,
      lockedFields: true,
      data: true,
      // FLOOR's anchors live in the satellite once migrated (ADR 0011 Part C);
      // the floor re-rank below resolves `before` through readFloorData(data, floor).
      floor: floorSatelliteSelect,
    },
  });
  if (!entity) throw new ServiceError("Entity not found.");
  assertKnownEntityDataPatchFields(entity.type, patch);

  const expectedVersion = baseVersionsObject(changeSet.baseVersions)[entityId];
  if (typeof expectedVersion === "number" && expectedVersion !== entity.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError("Entity changed since this proposal was created.", {
      code: "OPERATION_STALE",
    });
  }

  const lockedFields = lockedPatchFields(patch, entity.locked, entity.lockedFields);
  if (changeSet.source !== ChangeSource.MIGRATION && lockedFields.length > 0) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    if (entity.locked) {
      throw new ServiceError("Cannot update because the entity is locked.", {
        code: "OPERATION_BLOCKED",
      });
    }
    const fieldsText = lockedFields.map((f) => `"${f}"`).join(", ");
    throw new ServiceError(`This proposal touches locked entity fields: ${fieldsText}`, {
      code: "OPERATION_BLOCKED",
    });
  }

  if (entity.type === EntityType.FLOOR && "data.floorNumber" in patch) {
    const floorNumber = optionalNumber(readTo(patch, "data.floorNumber"));
    if (floorNumber != null) {
      await assertFloorNumberAvailable(tx, changeSet.campaignId, floorNumber, entityId);
    }
  }

  const data = entityUpdateData(
    patch,
    entity.type,
    entity.data,
    satelliteRowOf(entity.type, entity),
  );
  await tx.entity.update({
    where: { id: entityId },
    data,
    select: { id: true },
  });
  await writeEntityProvenance(tx, changeSet, entityId, patch);

  // A FLOOR's open/collapse anchors place FLOOR_START / FLOOR_COLLAPSE event times
  // (and their EVENT-basis dependents) on the absolute-day axis (ADR 0008), keyed
  // by the floor's number. An anchor edit re-orders that floor; a number edit
  // re-keys the anchor map for *both* the old and new number (the old number's
  // events lose their anchor, the new number's gain it). Re-derive every affected
  // floor — the floor analogue of the event-time re-rank above. Skip when nothing
  // actually moved.
  if (
    entity.type === EntityType.FLOOR &&
    ("data.startDay" in patch ||
      "data.collapseDay" in patch ||
      "data.floorNumber" in patch)
  ) {
    // Migration can persist a raw `"61"` anchor as `61` without changing the
    // semantic read shape; existing ranks still need rebuilding because they may
    // have been computed before that anchor was resolvable.
    const persistedBefore = readPersistedFloorDataWithoutMigrations(
      entity.data,
      entity.floor,
    );
    const before = readFloorData(entity.data, entity.floor);
    const afterFloorNumber =
      "data.floorNumber" in patch
        ? optionalNumber(readTo(patch, "data.floorNumber"))
        : before.floorNumber;
    const afterStartDay =
      "data.startDay" in patch
        ? optionalNumber(readTo(patch, "data.startDay"))
        : before.startDay;
    const afterCollapseDay =
      "data.collapseDay" in patch
        ? optionalNumber(readTo(patch, "data.collapseDay"))
        : before.collapseDay;
    const numberMoved = afterFloorNumber !== before.floorNumber;
    const anchorsMoved =
      afterStartDay !== before.startDay || afterCollapseDay !== before.collapseDay;
    const storageResolved =
      persistedBefore.floorNumber !== before.floorNumber ||
      persistedBefore.startDay !== before.startDay ||
      persistedBefore.collapseDay !== before.collapseDay;
    if (numberMoved || anchorsMoved || storageResolved) {
      const affectedFloors = new Set<number>();
      if (persistedBefore.floorNumber != null) {
        affectedFloors.add(persistedBefore.floorNumber);
      }
      if (before.floorNumber != null) affectedFloors.add(before.floorNumber);
      if (afterFloorNumber != null) affectedFloors.add(afterFloorNumber);
      for (const floorNumber of affectedFloors) {
        await rerankFloor(tx, changeSet.campaignId, floorNumber);
      }
    }
  }
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { entityId, op: OpKind.UPDATE_ENTITY },
    },
  });
  // Refresh the search index from the entity's final persisted state (a restore
  // re-adds it; a content edit re-indexes; a visibility change re-mirrors).
  await indexEntity(tx, changeSet.campaignId, entityId, reembedIndexOptions(changeSet));
  return entityId;
}

async function applyDeleteEntity(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  entityId: string,
  patch: ReviewPatch,
) {
  const entity = await tx.entity.findFirst({
    where: {
      id: entityId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, version: true, locked: true, lockedFields: true },
  });
  if (!entity) throw new ServiceError("Entity not found.");

  const expectedVersion = baseVersionsObject(changeSet.baseVersions)[entityId];
  if (typeof expectedVersion === "number" && expectedVersion !== entity.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError("Entity changed since this proposal was created.", {
      code: "OPERATION_STALE",
    });
  }

  if (entity.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This entity is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }

  await tx.entity.update({
    where: { id: entityId },
    data: { status: CanonStatus.ARCHIVED, version: { increment: 1 } },
    select: { id: true },
  });
  await writeEntityProvenance(tx, changeSet, entityId, patch);
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { entityId, op: OpKind.DELETE_ENTITY },
    },
  });
  // The entity is now ARCHIVED, so indexEntity drops its SearchDoc — archived
  // canon must not surface in search (it's hidden everywhere else too).
  await indexEntity(tx, changeSet.campaignId, entityId, reembedIndexOptions(changeSet));
  return entityId;
}

// Build the FACTION satellite row from a change-set patch (ADR 0011 Part C). The
// fields are addressed by their reviewable `data.*` patch keys (FACTION's
// entity-kind descriptor), but persist to the 1:1 Faction table, not Entity.data.
// Read a satellite field's value for the *create* side of an upsert: the patched
// value when this op touches the field, otherwise the entity's current resolved
// value (`fallback`). The fallback matters when a satellite row is created from a
// *partial* update of a not-yet-migrated (blob-backed) entity — the unpatched
// fields must carry over from the blob into the new satellite row, not reset to
// null. On the pure-create path there is no fallback and the patch carries every
// field. `fallback` is `readKindData`'s already-normalized current data.
function satelliteCreateRead(
  patch: ReviewPatch,
  fallback: Record<string, unknown> | undefined,
  key: string,
): JsonValue | undefined {
  return `data.${key}` in patch
    ? readTo(patch, `data.${key}`)
    : (fallback?.[key] as JsonValue | undefined);
}

function factionSatelliteData(
  patch: ReviewPatch,
  fallback?: Record<string, unknown>,
): Prisma.FactionCreateWithoutEntityInput {
  const read = (key: string) => satelliteCreateRead(patch, fallback, key);
  return {
    standing: optionalNumber(read("standing")),
    strength: optionalNumber(read("strength")),
    allegiance: nullableString(read("allegiance")),
    resources: nullableString(read("resources")),
  };
}

// Build the FLOOR satellite row from a change-set patch (ADR 0011 Part C). Like
// factionSatelliteData, the fields are addressed by their reviewable `data.*`
// patch keys (FLOOR's entity-kind descriptor) but persist to the 1:1 Floor table,
// not Entity.data. This is the write half of the genuine `data → satellite`
// migration: MIGRATE_ENTITY_DATA re-applies a legacy floor's stored values as a
// `data.*` patch, which this routes into the satellite.
function floorSatelliteData(
  patch: ReviewPatch,
  fallback?: Record<string, unknown>,
): Prisma.FloorCreateWithoutEntityInput {
  const read = (key: string) => satelliteCreateRead(patch, fallback, key);
  return {
    floorNumber: optionalNumber(read("floorNumber")),
    theme: nullableString(read("theme")),
    startDay: optionalNumber(read("startDay")),
    collapseDay: optionalNumber(read("collapseDay")),
  };
}

function crawlerCreateData(patch: ReviewPatch) {
  return {
    realName: nullableString(readTo(patch, "crawler.realName")),
    crawlerNo: nullableString(readTo(patch, "crawler.crawlerNo")),
    level: numberWithDefault(readTo(patch, "crawler.level"), 1),
    hp: optionalNumber(readTo(patch, "crawler.hp")),
    mp: optionalNumber(readTo(patch, "crawler.mp")),
    gold: numberWithDefault(readTo(patch, "crawler.gold"), 0),
    viewCount: bigintWithDefault(readTo(patch, "crawler.viewCount"), BigInt(0)),
    followerCount: bigintWithDefault(
      readTo(patch, "crawler.followerCount"),
      BigInt(0),
    ),
    favoriteCount: bigintWithDefault(
      readTo(patch, "crawler.favoriteCount"),
      BigInt(0),
    ),
    killCount: numberWithDefault(readTo(patch, "crawler.killCount"), 0),
    isAlive: booleanWithDefault(readTo(patch, "crawler.isAlive"), true),
    currentFloor: optionalNumber(readTo(patch, "crawler.currentFloor")),
  };
}

function entityUpdateData(
  patch: ReviewPatch,
  type: EntityType,
  existingData?: unknown,
  existingSatellite?: unknown,
): Prisma.EntityUpdateInput {
  const data: Prisma.EntityUpdateInput = {
    version: { increment: 1 },
  };
  // The entity's current resolved bespoke data (blob + satellite). Used as the
  // create-side fallback for a satellite upsert so a *partial* edit of a
  // not-yet-migrated (blob-backed) entity carries its unpatched fields into the
  // new satellite row instead of nulling them (ADR 0011 Part C).
  const resolvedData = readKindData(type, existingData, existingSatellite);
  if ("status" in patch) {
    data.status = (readTo(patch, "status") as CanonStatus) ?? CanonStatus.CANON;
  }
  if ("name" in patch) data.name = String(readTo(patch, "name") ?? "");
  if ("summary" in patch) data.summary = nullableString(readTo(patch, "summary"));
  if ("description" in patch) {
    data.description = nullableString(readTo(patch, "description"));
  }
  if ("imageUrl" in patch) data.imageUrl = sanitizeImageUrl(readTo(patch, "imageUrl"));
  if ("visibility" in patch) {
    data.visibility = (readTo(patch, "visibility") as Visibility) ?? Visibility.DM_ONLY;
  }
  if ("tags" in patch) data.tags = stringArray(readTo(patch, "tags"));
  if ("isStub" in patch) data.isStub = Boolean(readTo(patch, "isStub"));

  const crawlerPatch = Object.keys(patch).some((field) => crawlerFields.has(field));
  if (type === EntityType.CRAWLER && crawlerPatch) {
    const crawlerData: Prisma.CrawlerUpdateInput = {};
    if ("crawler.realName" in patch) {
      crawlerData.realName = nullableString(readTo(patch, "crawler.realName"));
    }
    if ("crawler.crawlerNo" in patch) {
      crawlerData.crawlerNo = nullableString(readTo(patch, "crawler.crawlerNo"));
    }
    if ("crawler.level" in patch) {
      crawlerData.level = numberWithDefault(readTo(patch, "crawler.level"), 1);
    }
    if ("crawler.hp" in patch) crawlerData.hp = optionalNumber(readTo(patch, "crawler.hp"));
    if ("crawler.mp" in patch) crawlerData.mp = optionalNumber(readTo(patch, "crawler.mp"));
    if ("crawler.gold" in patch) {
      crawlerData.gold = numberWithDefault(readTo(patch, "crawler.gold"), 0);
    }
    if ("crawler.viewCount" in patch) {
      crawlerData.viewCount = bigintWithDefault(
        readTo(patch, "crawler.viewCount"),
        BigInt(0),
      );
    }
    if ("crawler.followerCount" in patch) {
      crawlerData.followerCount = bigintWithDefault(
        readTo(patch, "crawler.followerCount"),
        BigInt(0),
      );
    }
    if ("crawler.favoriteCount" in patch) {
      crawlerData.favoriteCount = bigintWithDefault(
        readTo(patch, "crawler.favoriteCount"),
        BigInt(0),
      );
    }
    if ("crawler.killCount" in patch) {
      crawlerData.killCount = numberWithDefault(
        readTo(patch, "crawler.killCount"),
        0,
      );
    }
    if ("crawler.isAlive" in patch) {
      crawlerData.isAlive = booleanWithDefault(
        readTo(patch, "crawler.isAlive"),
        true,
      );
    }
    if ("crawler.currentFloor" in patch) {
      crawlerData.currentFloor = optionalNumber(
        readTo(patch, "crawler.currentFloor"),
      );
    }
    data.crawler = { update: crawlerData };
  }

  // FACTION's bespoke fields are reviewable `data.*` canon stored in the 1:1
  // satellite (ADR 0011 Part C). Route the patched ones there and upsert so a
  // FACTION created before the satellite existed gains its row on first edit;
  // unpatched fields stay untouched. They are excluded from the JSON merge below.
  if (type === EntityType.FACTION) {
    const factionData: Prisma.FactionUpdateInput = {};
    if ("data.standing" in patch) {
      factionData.standing = optionalNumber(readTo(patch, "data.standing"));
    }
    if ("data.strength" in patch) {
      factionData.strength = optionalNumber(readTo(patch, "data.strength"));
    }
    if ("data.allegiance" in patch) {
      factionData.allegiance = nullableString(readTo(patch, "data.allegiance"));
    }
    if ("data.resources" in patch) {
      factionData.resources = nullableString(readTo(patch, "data.resources"));
    }
    if (Object.keys(factionData).length > 0) {
      data.faction = {
        upsert: {
          create: factionSatelliteData(patch, resolvedData),
          update: factionData,
        },
      };
    }
  }

  // FLOOR's bespoke fields are reviewable `data.*` canon stored in the 1:1 Floor
  // satellite (ADR 0011 Part C). Route the patched ones there and upsert so a
  // legacy FLOOR (created before the satellite existed) gains its row on the
  // migration's first edit — this is the apply half of the `data → satellite`
  // move. They are excluded from the JSON merge below.
  if (type === EntityType.FLOOR) {
    const floorData: Prisma.FloorUpdateInput = {};
    if ("data.floorNumber" in patch) {
      floorData.floorNumber = optionalNumber(readTo(patch, "data.floorNumber"));
    }
    if ("data.theme" in patch) {
      floorData.theme = nullableString(readTo(patch, "data.theme"));
    }
    if ("data.startDay" in patch) {
      floorData.startDay = optionalNumber(readTo(patch, "data.startDay"));
    }
    if ("data.collapseDay" in patch) {
      floorData.collapseDay = optionalNumber(readTo(patch, "data.collapseDay"));
    }
    if (Object.keys(floorData).length > 0) {
      data.floor = {
        upsert: {
          create: floorSatelliteData(patch, resolvedData),
          update: floorData,
        },
      };
    }
  }

  // Any bespoke `data.*` field in the patch rewrites the JSON blob — even a
  // satellite-only edit, whose field *values* are routed to the satellite above
  // but whose version stamp still lives in the blob. Re-stamping here is what lets
  // a satellite type's row converge to the current `_v` after a migration; without
  // it a pure-satellite kind would stay perpetually stale (ADR 0011 Part C/D).
  const dataPatch = Object.keys(patch).some((field) => dataFields.has(field));
  if (dataPatch) {
    // Read the existing data through the current descriptor seam before merging
    // the patch, so untouched renamed/retyped fields migrate and off-schema keys
    // do not survive a strict data write (ADR 0011 slice 2).
    const currentData = readKindData(type, existingData);
    for (const key of allKindDataKeys()) {
      // Satellite-backed keys are persisted to their table, not the JSON blob —
      // drop any the seam normalized in (it has no satellite row to read here).
      if (satelliteDataFields.has(`data.${key}`)) {
        delete currentData[key];
        continue;
      }
      const field = `data.${key}`;
      if (field in patch) {
        currentData[key] = normalizeKindFieldValue(key, readTo(patch, field));
      }
    }
    // Re-stamp the schema version on every bespoke-data write (ADR 0011) so an
    // edited row converges to the current `_v` (only kind types reach this branch,
    // since `dataFields` are the registered kinds' keys).
    currentData[RESERVED_DATA_KEY] = schemaVersionFor(type);
    data.data = currentData as Prisma.InputJsonValue;
  }

  return data;
}

async function writeEntityProvenance(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  entityId: string,
  patch: ReviewPatch,
) {
  const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
  await tx.provenance.createMany({
    data: fields.map((field) => ({
      campaignId: changeSet.campaignId,
      entityId,
      changeSetId: changeSet.id,
      source: changeSet.source,
      field,
      actorUserId: changeSet.actorUserId,
      providerId: changeSet.providerId,
      model: changeSet.model,
      promptId: changeSet.promptId,
      runId: changeSet.runId,
      // M6 — carry the driving persona onto each field's provenance so the
      // PersonaSnapshot.provenance relation can answer "what did this persona
      // generate?" (the prompt version stays on the change set).
      personaSnapshotId: changeSet.personaSnapshotId,
    })),
  });
}

async function applyRelationshipOperation(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operation: Prisma.ChangeOperationGetPayload<object>,
  patchOverride?: ReviewPatch,
) {
  if (operation.targetType !== "RELATIONSHIP") {
    throw new ServiceError("Unsupported operation target.");
  }
  const patch = patchOverride ?? (operation.patch as ReviewPatch);

  switch (operation.op) {
    case OpKind.CREATE_RELATIONSHIP:
      return applyCreateRelationship(tx, changeSet, operation.id, patch);
    case OpKind.UPDATE_RELATIONSHIP:
      if (!operation.targetId) throw new ServiceError("Missing relationship target.");
      return applyUpdateRelationship(
        tx,
        changeSet,
        operation.id,
        operation.targetId,
        patch,
      );
    case OpKind.DELETE_RELATIONSHIP:
      if (!operation.targetId) throw new ServiceError("Missing relationship target.");
      return applyDeleteRelationship(
        tx,
        changeSet,
        operation.id,
        operation.targetId,
        patch,
      );
    default:
      throw new ServiceError("Unsupported relationship operation.");
  }
}

async function assertCanonEntity(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
) {
  // Relationship endpoints must be live canon — not draft/pending/rejected/
  // archived — so an edge never references unapproved content.
  const entity = await tx.entity.findFirst({
    where: { id: entityId, campaignId, status: CanonStatus.CANON },
    select: { id: true },
  });
  if (!entity) throw new ServiceError("Entity not found.");
}

async function applyCreateRelationship(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  patch: ReviewPatch,
) {
  const type = readTo(patch, "type");
  const sourceId = readTo(patch, "sourceId");
  const targetId = readTo(patch, "targetId");
  if (typeof type !== "string") throw new ServiceError("Relationship type is required.");
  if (typeof sourceId !== "string" || typeof targetId !== "string") {
    throw new ServiceError("Relationship endpoints are required.");
  }
  if (sourceId === targetId) {
    throw new ServiceError("A relationship needs two different entities.");
  }
  await assertCanonEntity(tx, changeSet.campaignId, sourceId);
  await assertCanonEntity(tx, changeSet.campaignId, targetId);
  const sinceDay = relationshipDayBound(readTo(patch, "sinceDay"), "Since day");
  const untilDay = relationshipDayBound(readTo(patch, "untilDay"), "Until day");
  validateRelationshipDayBounds(sinceDay, untilDay);

  const relationship = await tx.relationship.create({
    data: {
      campaignId: changeSet.campaignId,
      type: type as RelationshipType,
      sourceId,
      targetId,
      disposition: optionalNumber(readTo(patch, "disposition")),
      sinceDay,
      untilDay,
      notes: nullableString(readTo(patch, "notes")),
      secret: booleanWithDefault(readTo(patch, "secret"), false),
      source: changeSet.source,
      status: CanonStatus.CANON,
    },
    select: { id: true },
  });

  await writeRelationshipProvenance(tx, changeSet, relationship.id, patch);
  await indexRelationship(
    tx,
    changeSet.campaignId,
    relationship.id,
    reembedIndexOptions(changeSet),
  );
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { relationshipId: relationship.id, op: OpKind.CREATE_RELATIONSHIP },
    },
  });
  return relationship.id;
}

// Edit a live edge's mutable fields (type/disposition/notes/secret). Endpoints
// are never edited — re-pointing an edge is a delete + recreate so provenance
// stays honest. Locked edges block, like deletes.
async function applyUpdateRelationship(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  relationshipId: string,
  patch: ReviewPatch,
) {
  const isRestore = restoresArchivedStatus(patch);
  const relationship = await tx.relationship.findFirst({
    where: {
      id: relationshipId,
      campaignId: changeSet.campaignId,
      status: isRestore ? CanonStatus.ARCHIVED : { not: CanonStatus.ARCHIVED },
    },
    select: {
      id: true,
      locked: true,
      version: true,
      sourceId: true,
      targetId: true,
      sinceDay: true,
      untilDay: true,
    },
  });
  if (!relationship) throw new ServiceError("Relationship not found.");

  // Reject a stale edit (the row advanced since this edit was built), the same
  // way applyUpdateEntity does — so concurrent DM edits don't silently clobber.
  const expectedVersion = readTo(patch, "_baseVersion");
  if (typeof expectedVersion === "number" && expectedVersion !== relationship.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError(
      "This relationship changed since you opened it. Reload and try again.",
      { code: "OPERATION_STALE" },
    );
  }

  if (relationship.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This relationship is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }
  if (isRestore) {
    await assertCanonEntity(tx, changeSet.campaignId, relationship.sourceId);
    await assertCanonEntity(tx, changeSet.campaignId, relationship.targetId);
  }

  const data: Prisma.RelationshipUpdateInput = { version: { increment: 1 } };
  if ("status" in patch) {
    data.status = (readTo(patch, "status") as CanonStatus) ?? CanonStatus.CANON;
  }
  if ("type" in patch) {
    const type = readTo(patch, "type");
    if (typeof type !== "string") throw new ServiceError("Relationship type is required.");
    data.type = type as RelationshipType;
  }
  if ("disposition" in patch) data.disposition = optionalNumber(readTo(patch, "disposition"));
  const nextSinceDay = "sinceDay" in patch
    ? relationshipDayBound(readTo(patch, "sinceDay"), "Since day")
    : relationship.sinceDay;
  const nextUntilDay = "untilDay" in patch
    ? relationshipDayBound(readTo(patch, "untilDay"), "Until day")
    : relationship.untilDay;
  validateRelationshipDayBounds(nextSinceDay, nextUntilDay);
  if ("sinceDay" in patch) data.sinceDay = nextSinceDay;
  if ("untilDay" in patch) data.untilDay = nextUntilDay;
  if ("notes" in patch) data.notes = nullableString(readTo(patch, "notes"));
  if ("secret" in patch) data.secret = booleanWithDefault(readTo(patch, "secret"), false);

  await tx.relationship.update({
    where: { id: relationshipId },
    data,
    select: { id: true },
  });
  await writeRelationshipProvenance(tx, changeSet, relationshipId, patch);
  await indexRelationship(
    tx,
    changeSet.campaignId,
    relationshipId,
    reembedIndexOptions(changeSet),
  );
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { relationshipId, op: OpKind.UPDATE_RELATIONSHIP },
    },
  });
  return relationshipId;
}

async function applyDeleteRelationship(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  relationshipId: string,
  patch: ReviewPatch,
) {
  const relationship = await tx.relationship.findFirst({
    where: {
      id: relationshipId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true, version: true },
  });
  if (!relationship) throw new ServiceError("Relationship not found.");

  // Re-check staleness in-transaction, the same way applyUpdateRelationship
  // does — the pre-flight flag refresh runs in a separate transaction, so an
  // edge edited in that window must hold the delete rather than archive the
  // newer edge.
  const expectedVersion = readTo(patch, "_baseVersion");
  if (typeof expectedVersion === "number" && expectedVersion !== relationship.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError(
      "This relationship changed since you opened it. Reload and try again.",
      { code: "OPERATION_STALE" },
    );
  }

  if (relationship.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This relationship is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }

  await tx.relationship.update({
    where: { id: relationshipId },
    data: { status: CanonStatus.ARCHIVED, version: { increment: 1 } },
    select: { id: true },
  });
  // The edge is now ARCHIVED, so indexRelationship drops its SearchDoc.
  await indexRelationship(
    tx,
    changeSet.campaignId,
    relationshipId,
    reembedIndexOptions(changeSet),
  );
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { relationshipId, op: OpKind.DELETE_RELATIONSHIP },
    },
  });
  return relationshipId;
}

async function writeRelationshipProvenance(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  relationshipId: string,
  patch: ReviewPatch,
) {
  const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
  await tx.provenance.createMany({
    data: fields.map((field) => ({
      campaignId: changeSet.campaignId,
      relationshipId,
      changeSetId: changeSet.id,
      source: changeSet.source,
      field,
      actorUserId: changeSet.actorUserId,
      providerId: changeSet.providerId,
      model: changeSet.model,
      promptId: changeSet.promptId,
      runId: changeSet.runId,
    })),
  });
}

async function applyPersonaSnapshotOperation(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operation: Prisma.ChangeOperationGetPayload<object>,
  patchOverride?: ReviewPatch,
) {
  if (operation.targetType !== "PERSONA_SNAPSHOT") {
    throw new ServiceError("Unsupported operation target.");
  }
  const patch = patchOverride ?? (operation.patch as ReviewPatch);

  switch (operation.op) {
    case OpKind.CREATE_PERSONA_SNAPSHOT:
      return applyCreatePersonaSnapshot(tx, changeSet, operation.id, patch);
    case OpKind.UPDATE_PERSONA_SNAPSHOT:
      if (!operation.targetId) throw new ServiceError("Missing persona snapshot target.");
      return applyUpdatePersonaSnapshot(
        tx,
        changeSet,
        operation.id,
        operation.targetId,
        patch,
      );
    default:
      throw new ServiceError("Unsupported persona snapshot operation.");
  }
}

async function assertCanonPersonaEntity(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
) {
  const entity = await tx.entity.findFirst({
    where: { id: entityId, campaignId, status: CanonStatus.CANON },
    select: { id: true },
  });
  if (!entity) throw new ServiceError("Entity not found.");
  return entity;
}

// True when the entity already has a locked active snapshot (optionally
// excluding the snapshot being updated). Activating a different snapshot has to
// deactivate the current active one; when that row is locked the activation
// must be held instead of silently flipping it.
async function hasLockedActivePersona(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
  exceptSnapshotId?: string,
) {
  const locked = await tx.personaSnapshot.findFirst({
    where: {
      campaignId,
      entityId,
      isActive: true,
      locked: true,
      ...(exceptSnapshotId ? { id: { not: exceptSnapshotId } } : {}),
    },
    select: { id: true },
  });
  return locked !== null;
}

// Defense-in-depth for the auto-approve path (which skips the preflight lock
// flags): refuse to deactivate a locked active snapshot, flagging the operation
// like the other apply-time lock guards.
async function assertActivePersonaUnlocked(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
  operationId: string,
  exceptSnapshotId?: string,
) {
  if (await hasLockedActivePersona(tx, campaignId, entityId, exceptSnapshotId)) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("The active persona snapshot is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }
}

// Serialize persona activations for a single entity. The "one active snapshot
// per entity" invariant is maintained by deactivating the current active row
// before writing the new one; under the default Read Committed isolation two
// concurrent approvals could each clear the prior active row and then write
// their own, leaving two rows with isActive=true. A transaction-scoped advisory
// lock keyed on (campaign, entity) makes the second activation wait for the
// first to commit, so the deactivate-then-write always sees a consistent "one
// active" set. Released automatically when the transaction ends.
async function lockPersonaActivation(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${campaignId}), hashtext(${entityId}))`;
}

function personaKnowledgeScope(value: JsonValue | undefined) {
  return value === "IN_CHARACTER" ? "IN_CHARACTER" : "OMNISCIENT";
}

function jsonArray(value: JsonValue | undefined): Prisma.InputJsonValue {
  return Array.isArray(value) ? (value as Prisma.InputJsonValue) : [];
}

type PersonaPromptBase = {
  label: string | null;
  dials: Prisma.JsonValue;
  values: Prisma.JsonValue;
  agendas: Prisma.JsonValue;
  resources: Prisma.JsonValue;
  knowledgeScope: string;
  voiceGuide: string | null;
  constraints: string | null;
};

function compilePromptFromPersonaPatch(
  patch: ReviewPatch,
  existing?: PersonaPromptBase,
) {
  const explicit = nullableString(readTo(patch, "compiledPrompt"));
  if (explicit) return explicit;
  const resources = "resources" in patch
    ? jsonObject(readTo(patch, "resources"))
    : existing?.resources;
  return compilePersonaPrompt({
    label:
      "label" in patch ? nullableString(readTo(patch, "label")) : existing?.label,
    dials: ("dials" in patch ? jsonObject(readTo(patch, "dials")) : existing?.dials) as
      | Record<string, unknown>
      | undefined,
    values: "values" in patch ? jsonArray(readTo(patch, "values")) : existing?.values,
    agendas:
      "agendas" in patch ? jsonArray(readTo(patch, "agendas")) : existing?.agendas,
    resources:
      resources && typeof resources === "object" && !Array.isArray(resources)
        ? (resources as Record<string, unknown>)
        : undefined,
    knowledgeScope:
      "knowledgeScope" in patch
        ? personaKnowledgeScope(readTo(patch, "knowledgeScope"))
        : existing?.knowledgeScope,
    voiceGuide:
      "voiceGuide" in patch
        ? nullableString(readTo(patch, "voiceGuide"))
        : existing?.voiceGuide,
    constraints:
      "constraints" in patch
        ? nullableString(readTo(patch, "constraints"))
        : existing?.constraints,
  });
}

function personaPromptSourceFieldChanged(patch: ReviewPatch) {
  return [
    "label",
    "dials",
    "values",
    "agendas",
    "resources",
    "knowledgeScope",
    "voiceGuide",
    "constraints",
  ].some((field) => field in patch);
}

async function applyCreatePersonaSnapshot(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  patch: ReviewPatch,
) {
  const entityId = readTo(patch, "entityId");
  if (typeof entityId !== "string") {
    throw new ServiceError("Persona snapshot entity is required.");
  }
  await assertCanonPersonaEntity(tx, changeSet.campaignId, entityId);

  const isActive = booleanWithDefault(readTo(patch, "isActive"), false);
  if (isActive) {
    await lockPersonaActivation(tx, changeSet.campaignId, entityId);
    await assertActivePersonaUnlocked(
      tx,
      changeSet.campaignId,
      entityId,
      operationId,
    );
    await tx.personaSnapshot.updateMany({
      where: { campaignId: changeSet.campaignId, entityId, isActive: true },
      data: { isActive: false },
    });
  }

  const compiledPrompt = compilePromptFromPersonaPatch(patch);
  const snapshot = await tx.personaSnapshot.create({
    data: {
      campaignId: changeSet.campaignId,
      entityId,
      label: nullableString(readTo(patch, "label")),
      inGameTime: jsonObject(readTo(patch, "inGameTime")),
      orderKey: optionalNumber(readTo(patch, "orderKey")),
      dials: jsonObject(readTo(patch, "dials")),
      values: jsonArray(readTo(patch, "values")),
      agendas: jsonArray(readTo(patch, "agendas")),
      resources: jsonObject(readTo(patch, "resources")),
      knowledgeScope: personaKnowledgeScope(readTo(patch, "knowledgeScope")),
      voiceGuide: nullableString(readTo(patch, "voiceGuide")),
      constraints: nullableString(readTo(patch, "constraints")),
      compiledPrompt,
      isActive,
      source: changeSet.source,
      status: CanonStatus.CANON,
      locked: booleanWithDefault(readTo(patch, "locked"), false),
      promptLocked: booleanWithDefault(readTo(patch, "promptLocked"), false),
    },
    select: { id: true },
  });

  await writePersonaSnapshotProvenance(tx, changeSet, snapshot.id, {
    ...patch,
    compiledPrompt: { to: compiledPrompt },
  });
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { personaSnapshotId: snapshot.id, op: OpKind.CREATE_PERSONA_SNAPSHOT },
    },
  });
  return snapshot.id;
}

async function applyUpdatePersonaSnapshot(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  snapshotId: string,
  patch: ReviewPatch,
) {
  const snapshot = await tx.personaSnapshot.findFirst({
    where: {
      id: snapshotId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: {
      id: true,
      entityId: true,
      label: true,
      inGameTime: true,
      orderKey: true,
      dials: true,
      values: true,
      agendas: true,
      resources: true,
      knowledgeScope: true,
      voiceGuide: true,
      constraints: true,
      compiledPrompt: true,
      isActive: true,
      locked: true,
      promptLocked: true,
      version: true,
    },
  });
  if (!snapshot) throw new ServiceError("Persona snapshot not found.");

  const expectedVersion = baseVersionsObject(changeSet.baseVersions)[snapshotId];
  if (typeof expectedVersion === "number" && expectedVersion !== snapshot.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError("Persona snapshot changed since this proposal was created.", {
      code: "OPERATION_STALE",
    });
  }

  const touchesCompiledPrompt = patchFields(patch).includes("compiledPrompt");
  if (snapshot.locked || (snapshot.promptLocked && touchesCompiledPrompt)) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This persona snapshot is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }

  const data: Prisma.PersonaSnapshotUpdateInput = { version: { increment: 1 } };
  if ("status" in patch) {
    data.status = (readTo(patch, "status") as CanonStatus) ?? CanonStatus.CANON;
  }
  if ("label" in patch) data.label = nullableString(readTo(patch, "label"));
  if ("inGameTime" in patch) data.inGameTime = jsonObject(readTo(patch, "inGameTime"));
  if ("orderKey" in patch) data.orderKey = optionalNumber(readTo(patch, "orderKey"));
  if ("dials" in patch) data.dials = jsonObject(readTo(patch, "dials"));
  if ("values" in patch) data.values = jsonArray(readTo(patch, "values"));
  if ("agendas" in patch) data.agendas = jsonArray(readTo(patch, "agendas"));
  if ("resources" in patch) data.resources = jsonObject(readTo(patch, "resources"));
  if ("knowledgeScope" in patch) {
    data.knowledgeScope = personaKnowledgeScope(readTo(patch, "knowledgeScope"));
  }
  if ("voiceGuide" in patch) {
    data.voiceGuide = nullableString(readTo(patch, "voiceGuide"));
  }
  if ("constraints" in patch) {
    data.constraints = nullableString(readTo(patch, "constraints"));
  }
  if ("compiledPrompt" in patch) {
    data.compiledPrompt = nullableString(readTo(patch, "compiledPrompt"));
  } else if (personaPromptSourceFieldChanged(patch) && !snapshot.promptLocked) {
    data.compiledPrompt = compilePromptFromPersonaPatch(patch, snapshot);
  }
  const nextActive = "isActive" in patch
    ? booleanWithDefault(readTo(patch, "isActive"), false)
    : snapshot.isActive;
  if ("isActive" in patch) data.isActive = nextActive;
  if ("locked" in patch) data.locked = booleanWithDefault(readTo(patch, "locked"), false);
  if ("promptLocked" in patch) {
    data.promptLocked = booleanWithDefault(readTo(patch, "promptLocked"), false);
  }

  if (nextActive) {
    await lockPersonaActivation(tx, changeSet.campaignId, snapshot.entityId);
    await assertActivePersonaUnlocked(
      tx,
      changeSet.campaignId,
      snapshot.entityId,
      operationId,
      snapshotId,
    );
    await tx.personaSnapshot.updateMany({
      where: {
        campaignId: changeSet.campaignId,
        entityId: snapshot.entityId,
        id: { not: snapshotId },
        isActive: true,
      },
      data: { isActive: false },
    });
  }
  if (data.status === CanonStatus.ARCHIVED) data.isActive = false;

  await tx.personaSnapshot.update({
    where: { id: snapshotId },
    data,
    select: { id: true },
  });

  const provenancePatch: ReviewPatch = { ...patch };
  if (
    !("compiledPrompt" in provenancePatch) &&
    typeof data.compiledPrompt === "string"
  ) {
    provenancePatch.compiledPrompt = {
      from: snapshot.compiledPrompt,
      to: data.compiledPrompt,
    };
  }
  await writePersonaSnapshotProvenance(tx, changeSet, snapshotId, provenancePatch);
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { personaSnapshotId: snapshotId, op: OpKind.UPDATE_PERSONA_SNAPSHOT },
    },
  });
  return snapshotId;
}

async function writePersonaSnapshotProvenance(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  personaSnapshotId: string,
  patch: ReviewPatch,
) {
  const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
  await tx.provenance.createMany({
    data: fields.map((field) => ({
      campaignId: changeSet.campaignId,
      personaSnapshotId,
      changeSetId: changeSet.id,
      source: changeSet.source,
      field,
      actorUserId: changeSet.actorUserId,
      providerId: changeSet.providerId,
      model: changeSet.model,
      promptId: changeSet.promptId,
      runId: changeSet.runId,
    })),
  });
}

const eventParticipantRoles = new Set<string>(
  Object.values(EventParticipantRole),
);

type ParsedParticipant = { entityId: string; role: EventParticipantRole };

function parseEventParticipants(value: JsonValue | undefined): ParsedParticipant[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const participants: ParsedParticipant[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entityId = item.entityId;
    const role = item.role;
    if (typeof entityId !== "string" || entityId.length === 0) continue;
    const resolvedRole =
      typeof role === "string" && eventParticipantRoles.has(role)
        ? (role as EventParticipantRole)
        : EventParticipantRole.ACTOR;
    // Dedupe on (entity, role) to respect the unique constraint.
    const key = `${entityId}:${resolvedRole}`;
    if (seen.has(key)) continue;
    seen.add(key);
    participants.push({ entityId, role: resolvedRole });
  }
  return participants;
}

function jsonObject(value: JsonValue | undefined): Prisma.InputJsonValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Prisma.InputJsonValue;
  }
  return {};
}

// ── Structured event effects (docs/01-domain-model.md) ───────────────────────
// An effect is a structured event consequence applied to entity state. v1 targets
// a crawler: ADJUST_STAT deltas a numeric field, SET_STAT writes an absolute
// numeric value, and SET_ALIVE flips the alive flag. Applying routes through the
// entity-update path so the write is lock-aware + provenance-tracked.
type StoredEventEffect = {
  id: string;
  kind: EventEffectKind;
  // Absent for kinds that derive their subject from the event (COLLAPSE_FLOOR).
  targetEntityId?: string;
  stat?: string;
  delta?: number;
  valueNumber?: number;
  value?: boolean;
  // PERSONA_SHIFT: per-dial integer deltas applied to the target's active
  // persona snapshot.
  dialShifts?: Record<string, number>;
  // GRANT_ACHIEVEMENT: the ACHIEVEMENT entity granted to the crawler target.
  achievementEntityId?: string;
  note: string | null;
  applied: boolean;
  appliedChangeSetId: string | null;
  pendingChangeSetId: string | null;
  pendingOperationId: string | null;
  reviewStatus: "PENDING" | "REJECTED" | "SUPERSEDED" | "APPLIED" | null;
};

const eventEffectKinds = new Set<string>(eventEffectKindValues);
const personaDialKeySet = new Set<string>(PERSONA_DIAL_KEYS);

// Read a stored/patched dialShifts blob into a record of known dials with finite
// integer deltas; unknown keys and non-integers are dropped. Undefined when empty
// so a non-persona effect carries no dialShifts.
function parseStoredDialShifts(value: JsonValue | undefined): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, JsonValue>;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (personaDialKeySet.has(key) && typeof raw === "number" && Number.isInteger(raw)) {
      out[key] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
// Crawler numeric fields an event effect can update -> `crawler.*` patch field +
// a floor the result is clamped to (DCC stats never go negative; level and floor
// are 1-based).
const eventEffectStatFloors: Record<string, number> = {
  gold: 0,
  hp: 0,
  mp: 0,
  killCount: 0,
  level: 1,
  currentFloor: 1,
};

// Read an effects JSON array (stored on the event, or carried in a patch) into
// normalized effects. Unknown kinds/targets are dropped; ids are minted when
// absent so newly declared effects get a stable handle.
function parseEventEffects(value: JsonValue | undefined): StoredEventEffect[] {
  if (!Array.isArray(value)) return [];
  const effects: StoredEventEffect[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, JsonValue>;
    const kind = record.kind;
    const targetEntityId = record.targetEntityId;
    if (typeof kind !== "string" || !eventEffectKinds.has(kind)) continue;
    const hasTarget = typeof targetEntityId === "string" && targetEntityId.length > 0;
    // Entity-targeting kinds need a target; subject-derived kinds (COLLAPSE_FLOOR)
    // never carry one.
    if (eventEffectRequiresTarget(kind as EventEffectKind) && !hasTarget) continue;
    const targetId = hasTarget ? (targetEntityId as string) : undefined;
    const stat = record.stat;
    effects.push({
      id:
        typeof record.id === "string" && record.id.length > 0
          ? record.id
          : crypto.randomUUID(),
      kind: kind as StoredEventEffect["kind"],
      ...(targetId ? { targetEntityId: targetId } : {}),
      stat:
        typeof stat === "string" && stat in eventEffectStatFloors ? stat : undefined,
      delta: typeof record.delta === "number" ? record.delta : undefined,
      valueNumber:
        typeof record.valueNumber === "number" ? record.valueNumber : undefined,
      value: typeof record.value === "boolean" ? record.value : undefined,
      dialShifts: parseStoredDialShifts(record.dialShifts),
      achievementEntityId:
        typeof record.achievementEntityId === "string" && record.achievementEntityId.length > 0
          ? record.achievementEntityId
          : undefined,
      note:
        typeof record.note === "string" && record.note.length > 0 ? record.note : null,
      applied: record.applied === true,
      appliedChangeSetId:
        typeof record.appliedChangeSetId === "string" ? record.appliedChangeSetId : null,
      pendingChangeSetId:
        typeof record.pendingChangeSetId === "string" ? record.pendingChangeSetId : null,
      pendingOperationId:
        typeof record.pendingOperationId === "string" ? record.pendingOperationId : null,
      reviewStatus:
        record.reviewStatus === "PENDING" ||
        record.reviewStatus === "REJECTED" ||
        record.reviewStatus === "SUPERSEDED" ||
        record.reviewStatus === "APPLIED"
          ? record.reviewStatus
          : null,
    });
  }
  return effects;
}

// Providers mint UUIDs for new effects, but the review service must remain
// safe if a malformed proposal repeats one. Retain the first row in patch order
// so one logical effect can never be applied twice in one approval transaction.
function uniqueEventEffectsById(effects: StoredEventEffect[]) {
  const seenIds = new Set<string>();
  return effects.filter((effect) => {
    if (seenIds.has(effect.id)) return false;
    seenIds.add(effect.id);
    return true;
  });
}

// Generator output is persisted as a review patch rather than a validated event
// form submission. Run every raw AI row through the public effect schema before
// normalization, so fractional stats and unknown persona dial keys cannot be
// stripped or deferred into an approval-time database error.
function parseCanonicalAiPatchEffects(value: JsonValue | undefined) {
  if (!Array.isArray(value)) return null;
  const normalized: JsonValue[] = [];
  for (const rawEffect of value) {
    const parsed = eventEffectSchema.safeParse(rawEffect);
    if (!parsed.success) return null;
    normalized.push(parsed.data as unknown as JsonValue);
  }
  return parseEventEffects(normalized);
}

function assertValidDeclaredEffect(effect: StoredEventEffect) {
  if (effect.kind === "ADJUST_STAT") {
    if (!effect.stat) throw new ServiceError("Effect is missing a stat to adjust.");
    if (typeof effect.delta !== "number" || effect.delta === 0) {
      throw new ServiceError("Effect needs a non-zero delta.");
    }
  }
  if (effect.kind === "SET_STAT") {
    if (!effect.stat) throw new ServiceError("Effect is missing a stat to set.");
    if (typeof effect.valueNumber !== "number") {
      throw new ServiceError("Effect needs a value.");
    }
  }
  if (effect.kind === "SET_ALIVE" && typeof effect.value !== "boolean") {
    throw new ServiceError("Effect needs an alive/dead value.");
  }
  if (effect.kind === "PERSONA_SHIFT") {
    const meaningful = Object.entries(effect.dialShifts ?? {}).filter(
      ([key, value]) => personaDialKeySet.has(key) && Number.isInteger(value) && value !== 0,
    );
    if (meaningful.length === 0) {
      throw new ServiceError("Persona shift needs at least one non-zero dial delta.");
    }
  }
  if (effect.kind === "GRANT_ACHIEVEMENT" && !effect.achievementEntityId) {
    throw new ServiceError("Achievement grant needs an achievement to grant.");
  }
}

function serializeEventEffects(
  effects: StoredEventEffect[],
): Prisma.InputJsonValue {
  return effects.map((effect) => ({
    id: effect.id,
    kind: effect.kind,
    ...(effect.targetEntityId ? { targetEntityId: effect.targetEntityId } : {}),
    ...(effect.stat ? { stat: effect.stat } : {}),
    ...(typeof effect.delta === "number" ? { delta: effect.delta } : {}),
    ...(typeof effect.valueNumber === "number" ? { valueNumber: effect.valueNumber } : {}),
    ...(typeof effect.value === "boolean" ? { value: effect.value } : {}),
    ...(effect.dialShifts ? { dialShifts: effect.dialShifts } : {}),
    ...(effect.achievementEntityId
      ? { achievementEntityId: effect.achievementEntityId }
      : {}),
    ...(effect.note ? { note: effect.note } : {}),
    applied: effect.applied,
    ...(effect.appliedChangeSetId
      ? { appliedChangeSetId: effect.appliedChangeSetId }
      : {}),
    ...(effect.pendingChangeSetId
      ? { pendingChangeSetId: effect.pendingChangeSetId }
      : {}),
    ...(effect.pendingOperationId
      ? { pendingOperationId: effect.pendingOperationId }
      : {}),
    ...(effect.reviewStatus ? { reviewStatus: effect.reviewStatus } : {}),
  }));
}

function effectBelongsToOperation(
  effect: StoredEventEffect,
  changeSetId: string,
  operationId: string,
) {
  return (
    effect.pendingOperationId === operationId ||
    effect.pendingChangeSetId === changeSetId
  );
}

// Resolve + validate an effect's target as a live canon crawler, returning the
// current stat values the apply step deltas from.
async function loadEffectTargetCrawler(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
) {
  const entity = await tx.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      status: CanonStatus.CANON,
      type: EntityType.CRAWLER,
    },
    select: {
      id: true,
      crawler: {
        select: {
          gold: true,
          hp: true,
          mp: true,
          level: true,
          killCount: true,
          currentFloor: true,
          isAlive: true,
        },
      },
    },
  });
  if (!entity || !entity.crawler) {
    throw new ServiceError("Effect target must be a crawler.");
  }
  return entity.crawler;
}

// A PERSONA_SHIFT effect targets a SYSTEM_AI entity — the persona it drifts.
// Validate the target is live canon of that type at declaration time so a bad
// target is caught early (parity with the crawler check).
async function assertPersonaShiftTarget(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
) {
  const entity = await tx.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      status: CanonStatus.CANON,
      type: EntityType.SYSTEM_AI,
    },
    select: { id: true },
  });
  if (!entity) {
    throw new ServiceError("Persona shift target must be a System AI entity.");
  }
}

// A GRANT_ACHIEVEMENT effect grants the crawler `targetEntityId` the ACHIEVEMENT
// entity `achievementEntityId`. Validate the granted entity is live canon of
// that type at declaration time (parity with the crawler/persona target checks),
// returning its id for the apply step.
async function assertAchievementEntity(
  tx: Prisma.TransactionClient,
  campaignId: string,
  entityId: string,
) {
  const entity = await tx.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      status: CanonStatus.CANON,
      type: EntityType.ACHIEVEMENT,
    },
    select: { id: true },
  });
  if (!entity) {
    throw new ServiceError("Granted achievement must be an achievement entity.");
  }
  return entity.id;
}

// Validate a declared effect's hand-picked target by kind (crawler kinds resolve
// a crawler; PERSONA_SHIFT resolves a SYSTEM_AI). Subject-derived kinds
// (COLLAPSE_FLOOR) carry no target and are skipped. GRANT_ACHIEVEMENT also
// validates its second hand-picked entity (the granted achievement).
async function assertDeclaredEffectTarget(
  tx: Prisma.TransactionClient,
  campaignId: string,
  effect: StoredEventEffect,
) {
  if (!eventEffectRequiresTarget(effect.kind) || !effect.targetEntityId) return;
  if (effect.kind === "PERSONA_SHIFT") {
    await assertPersonaShiftTarget(tx, campaignId, effect.targetEntityId);
  } else {
    await loadEffectTargetCrawler(tx, campaignId, effect.targetEntityId);
    if (effect.kind === "GRANT_ACHIEVEMENT") {
      if (!effect.achievementEntityId) {
        throw new ServiceError("Achievement grant needs an achievement to grant.");
      }
      await assertAchievementEntity(tx, campaignId, effect.achievementEntityId);
    }
  }
}

// Build the entity patch an effect applies (absolute `to` values the
// entity-update path consumes). Returns null when the effect would be a no-op
// (e.g. an ADJUST_STAT against an unset hp/mp, or an already-matching alive
// flag) so we don't churn version/provenance for nothing.
function effectEntityPatch(
  effect: StoredEventEffect,
  crawler: {
    gold: number;
    hp: number | null;
    mp: number | null;
    level: number;
    killCount: number;
    currentFloor: number | null;
    isAlive: boolean;
  },
): ReviewPatch | null {
  if (effect.kind === "SET_ALIVE") {
    if (typeof effect.value !== "boolean" || crawler.isAlive === effect.value) {
      return null;
    }
    return { "crawler.isAlive": { from: crawler.isAlive, to: effect.value } };
  }
  const stat = effect.stat;
  if (!stat) return null;
  const current = (crawler as unknown as Record<string, number | null>)[stat];
  if (effect.kind === "SET_STAT") {
    if (typeof effect.valueNumber !== "number") return null;
    const floor = eventEffectStatFloors[stat] ?? 0;
    const next = Math.max(floor, effect.valueNumber);
    if (current === next) return null;
    return { [`crawler.${stat}`]: { from: current, to: next } };
  }

  // ADJUST_STAT
  if (typeof effect.delta !== "number") return null;
  const base = effectAdjustmentBase(stat, current);
  if (base === null) {
    // Some nullable stats, like currentFloor, have no sensible delta baseline.
    throw new ServiceError(`Cannot adjust ${stat}: the crawler has no value set.`);
  }
  const floor = eventEffectStatFloors[stat] ?? 0;
  const next = Math.max(floor, base + effect.delta);
  if (next === current) return null;
  return { [`crawler.${stat}`]: { from: current, to: next } };
}

function effectAdjustmentBase(
  stat: string,
  current: number | null,
): number | null {
  if (typeof current === "number") return current;
  if (stat === "hp" || stat === "mp") return 0;
  return null;
}

function buildEffectPreviews(
  patch: ReviewPatch,
  targetById: ReadonlyMap<
    string,
    {
      crawler: {
        gold: number;
        hp: number | null;
        mp: number | null;
        level: number;
        killCount: number;
        currentFloor: number | null;
        isAlive: boolean;
      } | null;
    }
  >,
): ReviewEffectPreview[] {
  const previews: ReviewEffectPreview[] = [];
  const stateByTarget = new Map<
    string,
    {
      gold: number;
      hp: number | null;
      mp: number | null;
      level: number;
      killCount: number;
      currentFloor: number | null;
      isAlive: boolean;
    }
  >();
  for (const effect of parseEventEffects(readTo(patch, "effects"))) {
    // Only crawler-targeting effects produce a stat before/after preview.
    const targetEntityId = effect.targetEntityId;
    if (!targetEntityId) continue;
    const crawler = targetById.get(targetEntityId)?.crawler;
    if (!crawler) continue;
    const state = stateByTarget.get(targetEntityId) ?? { ...crawler };
    stateByTarget.set(targetEntityId, state);
    if (effect.kind === "SET_ALIVE") {
      if (typeof effect.value !== "boolean") continue;
      previews.push({
        id: effect.id,
        targetEntityId,
        before: state.isAlive,
        after: effect.value,
      });
      state.isAlive = effect.value;
      continue;
    }
    if (!effect.stat) continue;
    const values = state as unknown as Record<string, number | null>;
    const before = values[effect.stat];
    if (before === undefined) continue;
    const floor = eventEffectStatFloors[effect.stat] ?? 0;
    if (effect.kind === "SET_STAT") {
      if (typeof effect.valueNumber !== "number") continue;
      const after = Math.max(floor, effect.valueNumber);
      previews.push({
        id: effect.id,
        targetEntityId,
        before,
        after,
      });
      values[effect.stat] = after;
      continue;
    }
    const base = effectAdjustmentBase(effect.stat, before);
    if (base === null || typeof effect.delta !== "number") continue;
    const after = Math.max(floor, base + effect.delta);
    previews.push({
      id: effect.id,
      targetEntityId,
      before,
      after,
    });
    values[effect.stat] = after;
  }
  return previews;
}

// ADR 0004: order is derived, never authored. `orderKey` is the event's floor
// (the coarse macro-clock) read straight from its in-game-time anchor; absent a
// floor it is 0 (unscheduled events sort last). The patch never carries it.
function orderKeyFromInGameTime(value: JsonValue | undefined): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const floor = (value as { [key: string]: JsonValue }).floor;
    if (typeof floor === "number") return floor;
  }
  return 0;
}

// The next fractional `rank` for a new (or floor-moved) event: appended above
// its floor's current events so a freshly logged event reads first within its
// floor, matching the timeline's newest-first ordering. A drag later slots an
// event between neighbours (see reorderEvent in events.ts).
async function nextRankForFloor(
  tx: Prisma.TransactionClient,
  campaignId: string,
  orderKey: number,
  excludeEventId?: string,
): Promise<string> {
  const last = await tx.event.findFirst({
    where: {
      campaignId,
      orderKey,
      status: { not: CanonStatus.ARCHIVED },
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
    orderBy: { rank: "desc" },
    select: { rank: true },
  });
  return generateRankBetween(last?.rank ?? null, null);
}

// Campaign-wide `ResolveContext` (src/lib/time-resolve.ts), built from committed
// DB state inside the apply transaction; the event being applied resolves against
// this even though it isn't in the map yet (it never anchors to itself). Shares
// one implementation with the apply-time validator (see `event-resolve-context`)
// so "resolvable at apply" and "resolves at approve" can't diverge.
function buildResolveContext(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<ResolveContext> {
  return buildCampaignResolveContext(tx, campaignId);
}

// Mint a rank for an event at `position` among its comparable siblings, where a
// higher position sorts later in fiction => higher rank (the timeline shows
// later-first). Brackets between the tightest sibling above (smallest position
// strictly greater) and below (largest position ≤ ours). Returns null when the
// chosen neighbours' ranks can't bracket a new value — the caller decides the
// fallback (keep the existing rank on an edit, or append on a create).
function rankBetweenSiblings(
  comparable: { rank: string; position: number }[],
  position: number,
): string | null {
  let above: { rank: string; position: number } | null = null;
  let below: { rank: string; position: number } | null = null;
  for (const candidate of comparable) {
    if (candidate.position > position) {
      // Tightest sibling above us: smallest position, then lowest rank.
      if (
        !above ||
        candidate.position < above.position ||
        (candidate.position === above.position && candidate.rank < above.rank)
      ) {
        above = candidate;
      }
    } else if (
      // Tightest sibling at/below us: largest position, then highest rank.
      !below ||
      candidate.position > below.position ||
      (candidate.position === below.position && candidate.rank > below.rank)
    ) {
      below = candidate;
    }
  }
  try {
    return generateRankBetween(below?.rank ?? null, above?.rank ?? null);
  } catch {
    return null;
  }
}

// Derive an event's intra-floor `rank` from its in-fiction time, or null when the
// time gives no position relative to existing floor siblings (so the caller keeps
// the manual order). Two axes, tried in order (ADR 0004 + 0008):
//
//   1. Absolute day-since-collapse. Any basis that resolves to a concrete day —
//      including EVENT-anchored times like "14 days after Event A" — is placed on
//      one shared axis against the siblings that also resolve. This is what makes
//      a time-anchored event sort by *when it happens*, not when it was logged.
//   2. Floor-relative offset, for floors without day anchors: FLOOR_START /
//      FLOOR_COLLAPSE siblings of the same basis share the floor as a common
//      clock, so their raw offsets order them even with no absolute days known.
//
// Siblings that resolve on neither axis (UNSCHEDULED / unresolvable EVENT) keep
// their manual rank and are simply not used as brackets.
async function deriveRankForFloor(
  tx: Prisma.TransactionClient,
  campaignId: string,
  orderKey: number,
  inGameTime: JsonValue | undefined,
  excludeEventId?: string,
): Promise<string | null> {
  const siblings = await tx.event.findMany({
    where: {
      campaignId,
      orderKey,
      status: { not: CanonStatus.ARCHIVED },
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
    select: { rank: true, inGameTime: true },
  });
  if (siblings.length === 0) return null;

  const ref = readTimeRef(inGameTime);

  // Axis 1: absolute day-since-collapse.
  const ctx = await buildResolveContext(tx, campaignId);
  const day = resolveAbsoluteDay(ref, ctx);
  if (day != null) {
    const comparable: { rank: string; position: number }[] = [];
    for (const sibling of siblings) {
      const siblingDay = resolveAbsoluteDay(readTimeRef(sibling.inGameTime), ctx);
      if (siblingDay != null) comparable.push({ rank: sibling.rank, position: siblingDay });
    }
    if (comparable.length > 0) {
      const rank = rankBetweenSiblings(comparable, day);
      if (rank != null) return rank;
    }
  }

  // Axis 2: same-basis floor-relative offset (floors with no day anchors).
  const sortKey = floorRelativeSortKey(ref);
  if (sortKey) {
    const comparable: { rank: string; position: number }[] = [];
    for (const sibling of siblings) {
      const key = floorRelativeSortKey(readTimeRef(sibling.inGameTime));
      if (key && key.basis === sortKey.basis) {
        comparable.push({ rank: sibling.rank, position: key.position });
      }
    }
    if (comparable.length > 0) {
      const rank = rankBetweenSiblings(comparable, sortKey.position);
      if (rank != null) return rank;
    }
  }

  return null;
}

// Resolve a freshly applied (or floor-moved) event's `rank`: derived from its
// time when that yields a position, otherwise appended on top for manual order.
async function rankForEvent(
  tx: Prisma.TransactionClient,
  campaignId: string,
  orderKey: number,
  inGameTime: JsonValue | undefined,
  excludeEventId?: string,
): Promise<string> {
  const derived = await deriveRankForFloor(
    tx,
    campaignId,
    orderKey,
    inGameTime,
    excludeEventId,
  );
  return derived ?? nextRankForFloor(tx, campaignId, orderKey, excludeEventId);
}

// Re-derive ranks after some events' resolved day has shifted. A day move ripples:
// any event anchored (directly or transitively, via EVENT basis) to a moved event
// shifts too, and all of them are placed on the absolute-day axis (ADR 0008), so
// their stored `rank` is stale. Two callers seed this: an event time edit moves
// the edited event, and a floor-anchor edit moves every event on that floor.
//
// `includeSeeds` says whether the seeds themselves are re-derived: false when the
// caller already re-ranked the seed inline (the time-edit path sets the edited
// event's rank before calling this, so only its dependents are stale); true when
// the seeds moved implicitly and nobody re-ranked them yet (a floor-anchor edit).
//
// Recomputed in dependency order (an anchor before anything that points at it) so
// each event sees its neighbours' fresh ranks. Unresolvable / manual-ranked
// events (a null derivation) are left untouched; cycles are inert — they resolve
// to no day and fall through to the manual rank.
async function rerankMovedEvents(
  tx: Prisma.TransactionClient,
  campaignId: string,
  seedEventIds: Iterable<string>,
  includeSeeds: boolean,
): Promise<void> {
  const events = await tx.event.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, orderKey: true, rank: true, inGameTime: true },
  });

  // anchor id → events whose EVENT-basis time points at it.
  const dependentsByAnchor = new Map<string, string[]>();
  const byId = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    byId.set(event.id, event);
    const ref = readTimeRef(event.inGameTime);
    if (ref.basis === "EVENT" && ref.anchorEventId) {
      const list = dependentsByAnchor.get(ref.anchorEventId);
      if (list) list.push(event.id);
      else dependentsByAnchor.set(ref.anchorEventId, [event.id]);
    }
  }

  // The seeds, plus every event reachable from them along anchor→dependent edges.
  const seeds = new Set<string>();
  const affected = new Set<string>();
  const queue: string[] = [];
  for (const id of seedEventIds) {
    if (!byId.has(id)) continue;
    seeds.add(id);
    if (!affected.has(id)) {
      affected.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const dependent of dependentsByAnchor.get(id) ?? []) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }

  // Topologically order the affected subgraph so an event's EVENT-basis anchor is
  // re-ranked before the event (Kahn's algorithm). A seed that is itself a
  // dependent of another seed is ordered correctly this way too. Any residual
  // cycle is appended in discovery order (those events resolve to no day anyway).
  const indegree = new Map<string, number>();
  for (const id of affected) indegree.set(id, 0);
  for (const id of affected) {
    const ref = readTimeRef(byId.get(id)!.inGameTime);
    if (ref.basis === "EVENT" && ref.anchorEventId && affected.has(ref.anchorEventId)) {
      indegree.set(id, indegree.get(id)! + 1);
    }
  }
  const ready = [...affected].filter((id) => indegree.get(id) === 0);
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(id);
    placed.add(id);
    for (const dependent of dependentsByAnchor.get(id) ?? []) {
      if (!affected.has(dependent)) continue;
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
  }
  for (const id of affected) if (!placed.has(id)) ordered.push(id);

  for (const id of ordered) {
    if (!includeSeeds && seeds.has(id)) continue;
    const event = byId.get(id)!;
    const rank = await deriveRankForFloor(
      tx,
      campaignId,
      event.orderKey,
      event.inGameTime as JsonValue,
      id,
    );
    if (rank != null && rank !== event.rank) {
      await tx.event.update({ where: { id }, data: { rank } });
    }
  }
}

// A floor-anchor edit (FLOOR entity `startDay` / `collapseDay`) shifts the
// resolved day of every FLOOR_START / FLOOR_COLLAPSE event on that floor, and of
// every EVENT-basis event transitively anchored to them (ADR 0008) — so their
// stored intra-floor `rank` is stale, the floor analogue of an event time edit.
// An event's floor is its `orderKey` (ADR 0004), so the floor's events are the
// seeds; they and their dependents are re-derived. Call after the new anchors are
// committed so the rebuilt resolve context reads them.
async function rerankFloor(
  tx: Prisma.TransactionClient,
  campaignId: string,
  floorNumber: number,
): Promise<void> {
  const floorEvents = await tx.event.findMany({
    where: {
      campaignId,
      orderKey: floorNumber,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true },
  });
  if (floorEvents.length === 0) return;
  await rerankMovedEvents(
    tx,
    campaignId,
    floorEvents.map((event) => event.id),
    true,
  );
}

async function applyEventOperation(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operation: Prisma.ChangeOperationGetPayload<object>,
  patchOverride?: ReviewPatch,
) {
  const patch = patchOverride ?? (operation.patch as ReviewPatch);

  switch (operation.op) {
    case OpKind.CREATE_EVENT:
      if (operation.targetType !== "EVENT") {
        throw new ServiceError("Unsupported operation target.");
      }
      return applyCreateEvent(tx, changeSet, operation.id, patch);
    case OpKind.UPDATE_EVENT:
      if (operation.targetType !== "EVENT") {
        throw new ServiceError("Unsupported operation target.");
      }
      if (!operation.targetId) throw new ServiceError("Missing event target.");
      return applyUpdateEvent(tx, changeSet, operation.id, operation.targetId, patch);
    case OpKind.APPLY_EVENT_EFFECTS:
      if (operation.targetType !== "EVENT") {
        throw new ServiceError("Unsupported operation target.");
      }
      if (!operation.targetId) throw new ServiceError("Missing event target.");
      return applyApplyEventEffects(
        tx,
        changeSet,
        operation.id,
        operation.targetId,
        patch,
      );
    case OpKind.CREATE_EVENT_CAUSALITY:
      if (operation.targetType !== "EVENT_CAUSALITY") {
        throw new ServiceError("Unsupported operation target.");
      }
      return applyCreateEventCausality(tx, changeSet, operation.id, patch);
    case OpKind.DELETE_EVENT_CAUSALITY:
      if (operation.targetType !== "EVENT_CAUSALITY") {
        throw new ServiceError("Unsupported operation target.");
      }
      if (!operation.targetId) throw new ServiceError("Missing causality target.");
      return applyDeleteEventCausality(
        tx,
        changeSet,
        operation.id,
        operation.targetId,
        patch,
      );
    default:
      throw new ServiceError("Unsupported event operation.");
  }
}

async function applyCreateEvent(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  patch: ReviewPatch,
) {
  const title = readTo(patch, "title");
  if (typeof title !== "string" || title.length === 0) {
    throw new ServiceError("Event title is required.");
  }
  const participants = parseEventParticipants(readTo(patch, "participants"));
  // Participants must be live canon entities in this campaign.
  for (const participant of participants) {
    await assertCanonEntity(tx, changeSet.campaignId, participant.entityId);
  }

  // Effects declared at creation start unapplied; validate each and confirm its
  // target is a crawler so a bad effect is caught now, not at apply time.
  let effects: StoredEventEffect[] = [];
  if ("effects" in patch) {
    effects = parseEventEffects(readTo(patch, "effects")).map((effect) => ({
      ...effect,
      applied: false,
      appliedChangeSetId: null,
      pendingChangeSetId: null,
      pendingOperationId: null,
      reviewStatus: null,
    }));
    for (const effect of effects) {
      assertValidDeclaredEffect(effect);
      await assertDeclaredEffectTarget(tx, changeSet.campaignId, effect);
    }
  }

  const inGameTime = readTo(patch, "inGameTime");
  const orderKey = orderKeyFromInGameTime(inGameTime);
  const event = await tx.event.create({
    data: {
      campaignId: changeSet.campaignId,
      title,
      summary: nullableString(readTo(patch, "summary")),
      description: nullableString(readTo(patch, "description")),
      inGameTime: jsonObject(inGameTime),
      orderKey,
      rank: await rankForEvent(tx, changeSet.campaignId, orderKey, inGameTime),
      effects: serializeEventEffects(effects),
      secret: booleanWithDefault(readTo(patch, "secret"), false),
      source: changeSet.source,
      status: CanonStatus.CANON,
      participants: {
        create: participants.map((participant) => ({
          entityId: participant.entityId,
          role: participant.role,
        })),
      },
    },
    select: { id: true },
  });

  await writeEventProvenance(tx, changeSet, event.id, patch);
  await indexEvent(tx, changeSet.campaignId, event.id, reembedIndexOptions(changeSet));
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { eventId: event.id, op: OpKind.CREATE_EVENT },
    },
  });
  return event.id;
}

async function applyUpdateEvent(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  eventId: string,
  patch: ReviewPatch,
) {
  const isRestore = restoresArchivedStatus(patch);
  const event = await tx.event.findFirst({
    where: {
      id: eventId,
      campaignId: changeSet.campaignId,
      status: isRestore ? CanonStatus.ARCHIVED : { not: CanonStatus.ARCHIVED },
    },
    select: {
      id: true,
      locked: true,
      version: true,
      effects: true,
      orderKey: true,
      participants: { select: { entityId: true } },
    },
  });
  if (!event) throw new ServiceError("Event not found.");

  // Reject a stale edit (the row advanced since this edit was built), the same
  // way applyUpdateEntity does — so concurrent DM edits don't silently clobber.
  const expectedVersion = readTo(patch, "_baseVersion");
  if (typeof expectedVersion === "number" && expectedVersion !== event.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError(
      "This event changed since you opened it. Reload and try again.",
      { code: "OPERATION_STALE" },
    );
  }

  if (event.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This event is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }
  if (isRestore) {
    for (const participant of event.participants) {
      await assertCanonEntity(tx, changeSet.campaignId, participant.entityId);
    }
  }

  // UPDATE_EVENT covers both soft-archive (a status change) and field edits.
  // Participant editing is not handled here yet — it lands with its own slice
  // (see docs/PROGRESS.md M3 follow-ups).
  const data: Prisma.EventUpdateInput = { version: { increment: 1 } };
  if ("status" in patch) {
    data.status = (readTo(patch, "status") as CanonStatus) ?? CanonStatus.CANON;
  }
  if ("title" in patch) {
    const title = readTo(patch, "title");
    if (typeof title !== "string" || title.length === 0) {
      throw new ServiceError("Event title is required.");
    }
    data.title = title;
  }
  if ("summary" in patch) data.summary = nullableString(readTo(patch, "summary"));
  if ("description" in patch) data.description = nullableString(readTo(patch, "description"));
  if ("inGameTime" in patch) {
    const inGameTime = readTo(patch, "inGameTime");
    data.inGameTime = jsonObject(inGameTime);
    // Order is re-derived from the anchor, never taken from the patch (ADR 0004).
    // A floor change moves clocks, so the event is re-placed in its new floor.
    // Within a floor, a time that yields a position (an absolute day or a
    // floor-relative offset) re-derives the rank; a non-positional (UNSCHEDULED /
    // label-only) edit preserves the event's existing manual drag order.
    const nextOrderKey = orderKeyFromInGameTime(inGameTime);
    if (nextOrderKey !== event.orderKey) {
      data.orderKey = nextOrderKey;
      data.rank = await rankForEvent(
        tx,
        changeSet.campaignId,
        nextOrderKey,
        inGameTime,
        eventId,
      );
    } else {
      const derived = await deriveRankForFloor(
        tx,
        changeSet.campaignId,
        nextOrderKey,
        inGameTime,
        eventId,
      );
      if (derived != null) data.rank = derived;
    }
  }
  if ("secret" in patch) data.secret = booleanWithDefault(readTo(patch, "secret"), false);

  let nextEffects = parseEventEffects(event.effects as JsonValue);

  // Effects edit replaces the *unapplied* set; applied effects are immutable
  // history and are preserved. Each newly declared effect is validated and its
  // target confirmed to be a crawler.
  if ("effects" in patch) {
    const applied = nextEffects.filter((effect) => effect.applied);
    const declared = parseEventEffects(readTo(patch, "effects")).map((effect) => ({
      ...effect,
      applied: false,
      appliedChangeSetId: null,
      pendingChangeSetId: null,
      pendingOperationId: null,
      reviewStatus: null,
    }));
    for (const effect of declared) {
      assertValidDeclaredEffect(effect);
      await assertDeclaredEffectTarget(tx, changeSet.campaignId, effect);
    }
    nextEffects = [...applied, ...declared];
    data.effects = serializeEventEffects(nextEffects);
  }

  await tx.event.update({ where: { id: eventId }, data, select: { id: true } });

  // A time change shifts the resolved day of any event anchored to this one, so
  // re-derive their ranks now that the new time is committed (ADR 0008). The
  // edited event's own rank was set above, so only its dependents are seeded.
  if ("inGameTime" in patch) {
    await rerankMovedEvents(tx, changeSet.campaignId, [eventId], false);
  }

  // Participant editing: when the patch carries a participant list, reconcile it
  // against the live rows — add new (entity, role) pairs, drop removed ones, and
  // leave unchanged rows in place (preserving their order). Every desired
  // participant must be live canon; participant-less timeline entries are valid.
  if ("participants" in patch || "effects" in patch) {
    const existing = await tx.eventParticipant.findMany({
      where: { eventId },
      select: { id: true, entityId: true, role: true },
    });
    const desired = "participants" in patch
      ? parseEventParticipants(readTo(patch, "participants"))
      : existing.map((participant) => ({
          entityId: participant.entityId,
          role: participant.role,
        }));
    const key = (entityId: string, role: EventParticipantRole) => `${entityId}:${role}`;
    const desiredKeys = new Set(desired.map((p) => key(p.entityId, p.role)));
    for (const effect of nextEffects.filter((candidate) => candidate.applied)) {
      // Subject-derived effects (COLLAPSE_FLOOR) have no crawler participant.
      if (!effect.targetEntityId) continue;
      const affectedKey = key(effect.targetEntityId, EventParticipantRole.AFFECTED);
      if (desiredKeys.has(affectedKey)) continue;
      desired.push({
        entityId: effect.targetEntityId,
        role: EventParticipantRole.AFFECTED,
      });
      desiredKeys.add(affectedKey);
    }
    for (const participant of desired) {
      await assertCanonEntity(tx, changeSet.campaignId, participant.entityId);
    }
    const existingKeys = new Set(existing.map((p) => key(p.entityId, p.role)));
    const toDelete = existing.filter((p) => !desiredKeys.has(key(p.entityId, p.role)));
    const toCreate = desired.filter((p) => !existingKeys.has(key(p.entityId, p.role)));
    if (toDelete.length > 0) {
      await tx.eventParticipant.deleteMany({
        where: { id: { in: toDelete.map((p) => p.id) } },
      });
    }
    if (toCreate.length > 0) {
      await tx.eventParticipant.createMany({
        data: toCreate.map((p) => ({ eventId, entityId: p.entityId, role: p.role })),
      });
    }
  }
  await writeEventProvenance(tx, changeSet, eventId, patch);
  // UPDATE_EVENT covers field edits and soft-archive (a status change); either
  // way indexEvent refreshes or drops the event's SearchDoc to match.
  await indexEvent(tx, changeSet.campaignId, eventId, reembedIndexOptions(changeSet));
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { eventId, op: OpKind.UPDATE_EVENT },
    },
  });
  return eventId;
}

// Materialize a COLLAPSE_FLOOR effect: the event's floor collapses on its
// resolved in-fiction day D, and the next floor opens the same day (operator
// decision: same-day, contiguous). Closes floor N (`data.collapseDay = D`),
// ensures floor N+1 exists (auto-creating a stub so the close has a successor to
// hand off to), opens it (`data.startDay = D`), and advances the campaign's
// current floor to N+1. Floor writes route through the same lock-aware
// create/update apply path as any other op, so they carry provenance and
// re-derive floor anchoring (ADR 0008). Advancing the current floor is a direct
// campaign write (ADR 0005), kept atomic inside this apply transaction.
async function applyFloorCollapseEffect(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  eventInGameTime: JsonValue,
) {
  const time = readTimeRef(eventInGameTime);
  const floorNumber = time.floor;
  if (floorNumber == null) {
    throw new ServiceError("A floor-collapse effect needs an event anchored to a floor.");
  }
  const ctx = await buildResolveContext(tx, changeSet.campaignId);
  const day = resolveAbsoluteDay(time, ctx);
  if (day == null) {
    throw new ServiceError(
      "Cannot collapse a floor from an event whose in-game day can't be resolved.",
    );
  }

  // Live FLOOR entities for this floor and the next, keyed by their number. Floor
  // anchors live in the satellite once migrated (ADR 0011 Part C), so load it and
  // resolve through readFloorData(data, floor).
  const floorRows = await tx.entity.findMany({
    where: {
      campaignId: changeSet.campaignId,
      type: EntityType.FLOOR,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, data: true, floor: floorSatelliteSelect },
  });
  const floorByNumber = new Map<
    number,
    { id: string; data: unknown; floor: unknown }
  >();
  for (const row of floorRows) {
    const { floorNumber: n } = readFloorData(row.data, row.floor);
    if (n != null && !floorByNumber.has(n)) floorByNumber.set(n, row);
  }

  const floorCreatePatch = (n: number, anchor: "startDay" | "collapseDay"): ReviewPatch => ({
    type: { to: EntityType.FLOOR },
    name: { to: `Floor ${n}` },
    summary: { to: null },
    description: { to: null },
    visibility: { to: Visibility.DM_ONLY },
    tags: { to: [] },
    isStub: { to: true },
    "data.floorNumber": { to: n },
    [`data.${anchor}`]: { to: day },
  });

  // Close the current floor on day D (create it if it was never modelled).
  const current = floorByNumber.get(floorNumber);
  let nextFloorId: string;
  if (current) {
    await applyUpdateEntity(tx, changeSet, operationId, current.id, {
      "data.collapseDay": {
        from: readFloorData(current.data, current.floor).collapseDay,
        to: day,
      },
    });
  } else {
    await applyCreateEntity(
      tx,
      changeSet,
      operationId,
      floorCreatePatch(floorNumber, "collapseDay"),
    );
  }

  // Open (or create) the next floor on the same day, and make it current.
  const next = floorByNumber.get(floorNumber + 1);
  if (next) {
    await applyUpdateEntity(tx, changeSet, operationId, next.id, {
      "data.startDay": {
        from: readFloorData(next.data, next.floor).startDay,
        to: day,
      },
    });
    nextFloorId = next.id;
  } else {
    nextFloorId = await applyCreateEntity(
      tx,
      changeSet,
      operationId,
      floorCreatePatch(floorNumber + 1, "startDay"),
    );
  }

  const campaign = await tx.campaign.findUnique({
    where: { id: changeSet.campaignId },
    select: { currentFloorId: true },
  });
  if (campaign && campaign.currentFloorId !== nextFloorId) {
    await tx.campaign.update({
      where: { id: changeSet.campaignId },
      data: { currentFloorId: nextFloorId },
    });
    await tx.auditLog.create({
      data: {
        campaignId: changeSet.campaignId,
        actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
        action: "SET_CURRENT_FLOOR",
        targetType: "CAMPAIGN",
        targetId: changeSet.campaignId,
        detail: {
          currentFloorId: nextFloorId,
          previousCurrentFloorId: campaign.currentFloorId,
        },
      },
    });
  }
}

// Materialize a PERSONA_SHIFT effect: drift the target SYSTEM_AI's active
// persona by the given per-dial deltas. The shift is enacted as a *new* active
// snapshot (the prior one is preserved as history, ADR M6 — the persona is an
// ordered series along campaign time), carrying the prior snapshot's
// values/agendas/voice/etc. forward with only the dials nudged. The new snapshot
// routes through the same `applyCreatePersonaSnapshot` apply path as a studio
// edit, so it recompiles the prompt, enforces one-active-per-entity, refuses to
// deactivate a *locked* active snapshot (surfacing as a blocked op — invariant
// #2), and records provenance pointing back to this change set. Anchored to the
// event's in-game time so the timeline shows when the drift happened.
async function applyPersonaShiftEffect(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  entityId: string,
  dialShifts: Record<string, number>,
  note: string | null,
  eventInGameTime: JsonValue,
) {
  await assertPersonaShiftTarget(tx, changeSet.campaignId, entityId);
  const active = await tx.personaSnapshot.findFirst({
    where: {
      campaignId: changeSet.campaignId,
      entityId,
      isActive: true,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: {
      label: true,
      dials: true,
      values: true,
      agendas: true,
      resources: true,
      knowledgeScope: true,
      voiceGuide: true,
      constraints: true,
    },
  });
  if (!active) {
    throw new ServiceError(
      "The System AI has no active persona snapshot to shift. Activate one first.",
    );
  }

  // Apply the deltas to the current dials, clamped to the canonical range.
  // `dialShifts` is already validated to known integer dials by parseEventEffects.
  const currentDials = normalizePersonaDials(active.dials);
  const nextDials: Record<string, number> = { ...currentDials };
  for (const [key, delta] of Object.entries(dialShifts)) {
    nextDials[key] = clampPersonaDial((currentDials[key] ?? 0) + delta);
  }

  // Carry the prior persona forward, nudging only the dials; the new snapshot
  // becomes active and is anchored to the event's time. Locks are not inherited —
  // a drift produces a fresh, editable snapshot.
  const patch: ReviewPatch = {
    entityId: { to: entityId },
    label: { to: note ?? active.label },
    inGameTime: { to: eventInGameTime },
    orderKey: { to: orderKeyFromInGameTime(eventInGameTime) },
    dials: { to: nextDials },
    values: { to: active.values as JsonValue },
    agendas: { to: active.agendas as JsonValue },
    resources: { to: active.resources as JsonValue },
    knowledgeScope: { to: active.knowledgeScope },
    voiceGuide: { to: active.voiceGuide },
    constraints: { to: active.constraints },
    isActive: { to: true },
  };
  await applyCreatePersonaSnapshot(tx, changeSet, operationId, patch);
}

// Materialize a GRANT_ACHIEVEMENT effect: grant the target crawler the picked
// ACHIEVEMENT entity by creating an EARNED_ACHIEVEMENT edge (crawler → achievement)
// through the same `applyCreateRelationship` path a manual edge uses — so the
// grant carries provenance and is indexed/audited like any other canon edge.
// Idempotent: a crawler who already holds a live edge to that achievement is left
// untouched, so re-applying the event never duplicates the grant.
async function applyGrantAchievementEffect(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  crawlerEntityId: string,
  achievementEntityId: string,
  note: string | null,
) {
  // Validate both endpoints are live canon of the expected types.
  await loadEffectTargetCrawler(tx, changeSet.campaignId, crawlerEntityId);
  await assertAchievementEntity(tx, changeSet.campaignId, achievementEntityId);

  const existing = await tx.relationship.findFirst({
    where: {
      campaignId: changeSet.campaignId,
      type: RelationshipType.EARNED_ACHIEVEMENT,
      sourceId: crawlerEntityId,
      targetId: achievementEntityId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true },
  });
  if (existing) return;

  const patch: ReviewPatch = {
    type: { to: RelationshipType.EARNED_ACHIEVEMENT },
    sourceId: { to: crawlerEntityId },
    targetId: { to: achievementEntityId },
    ...(note ? { notes: { to: note } } : {}),
  };
  await applyCreateRelationship(tx, changeSet, operationId, patch);
}

// Apply an event's unapplied effects to entity state. Each effect's entity write
// goes through `applyUpdateEntity`, so it is lock-aware (a locked target / field
// blocks the whole operation), version-bumped, and provenance-tracked. Marks the
// effects applied on the event afterward. Atomic: one locked target rolls the
// whole apply back (no partial application).
async function applyApplyEventEffects(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  eventId: string,
  patch: ReviewPatch,
) {
  // Serialize effects materialization for this source event. Both generated
  // patch rows and target-state reads happen after this lock, so concurrent
  // approvals cannot overwrite each other's serialized event history.
  await tx.$queryRaw`
    SELECT id
    FROM "Event"
    WHERE id = ${eventId} AND "campaignId" = ${changeSet.campaignId}
    FOR UPDATE
  `;
  const event = await tx.event.findFirst({
    where: {
      id: eventId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true, effects: true, inGameTime: true },
  });
  if (!event) throw new ServiceError("Event not found.");
  if (event.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This event is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }

  const effects = uniqueEventEffectsById(parseEventEffects(event.effects as JsonValue));
  const patchCarriesEffects = "effects" in patch;
  const rawPatchEffects = readTo(patch, "effects");
  const canonicalAiPatchEffects =
    changeSet.source === ChangeSource.AI && patchCarriesEffects
      ? parseCanonicalAiPatchEffects(rawPatchEffects)
      : undefined;
  if (canonicalAiPatchEffects === null) {
    throw new ServiceError("Effect review patch is invalid.");
  }
  const reviewedEffects = uniqueEventEffectsById(
    canonicalAiPatchEffects ?? parseEventEffects(rawPatchEffects),
  );
  if (patchCarriesEffects && reviewedEffects.length === 0) {
    throw new ServiceError("Effect review patch has no valid effects.");
  }
  const storedById = new Map(effects.map((effect) => [effect.id, effect]));
  const patchCarriedEffects = patchCarriesEffects && changeSet.source === ChangeSource.AI
    ? reviewedEffects.filter((effect) => !storedById.has(effect.id))
    : [];
  // New generated effects only become stored canon when this accepted operation
  // is applied. Validate their exact declared shape and live target before
  // changing the local serialized effect collection.
  for (const effect of patchCarriedEffects) {
    assertValidDeclaredEffect(effect);
    await assertDeclaredEffectTarget(tx, changeSet.campaignId, effect);
    effects.push({
      ...effect,
      applied: false,
      appliedChangeSetId: null,
      pendingChangeSetId: changeSet.id,
      pendingOperationId: operationId,
      reviewStatus: "PENDING",
    });
  }
  const reviewedById = new Map(reviewedEffects.map((effect) => [effect.id, effect]));
  const reviewedIds = new Set(reviewedEffects.map((effect) => effect.id));
  if (patchCarriesEffects) {
    for (const effect of effects) {
      if (
        effect.applied ||
        reviewedIds.has(effect.id) ||
        !effectBelongsToOperation(effect, changeSet.id, operationId)
      ) {
        continue;
      }
      effect.pendingChangeSetId = null;
      effect.pendingOperationId = null;
      effect.reviewStatus = "REJECTED";
    }
  }
  const pendingIds = new Set<string>();
  const pending = effects.filter((effect) => {
    if (effect.applied) return false;
    if (pendingIds.has(effect.id)) return false;
    if (reviewedIds.size > 0) {
      const belongsToReviewedOperation =
        reviewedIds.has(effect.id) &&
        effectBelongsToOperation(effect, changeSet.id, operationId);
      if (belongsToReviewedOperation) pendingIds.add(effect.id);
      return belongsToReviewedOperation;
    }
    const belongsToPendingOperation =
      effect.pendingOperationId === operationId ||
      effect.pendingChangeSetId === changeSet.id ||
      (!effect.pendingOperationId && !effect.pendingChangeSetId);
    if (belongsToPendingOperation) pendingIds.add(effect.id);
    return belongsToPendingOperation;
  });
  if (pending.length === 0) {
    throw new ServiceError("This event has no effects left to apply.");
  }

  const appliedIds: string[] = [];
  const affectedParticipantIds = new Set<string>();
  for (const effect of pending) {
    const reviewed = reviewedById.get(effect.id);
    if (reviewed) {
      effect.kind = reviewed.kind;
      effect.targetEntityId = reviewed.targetEntityId;
      effect.stat = reviewed.stat;
      effect.delta = reviewed.delta;
      effect.valueNumber = reviewed.valueNumber;
      effect.value = reviewed.value;
      effect.dialShifts = reviewed.dialShifts;
      effect.achievementEntityId = reviewed.achievementEntityId;
      effect.note = reviewed.note;
    }
    assertValidDeclaredEffect(effect);
    if (effect.kind === "COLLAPSE_FLOOR") {
      // A campaign-scoped, subject-derived effect: it acts on the event's own
      // floor, not a hand-picked crawler. Materializes as floor open/collapse
      // anchors + a current-floor advance rather than a `crawler.*` patch.
      await applyFloorCollapseEffect(tx, changeSet, operationId, event.inGameTime as JsonValue);
    } else if (effect.kind === "PERSONA_SHIFT") {
      // Drift the target SYSTEM_AI's active persona by the dial deltas. The
      // result is a brand-new active snapshot (the prior one is preserved as
      // history), so the persona arc lives in the causality graph: event →
      // this change set → new snapshot (its provenance points back here).
      const targetEntityId = effect.targetEntityId;
      if (!targetEntityId) throw new ServiceError("Persona shift needs a target.");
      await applyPersonaShiftEffect(
        tx,
        changeSet,
        operationId,
        targetEntityId,
        effect.dialShifts ?? {},
        effect.note,
        event.inGameTime as JsonValue,
      );
      affectedParticipantIds.add(targetEntityId);
    } else if (effect.kind === "GRANT_ACHIEVEMENT") {
      // Grant the target crawler the picked achievement as an EARNED_ACHIEVEMENT
      // edge (crawler → achievement). Idempotent: a crawler who already holds the
      // achievement is left untouched so re-applying never duplicates the edge.
      const targetEntityId = effect.targetEntityId;
      if (!targetEntityId) throw new ServiceError("Achievement grant needs a target.");
      await applyGrantAchievementEffect(
        tx,
        changeSet,
        operationId,
        targetEntityId,
        effect.achievementEntityId ?? "",
        effect.note,
      );
      affectedParticipantIds.add(targetEntityId);
    } else {
      const targetEntityId = effect.targetEntityId;
      if (!targetEntityId) {
        throw new ServiceError("Effect target must be a crawler.");
      }
      const crawler = await loadEffectTargetCrawler(tx, changeSet.campaignId, targetEntityId);
      const entityPatch = effectEntityPatch(effect, crawler);
      if (entityPatch) {
        // Routes through the lock-aware entity-update path (throws + flags the op
        // blockedByLock if the target / field is locked, rolling back the apply).
        await applyUpdateEntity(tx, changeSet, operationId, targetEntityId, entityPatch);
      }
      affectedParticipantIds.add(targetEntityId);
    }
    effect.applied = true;
    effect.appliedChangeSetId = changeSet.id;
    effect.pendingChangeSetId = null;
    effect.pendingOperationId = null;
    effect.reviewStatus = "APPLIED";
    appliedIds.push(effect.id);
  }

  if (affectedParticipantIds.size > 0) {
    await tx.eventParticipant.createMany({
      data: Array.from(affectedParticipantIds).map((entityId) => ({
        eventId,
        entityId,
        role: EventParticipantRole.AFFECTED,
      })),
      skipDuplicates: true,
    });
  }

  await tx.event.update({
    where: { id: eventId },
    data: { effects: serializeEventEffects(effects) },
    select: { id: true },
  });
  await tx.provenance.create({
    data: {
      campaignId: changeSet.campaignId,
      eventId,
      changeSetId: changeSet.id,
      source: changeSet.source,
      field: "effects",
      actorUserId: changeSet.actorUserId,
      providerId: changeSet.providerId,
      model: changeSet.model,
      promptId: changeSet.promptId,
      runId: changeSet.runId,
    },
  });
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { eventId, op: OpKind.APPLY_EVENT_EFFECTS, appliedEffectIds: appliedIds },
    },
  });
  return eventId;
}

async function writeEventProvenance(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  eventId: string,
  patch: ReviewPatch,
) {
  const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
  await tx.provenance.createMany({
    data: fields.map((field) => ({
      campaignId: changeSet.campaignId,
      eventId,
      changeSetId: changeSet.id,
      source: changeSet.source,
      field,
      actorUserId: changeSet.actorUserId,
      providerId: changeSet.providerId,
      model: changeSet.model,
      promptId: changeSet.promptId,
      runId: changeSet.runId,
    })),
  });
}

async function assertCanonEvent(
  tx: Prisma.TransactionClient,
  campaignId: string,
  eventId: string,
) {
  const event = await tx.event.findFirst({
    where: { id: eventId, campaignId, status: CanonStatus.CANON },
    select: { id: true },
  });
  if (!event) throw new ServiceError("Event not found.");
  return event;
}

async function wouldCreateEventCausalityCycle(
  tx: Prisma.TransactionClient,
  campaignId: string,
  causeId: string,
  effectId: string,
) {
  const visited = new Set<string>();
  const stack = [effectId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === causeId) return true;
    visited.add(current);

    const next = await tx.eventCausality.findMany({
      where: {
        campaignId,
        causeId: current,
        status: { not: CanonStatus.ARCHIVED },
      },
      select: { effectId: true },
    });
    stack.push(...next.map((edge) => edge.effectId));
  }

  return false;
}

async function applyCreateEventCausality(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  patch: ReviewPatch,
) {
  const causeId = readTo(patch, "causeId");
  const effectId = readTo(patch, "effectId");
  if (typeof causeId !== "string" || typeof effectId !== "string") {
    throw new ServiceError("Causality endpoints are required.");
  }
  if (causeId === effectId) {
    throw new ServiceError("An event cannot cause itself.");
  }

  // Lock the campaign row to serialize causality additions and prevent concurrent cycle-check bypass.
  await tx.campaign.update({
    where: { id: changeSet.campaignId },
    data: { updatedAt: new Date() },
  });

  await assertCanonEvent(tx, changeSet.campaignId, causeId);
  await assertCanonEvent(tx, changeSet.campaignId, effectId);
  const createsCycle = await wouldCreateEventCausalityCycle(
    tx,
    changeSet.campaignId,
    causeId,
    effectId,
  );
  if (createsCycle) {
    throw new ServiceError("This causality link would create a cycle.");
  }

  const existingActive = await tx.eventCausality.findFirst({
    where: {
      campaignId: changeSet.campaignId,
      causeId,
      effectId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true },
  });
  if (existingActive) {
    throw new ServiceError("This causality link already exists.");
  }

  const edge = await tx.eventCausality.create({
    data: {
      campaignId: changeSet.campaignId,
      causeId,
      effectId,
      weight: optionalNumber(readTo(patch, "weight")),
      note: nullableString(readTo(patch, "note")),
      source: changeSet.source,
      status: CanonStatus.CANON,
    },
    select: { id: true },
  });

  await writeEventCausalityProvenance(tx, changeSet, edge.id, patch);
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: { eventCausalityId: edge.id, op: OpKind.CREATE_EVENT_CAUSALITY },
    },
  });
  return edge.id;
}

async function applyDeleteEventCausality(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  eventCausalityId: string,
  inputPatch?: ReviewPatch,
) {
  const patch: ReviewPatch = inputPatch ?? {
    status: { to: CanonStatus.ARCHIVED },
  };
  const nextStatus = (readTo(patch, "status") as CanonStatus) ?? CanonStatus.ARCHIVED;
  const isRestore = nextStatus === CanonStatus.CANON;
  const edge = await tx.eventCausality.findFirst({
    where: {
      id: eventCausalityId,
      campaignId: changeSet.campaignId,
      status: isRestore ? CanonStatus.ARCHIVED : { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true, causeId: true, effectId: true },
  });
  if (!edge) throw new ServiceError("Causality link not found.");
  if (edge.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This causality link is locked.", {
      code: "OPERATION_BLOCKED",
    });
  }
  if (isRestore) {
    await assertCanonEvent(tx, changeSet.campaignId, edge.causeId);
    await assertCanonEvent(tx, changeSet.campaignId, edge.effectId);
  }

  await tx.eventCausality.update({
    where: { id: eventCausalityId },
    data: { status: nextStatus, version: { increment: 1 } },
    select: { id: true },
  });
  await writeEventCausalityProvenance(tx, changeSet, eventCausalityId, patch);
  await tx.auditLog.create({
    data: {
      campaignId: changeSet.campaignId,
      actorUserId: changeSet.reviewedById ?? changeSet.actorUserId ?? "",
      action: "APPLY_OPERATION",
      targetType: "CHANGE_OPERATION",
      targetId: operationId,
      detail: {
        eventCausalityId,
        op: OpKind.DELETE_EVENT_CAUSALITY,
      },
    },
  });
  return eventCausalityId;
}

async function writeEventCausalityProvenance(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  eventCausalityId: string,
  patch: ReviewPatch,
) {
  const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
  await tx.provenance.createMany({
    data: fields.map((field) => ({
      campaignId: changeSet.campaignId,
      eventCausalityId,
      changeSetId: changeSet.id,
      source: changeSet.source,
      field,
      actorUserId: changeSet.actorUserId,
      providerId: changeSet.providerId,
      model: changeSet.model,
      promptId: changeSet.promptId,
      runId: changeSet.runId,
    })),
  });
}
