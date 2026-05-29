import {
  CanonStatus,
  ChangeSetStatus,
  ChangeSource,
  EntityType,
  OpDecision,
  OpKind,
  Role,
  Visibility,
  type Prisma,
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

export type ReviewQueueItem = Awaited<
  ReturnType<typeof listPendingChangeSetsForUser>
>[number];

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

export async function listPendingChangeSetsForUser(
  userId: string,
  campaignId: string,
) {
  await assertCampaignDm(userId, campaignId);
  return prisma.changeSet.findMany({
    where: { campaignId, status: ChangeSetStatus.PENDING },
    orderBy: { createdAt: "asc" },
    include: { operations: { orderBy: { id: "asc" } } },
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
    if (changeSet.operations.some((operation) => operation.blockedByLock)) {
      throw new ServiceError("One or more operations are blocked by locks.");
    }
    if (changeSet.operations.some((operation) => operation.isStale)) {
      throw new ServiceError("One or more operations are stale.");
    }

    const appliedIds: string[] = [];
    for (const operation of changeSet.operations) {
      const targetId = await applyEntityOperation(tx, changeSet, operation);
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
        action: "APPROVE",
        targetType: "CHANGE_SET",
        targetId: changeSet.id,
        detail: { appliedIds },
      },
    });

    return { id: changeSet.id, targetIds: appliedIds };
  });
}

async function refreshPendingOperationFlags(
  campaignId: string,
  changeSetId: string,
) {
  await prisma.$transaction(async (tx) => {
    const changeSet = await tx.changeSet.findFirst({
      where: { id: changeSetId, campaignId, status: ChangeSetStatus.PENDING },
      include: { operations: true },
    });
    if (!changeSet) return;

    const baseVersions = baseVersionsObject(changeSet.baseVersions);
    for (const operation of changeSet.operations) {
      if (
        operation.targetType !== "ENTITY" ||
        !isEntityReviewOp(operation.op)
      ) {
        continue;
      }

      const flags = await evaluateEntityOperationFlags(
        tx,
        {
          op: operation.op,
          targetId: operation.targetId ?? undefined,
          patch: operation.patch as ReviewPatch,
        },
        campaignId,
        baseVersions,
      );
      await tx.changeOperation.update({
        where: { id: operation.id },
        data: flags,
      });
    }
  });
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
    where: { targetType: "ENTITY", targetId: entityId, changeSet: { campaignId } },
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
) {
  if (operation.targetType !== "ENTITY") {
    throw new ServiceError("Unsupported operation target.");
  }
  const patch = operation.patch as ReviewPatch;

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
      tags: stringArray(readTo(patch, "tags")),
      status: CanonStatus.CANON,
      isStub: Boolean(readTo(patch, "isStub") ?? false),
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
    throw new ServiceError("This proposal touches locked entity fields.");
  }

  const data = entityUpdateData(patch, entity.type);
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

function entityUpdateData(patch: ReviewPatch, type: EntityType): Prisma.EntityUpdateInput {
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
