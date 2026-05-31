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
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

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
    | "DELETE_EVENT_CAUSALITY";
  targetId?: string;
  patch: ReviewPatch;
};

export type ChangeOperationDecisionInput =
  | { decision: "PENDING" | "ACCEPTED" | "REJECTED"; editedPatch?: never }
  | { decision: "EDITED"; editedPatch: ReviewPatch };

export type ReviewQueueOperation =
  Prisma.ChangeOperationGetPayload<object> & {
    targetLabel: string | null;
    targetEntityType: string | null;
    targetLocked: boolean;
    lockedFields: string[];
    currentValues: Record<string, unknown>;
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

const dataFields = new Set([
  "data.itemTypeId",
  "data.divine",
  "data.unique",
  "data.fleeting",
  "data.aiDescription",
]);

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

function nullableString(value: JsonValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: JsonValue | undefined) {
  return typeof value === "number" ? value : null;
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

function effectiveOperationPatch(
  operation: Pick<
    Prisma.ChangeOperationGetPayload<object>,
    "decision" | "editedPatch" | "patch"
  >,
) {
  if (operation.decision !== OpDecision.EDITED) {
    return operation.patch as ReviewPatch;
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

function operationBaseVersions(operations: EntityReviewOperationInput[]) {
  const baseVersions: Record<string, number> = {};
  for (const operation of operations) {
    if (!operation.targetId) continue;
    const version = readTo(operation.patch, "_baseVersion");
    if (typeof version === "number") baseVersions[operation.targetId] = version;
  }
  return baseVersions;
}

function isEntityReviewOp(op: OpKind): op is EntityReviewOperationInput["op"] {
  return (
    op === OpKind.CREATE_ENTITY ||
    op === OpKind.UPDATE_ENTITY ||
    op === OpKind.DELETE_ENTITY
  );
}

export async function createPendingEntityChangeSet(
  userId: string,
  campaignId: string,
  input: {
    source?: ChangeSource;
    title: string;
    summary?: string;
    runId?: string;
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
        source: ChangeSource.DM,
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
    for (const operation of changeSet.operations) {
      const targetId = await applyEntityOperation(tx, changeSet, operation);
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
        action: "AUTO_APPROVE",
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
    for (const operation of changeSet.operations) {
      const targetId = await applyRelationshipOperation(tx, changeSet, operation);
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
    });

    const appliedIds: string[] = [];
    for (const operation of changeSet.operations) {
      const targetId = await applyEventOperation(tx, changeSet, operation);
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

async function enrichReviewQueueItems(
  campaignId: string,
  changeSets: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>[],
): Promise<ReviewQueueItem[]> {
  const targetIds = Array.from(
    new Set(
      changeSets.flatMap((changeSet) =>
        changeSet.operations
          .map((operation) => operation.targetId)
          .filter((targetId): targetId is string => Boolean(targetId)),
      ),
    ),
  );
  const targets = targetIds.length
    ? await prisma.entity.findMany({
        where: { campaignId, id: { in: targetIds } },
        include: { crawler: true },
      })
    : [];
  const targetById = new Map(targets.map((target) => [target.id, target]));

  return changeSets.map((changeSet) => ({
    ...changeSet,
    operations: changeSet.operations.map((operation) => {
      const patch = operation.patch as ReviewPatch;
      const target =
        operation.targetId ? targetById.get(operation.targetId) : undefined;
      const targetEntityType =
        target?.type ?? stringFromReviewValue(readTo(patch, "type"));
      const fields = patchFields(patch).filter((field) => field !== "_baseVersion");
      const currentValues: Record<string, unknown> = {};
      for (const field of fields) {
        const current = target ? currentEntityValue(target, field) : undefined;
        if (current !== undefined) currentValues[field] = current;
      }

      return {
        ...operation,
        targetLabel:
          target?.name ??
          stringFromReviewValue(readTo(patch, "name")) ??
          operation.targetId ??
          null,
        targetEntityType,
        targetLocked: Boolean(target?.locked),
        lockedFields: target?.lockedFields ?? [],
        currentValues,
      };
    }),
  }));
}

function stringFromReviewValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function currentEntityValue(
  entity: Prisma.EntityGetPayload<{ include: { crawler: true } }>,
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
    case "visibility":
      return entity.visibility;
    case "tags":
      return entity.tags;
    case "isStub":
      return entity.isStub;
    case "data":
      return entity.data;
    case "customFields":
      return entity.customFields;
    case "data.itemTypeId":
    case "data.divine":
    case "data.unique":
    case "data.fleeting":
    case "data.aiDescription": {
      const metadata = entity.data as {
        itemTypeId?: string | null;
        divine?: boolean;
        unique?: boolean;
        fleeting?: boolean;
        aiDescription?: string | null;
      } | null;
      if (field === "data.itemTypeId") return metadata?.itemTypeId ?? null;
      if (field === "data.divine") return metadata?.divine ?? false;
      if (field === "data.unique") return metadata?.unique ?? false;
      if (field === "data.fleeting") return metadata?.fleeting ?? false;
      if (field === "data.aiDescription") return metadata?.aiDescription ?? null;
      return undefined;
    }
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
    if (operation.targetType !== "ENTITY" || !isEntityReviewOp(operation.op)) {
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
    }

    const editedPatch =
      input.decision === OpDecision.EDITED
        ? (input.editedPatch as Prisma.InputJsonValue)
        : Prisma.DbNull;
    const patchForFlags =
      input.decision === OpDecision.EDITED ? input.editedPatch : operation.patch as ReviewPatch;
    const flags =
      input.decision === OpDecision.REJECTED
        ? { blockedByLock: false, isStale: false }
        : await evaluateEntityOperationFlags(
            tx,
            {
              op: operation.op,
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

export async function approveChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await assertCampaignDm(userId, campaignId);
  await refreshPendingOperationFlags(campaignId, changeSetId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      include: { operations: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");
    const applicableOperations = changeSet.operations.filter(
      (operation) => operation.decision !== OpDecision.REJECTED,
    );
    if (applicableOperations.some((operation) => operation.blockedByLock)) {
      throw new ServiceError("One or more operations are blocked by locks.");
    }
    if (applicableOperations.some((operation) => operation.isStale)) {
      throw new ServiceError("One or more operations are stale.");
    }

    const appliedIds: string[] = [];
    for (const operation of applicableOperations) {
      const targetId = await applyEntityOperation(
        tx,
        changeSet,
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

    const rejectedCount = changeSet.operations.length - applicableOperations.length;
    const status =
      applicableOperations.length === 0
        ? ChangeSetStatus.REJECTED
        : rejectedCount > 0
          ? ChangeSetStatus.PARTIALLY_APPLIED
          : ChangeSetStatus.APPROVED;
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

    try {
      await approveChangeSet(userId, campaignId, changeSet.id);
      approvedIds.push(changeSet.id);
    } catch (error) {
      if (
        error instanceof ServiceError &&
        (error.message.includes("stale") || error.message.includes("lock"))
      ) {
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
          operation.targetType !== "ENTITY" ||
          !isEntityReviewOp(operation.op)
        ) {
          continue;
        }

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

export async function rejectChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      select: { id: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");

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
      select: { id: true },
    });
    if (!changeSet) throw new ServiceError("Change set not found.");

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

    const action = lockedChanged
      ? nextLocked
        ? "LOCK"
        : "UNLOCK"
      : "SET_FIELD_LOCKS";
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

  return {
    source: origin.source,
    authorLabel: label(origin.actor),
    createdAt: origin.createdAt,
    model: origin.model,
    approvedByLabel: label(origin.reviewer),
    approvedAt: origin.reviewedAt,
    lastChangeTitle: last.title,
    lastChangeSource: last.source,
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

  const entity = await tx.entity.create({
    data: {
      campaignId: changeSet.campaignId,
      createdById: changeSet.actorUserId,
      type: type as EntityType,
      name: String(readTo(patch, "name") ?? ""),
      summary: nullableString(readTo(patch, "summary")),
      description: nullableString(readTo(patch, "description")),
      visibility: (readTo(patch, "visibility") as Visibility) ?? Visibility.DM_ONLY,
      source: changeSet.source,
      tags: stringArray(readTo(patch, "tags")),
      status: CanonStatus.CANON,
      isStub: Boolean(readTo(patch, "isStub") ?? false),
      data: {
        itemTypeId: nullableString(readTo(patch, "data.itemTypeId")),
        divine: booleanWithDefault(readTo(patch, "data.divine"), false),
        unique: booleanWithDefault(readTo(patch, "data.unique"), false),
        fleeting: booleanWithDefault(readTo(patch, "data.fleeting"), false),
        aiDescription: nullableString(readTo(patch, "data.aiDescription")),
      } as Prisma.InputJsonValue,
      ...(type === EntityType.CRAWLER
        ? {
            crawler: {
              create: crawlerCreateData(patch),
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
  return entity.id;
}

async function applyUpdateEntity(
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
    select: {
      id: true,
      type: true,
      version: true,
      locked: true,
      lockedFields: true,
      data: true,
    },
  });
  if (!entity) throw new ServiceError("Entity not found.");

  const expectedVersion = baseVersionsObject(changeSet.baseVersions)[entityId];
  if (typeof expectedVersion === "number" && expectedVersion !== entity.version) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { isStale: true },
    });
    throw new ServiceError("Entity changed since this proposal was created.");
  }

  const lockedFields = lockedPatchFields(patch, entity.locked, entity.lockedFields);
  if (lockedFields.length > 0) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    if (entity.locked) {
      throw new ServiceError("Cannot update because the entity is locked.");
    }
    const fieldsText = lockedFields.map((f) => `"${f}"`).join(", ");
    throw new ServiceError(`This proposal touches locked entity fields: ${fieldsText}`);
  }

  const data = entityUpdateData(patch, entity.type, entity.data);
  await tx.entity.update({
    where: { id: entityId },
    data,
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
      detail: { entityId, op: OpKind.UPDATE_ENTITY },
    },
  });
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
    throw new ServiceError("Entity changed since this proposal was created.");
  }

  if (entity.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This entity is locked.");
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
  return entityId;
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

function entityUpdateData(patch: ReviewPatch, type: EntityType, existingData?: unknown): Prisma.EntityUpdateInput {
  const data: Prisma.EntityUpdateInput = {
    version: { increment: 1 },
  };
  if ("name" in patch) data.name = String(readTo(patch, "name") ?? "");
  if ("summary" in patch) data.summary = nullableString(readTo(patch, "summary"));
  if ("description" in patch) {
    data.description = nullableString(readTo(patch, "description"));
  }
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

  const dataPatch = Object.keys(patch).some((field) => dataFields.has(field));
  if (dataPatch) {
    const currentData = (existingData && typeof existingData === "object" ? { ...existingData } : {}) as {
      itemTypeId?: string | null;
      divine?: boolean;
      unique?: boolean;
      fleeting?: boolean;
      aiDescription?: string | null;
    };
    if ("data.itemTypeId" in patch) {
      currentData.itemTypeId = nullableString(readTo(patch, "data.itemTypeId"));
    }
    if ("data.divine" in patch) {
      currentData.divine = booleanWithDefault(readTo(patch, "data.divine"), false);
    }
    if ("data.unique" in patch) {
      currentData.unique = booleanWithDefault(readTo(patch, "data.unique"), false);
    }
    if ("data.fleeting" in patch) {
      currentData.fleeting = booleanWithDefault(readTo(patch, "data.fleeting"), false);
    }
    if ("data.aiDescription" in patch) {
      currentData.aiDescription = nullableString(readTo(patch, "data.aiDescription"));
    }
    data.data = currentData;
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
    case OpKind.DELETE_RELATIONSHIP:
      if (!operation.targetId) throw new ServiceError("Missing relationship target.");
      return applyDeleteRelationship(tx, changeSet, operation.id, operation.targetId);
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

  const relationship = await tx.relationship.create({
    data: {
      campaignId: changeSet.campaignId,
      type: type as RelationshipType,
      sourceId,
      targetId,
      disposition: optionalNumber(readTo(patch, "disposition")),
      notes: nullableString(readTo(patch, "notes")),
      secret: booleanWithDefault(readTo(patch, "secret"), false),
      source: changeSet.source,
      status: CanonStatus.CANON,
    },
    select: { id: true },
  });

  await writeRelationshipProvenance(tx, changeSet, relationship.id, patch);
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

async function applyDeleteRelationship(
  tx: Prisma.TransactionClient,
  changeSet: Prisma.ChangeSetGetPayload<{ include: { operations: true } }>,
  operationId: string,
  relationshipId: string,
) {
  const relationship = await tx.relationship.findFirst({
    where: {
      id: relationshipId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true },
  });
  if (!relationship) throw new ServiceError("Relationship not found.");

  if (relationship.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This relationship is locked.");
  }

  await tx.relationship.update({
    where: { id: relationshipId },
    data: { status: CanonStatus.ARCHIVED, version: { increment: 1 } },
    select: { id: true },
  });
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
  if (participants.length === 0) {
    throw new ServiceError("An event needs at least one participant.");
  }
  // Participants must be live canon entities in this campaign.
  for (const participant of participants) {
    await assertCanonEntity(tx, changeSet.campaignId, participant.entityId);
  }

  const event = await tx.event.create({
    data: {
      campaignId: changeSet.campaignId,
      title,
      summary: nullableString(readTo(patch, "summary")),
      description: nullableString(readTo(patch, "description")),
      inGameTime: jsonObject(readTo(patch, "inGameTime")),
      orderKey: numberWithDefault(readTo(patch, "orderKey"), 0),
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
  const event = await tx.event.findFirst({
    where: {
      id: eventId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true },
  });
  if (!event) throw new ServiceError("Event not found.");

  if (event.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This event is locked.");
  }

  // This slice's only UPDATE_EVENT use is soft-archive (a status change).
  // Editing event fields (title/time/secret) lands with the event
  // locking/editing slice, alongside its own coverage.
  const data: Prisma.EventUpdateInput = { version: { increment: 1 } };
  if ("status" in patch) {
    data.status = (readTo(patch, "status") as CanonStatus) ?? CanonStatus.CANON;
  }

  await tx.event.update({ where: { id: eventId }, data, select: { id: true } });
  await writeEventProvenance(tx, changeSet, eventId, patch);
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
) {
  const edge = await tx.eventCausality.findFirst({
    where: {
      id: eventCausalityId,
      campaignId: changeSet.campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, locked: true },
  });
  if (!edge) throw new ServiceError("Causality link not found.");
  if (edge.locked) {
    await tx.changeOperation.update({
      where: { id: operationId },
      data: { blockedByLock: true },
    });
    throw new ServiceError("This causality link is locked.");
  }

  const patch: ReviewPatch = {
    status: { to: CanonStatus.ARCHIVED },
  };
  await tx.eventCausality.update({
    where: { id: eventCausalityId },
    data: { status: CanonStatus.ARCHIVED, version: { increment: 1 } },
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
