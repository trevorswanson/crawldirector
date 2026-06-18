import {
  CanonStatus,
  ChangeSource,
  EntityType,
  OpKind,
  Role,
} from "@/generated/prisma/client";
import {
  dataKeysFor,
  isKindDataStale,
  kindTypes,
  readKindData,
} from "@/lib/entity-kinds";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedEntityChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

export type EntityDataMigrationResult = {
  checked: number;
  migrated: number;
  skipped: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonValue(value: unknown): ReviewPatch[string]["to"] | undefined {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value as ReviewPatch[string]["to"] | undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonValue(item) ?? null) as ReviewPatch[string]["to"];
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        jsonValue(nested) ?? null,
      ]),
    ) as ReviewPatch[string]["to"];
  }
  return undefined;
}

async function resolveMigrationActor(
  userId: string | null,
  campaignId: string,
): Promise<string> {
  if (userId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true },
    });
    if (!membership || membership.role === Role.PLAYER) {
      throw new ServiceError("You do not have permission to migrate entity data.");
    }
    return userId;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { ownerId: true },
  });
  if (!campaign) throw new ServiceError("Campaign not found.");
  return campaign.ownerId;
}

function migrationPatchFor(row: {
  type: EntityType;
  version: number;
  data: unknown;
}): ReviewPatch {
  const raw = asRecord(row.data);
  const upgraded = readKindData(row.type, row.data);
  const patch: ReviewPatch = {
    _baseVersion: { to: row.version },
  };

  for (const key of dataKeysFor(row.type)) {
    const to = jsonValue(upgraded[key]);
    const fieldPatch: ReviewPatch[string] = {
      ...(raw[key] === undefined ? {} : { from: jsonValue(raw[key]) }),
      ...(to === undefined ? {} : { to }),
    };
    patch[`data.${key}`] = fieldPatch;
  }

  return patch;
}

export async function migrateEntityData(
  userId: string | null,
  campaignId: string,
): Promise<EntityDataMigrationResult> {
  const actorUserId = await resolveMigrationActor(userId, campaignId);
  const versionedTypes = kindTypes() as EntityType[];
  if (versionedTypes.length === 0) {
    return { checked: 0, migrated: 0, skipped: 0 };
  }

  const rows = await prisma.entity.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      type: { in: versionedTypes },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      version: true,
      data: true,
    },
  });
  const stale = rows.filter((row) => isKindDataStale(row.type, row.data));

  let migrated = 0;
  let skipped = 0;
  for (const row of stale) {
    try {
      await applyAutoApprovedEntityChangeSet(actorUserId, campaignId, {
        source: ChangeSource.MIGRATION,
        auditAction: "MIGRATE",
        title: `Migrate data for ${row.name}`,
        summary: `Upgrade ${row.type} data to the current schema version.`,
        operations: [
          {
            op: OpKind.UPDATE_ENTITY,
            targetId: row.id,
            patch: migrationPatchFor(row),
          },
        ],
      });
      migrated += 1;
    } catch (error) {
      if (
        error instanceof ServiceError &&
        (error.code === "OPERATION_STALE" || error.message === "Entity not found.")
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { checked: stale.length, migrated, skipped };
}
