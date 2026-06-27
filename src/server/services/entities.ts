import {
  CanonStatus,
  ChangeSource,
  EntityType,
  OpKind,
  Prisma,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import {
  dataKeysFor,
  kindDataDefaults,
  readKindData,
  satelliteRowOf,
} from "@/lib/entity-kinds";
import { ServiceError } from "@/lib/errors";
import {
  createCrawlerSchema,
  createGenericEntitySchema,
  updateEntitySchema,
  type CreateCrawlerInput,
  type CreateGenericEntityInput,
  type UpdateEntityInput,
} from "@/lib/validation";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedEntityChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

const entityListSelect = {
  id: true,
  type: true,
  name: true,
  summary: true,
  status: true,
  visibility: true,
  source: true,
  tags: true,
  locked: true,
  isStub: true,
  updatedAt: true,
  crawler: {
    select: {
      level: true,
      realName: true,
      crawlerNo: true,
      isAlive: true,
      currentFloor: true,
    },
  },
} as const;

export type EntityStatusFilter = "ALL" | "CANON" | "PENDING" | "LOCKED";

const entityDetailSelect = {
  id: true,
  campaignId: true,
  type: true,
  name: true,
  summary: true,
  description: true,
  imageUrl: true,
  status: true,
  visibility: true,
  source: true,
  tags: true,
  version: true,
  locked: true,
  lockedFields: true,
  isStub: true,
  data: true,
  agentEnabled: true,
  createdAt: true,
  updatedAt: true,
  crawler: {
    select: {
      realName: true,
      crawlerNo: true,
      level: true,
      hp: true,
      mp: true,
      gold: true,
      viewCount: true,
      followerCount: true,
      favoriteCount: true,
      killCount: true,
      isAlive: true,
      currentFloor: true,
    },
  },
  // FACTION satellite (ADR 0011 Part C): the detail/edit views read these
  // through `readKindData(type, data, faction)` like any bespoke `data.*` field.
  faction: {
    select: {
      standing: true,
      strength: true,
      allegiance: true,
      resources: true,
    },
  },
  // FLOOR satellite (ADR 0011 Part C): floorNumber/theme/startDay/collapseDay
  // live here once migrated; read via `readKindData(type, data, floor)`.
  floor: {
    select: {
      floorNumber: true,
      theme: true,
      startDay: true,
      collapseDay: true,
    },
  },
} as const;

export type EntityListItem = Awaited<
  ReturnType<typeof listEntitiesForUser>
>["entities"][number];
export type EntityDetail = NonNullable<Awaited<ReturnType<typeof getEntityForUser>>>;

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
}

async function assertCampaignMember(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return null;
  return membership;
}

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to edit this campaign.");
  }
  return membership;
}

function nullIfEmpty(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

function entityCoreData(
  userId: string,
  campaignId: string,
  input: Pick<
    CreateGenericEntityInput,
    "name" | "summary" | "description" | "imageUrl" | "visibility" | "tags"
  >,
) {
  return {
    campaignId,
    createdById: userId,
    name: input.name,
    summary: nullIfEmpty(input.summary),
    description: nullIfEmpty(input.description),
    imageUrl: nullIfEmpty(input.imageUrl),
    visibility: input.visibility as Visibility,
    tags: input.tags,
    status: CanonStatus.CANON,
  };
}

function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]),
    );
  }
  return value as string | number | boolean | null | undefined;
}

function addPatch(
  patch: ReviewPatch,
  field: string,
  from: unknown,
  to: unknown,
) {
  const encodedFrom = jsonValue(from);
  const encodedTo = jsonValue(to);
  if (JSON.stringify(encodedFrom) === JSON.stringify(encodedTo)) return;
  patch[field] = {
    ...(encodedFrom === undefined
      ? {}
      : { from: encodedFrom as ReviewPatch[string]["from"] }),
    ...(encodedTo === undefined
      ? {}
      : { to: encodedTo as ReviewPatch[string]["to"] }),
  };
}

function entityCreatePatch(
  userId: string,
  campaignId: string,
  type: EntityType,
  input: Pick<
    CreateGenericEntityInput,
    "name" | "summary" | "description" | "imageUrl" | "visibility" | "tags" | "isStub"
  > &
    Record<string, unknown>,
) {
  const core = entityCoreData(userId, campaignId, input);
  return {
    campaignId: { to: campaignId },
    createdById: { to: userId },
    type: { to: type },
    name: { to: core.name },
    summary: { to: core.summary },
    description: { to: core.description },
    imageUrl: { to: core.imageUrl },
    visibility: { to: core.visibility },
    tags: { to: core.tags },
    status: { to: core.status },
    ...(input.isStub !== undefined ? { isStub: { to: input.isStub } } : {}),
    // All bespoke `data.*` fields are derived from the type's entity-kind
    // descriptor (ADR 0009) instead of per-type `data.*` lines / an
    // `if (type === …)` block. A type with no kind contributes nothing here.
    ...kindDataCreatePatch(type, input),
  } satisfies ReviewPatch;
}

// Build the `data.*` create-patch entries for a type's bespoke kind fields.
// Empty string / absent normalizes to the field's default (booleans → false,
// everything else → null), matching the prior `?? false` / `?? null` handling.
function kindDataCreatePatch(
  type: EntityType,
  input: Record<string, unknown>,
): ReviewPatch {
  const patch: ReviewPatch = {};
  const defaults = kindDataDefaults(type);
  for (const key of dataKeysFor(type)) {
    const raw = input[key];
    const value = raw === undefined || raw === "" ? defaults[key] ?? null : raw;
    patch[`data.${key}`] = { to: value as ReviewPatch[string]["to"] };
  }
  return patch;
}

// Build a CREATE_ENTITY patch for a thin stub (name + type + optional one-line
// summary + tags), the canonical create-patch shape used by the bulk-stub
// scaffolding generator (M4). Reuses `entityCreatePatch` so a scaffolded stub is
// byte-identical to a manually quick-created one (visibility DM_ONLY, isStub).
export function buildStubCreatePatch(
  userId: string,
  campaignId: string,
  spec: { type: EntityType; name: string; summary: string | null; tags: string[] },
): ReviewPatch {
  return entityCreatePatch(userId, campaignId, spec.type, {
    name: spec.name,
    summary: spec.summary ?? "",
    description: "",
    visibility: Visibility.DM_ONLY,
    tags: spec.tags,
    isStub: true,
  });
}

// Build a CREATE_ENTITY patch for a fully-fleshed generated entity (name +
// summary + description + tags), the create-patch shape used by the dungeon-
// content generator (M6). Unlike a scaffolded stub this carries a description
// and is not a stub, so the proposal lands as finished canon detail for review.
// Reuses `entityCreatePatch`, so a generated entity is byte-identical to a
// manually created one (visibility DM_ONLY).
export function buildContentCreatePatch(
  userId: string,
  campaignId: string,
  spec: {
    type: EntityType;
    name: string;
    summary: string;
    description: string;
    tags: string[];
  },
): ReviewPatch {
  return entityCreatePatch(userId, campaignId, spec.type, {
    name: spec.name,
    summary: spec.summary,
    description: spec.description,
    visibility: Visibility.DM_ONLY,
    tags: spec.tags,
    isStub: false,
  });
}

async function entityResult(entityId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, name: true, type: true },
  });
  if (!entity) throw new ServiceError("Entity not found.");
  return entity;
}

function playerVisibleWhere(role: Role) {
  return role === Role.PLAYER
    ? { visibility: Visibility.PLAYER_VISIBLE }
    : {};
}

export async function createGenericEntity(
  userId: string,
  campaignId: string,
  input: CreateGenericEntityInput,
) {
  const parsed = createGenericEntitySchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const result = await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Create ${parsed.name}`,
    operations: [{
      op: OpKind.CREATE_ENTITY,
      patch: entityCreatePatch(
        userId,
        campaignId,
        parsed.type as EntityType,
        parsed,
      ),
    }],
  });
  return entityResult(result.targetIds[0]);
}

export async function createCrawler(
  userId: string,
  campaignId: string,
  input: CreateCrawlerInput,
) {
  const parsed = createCrawlerSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const patch = entityCreatePatch(userId, campaignId, EntityType.CRAWLER, parsed);
  Object.assign(patch, {
    "crawler.realName": { to: nullIfEmpty(parsed.realName) },
    "crawler.crawlerNo": { to: nullIfEmpty(parsed.crawlerNo) },
    "crawler.level": { to: parsed.level },
    "crawler.hp": { to: parsed.hp ?? null },
    "crawler.mp": { to: parsed.mp ?? null },
    "crawler.gold": { to: parsed.gold },
    "crawler.viewCount": { to: parsed.viewCount.toString() },
    "crawler.followerCount": { to: parsed.followerCount.toString() },
    "crawler.favoriteCount": { to: parsed.favoriteCount.toString() },
    "crawler.killCount": { to: parsed.killCount },
    "crawler.isAlive": { to: parsed.isAlive },
    "crawler.currentFloor": { to: parsed.currentFloor ?? null },
  });

  const result = await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Create ${parsed.name}`,
    operations: [{ op: OpKind.CREATE_ENTITY, patch }],
  });
  return entityResult(result.targetIds[0]);
}

// CANON/PENDING narrow the status facet; everything else (LOCKED, unset) just
// excludes archived entities.
function entityStatusWhere(
  status: EntityStatusFilter | undefined,
): Prisma.EntityWhereInput["status"] {
  switch (status) {
    case "CANON":
      return CanonStatus.CANON;
    case "PENDING":
      return CanonStatus.PENDING;
    default:
      return { not: CanonStatus.ARCHIVED };
  }
}

// Tags are stored as entered, so match a search term against its common casings
// (raw, lower, upper, Title) for a case-insensitive tag `hasSome`.
function tagCasings(term: string): string[] {
  return [
    term,
    term.toLowerCase(),
    term.toUpperCase(),
    term.charAt(0).toUpperCase() + term.slice(1).toLowerCase(),
  ];
}

export async function listEntitiesForUser(
  userId: string,
  campaignId: string,
  filters: {
    query?: string;
    tag?: string;
    type?: EntityType | "ALL";
    status?: EntityStatusFilter;
    lockedOnly?: boolean;
    source?: ChangeSource | "ALL";
    /**
     * "AI-origin & never edited": entities the AI created (source AI) that no one
     * has touched since (version still 1 — every applied edit bumps version but
     * leaves source). A quick provenance filter for un-reviewed AI canon.
     */
    aiUntouched?: boolean;
  } = {},
  paging?: { page: number; pageSize: number },
) {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return { entities: [], role: null, total: 0 };

  const query = filters.query?.trim();
  const tag = filters.tag?.trim();
  const type = filters.type && filters.type !== "ALL" ? filters.type : undefined;
  const status = filters.status && filters.status !== "ALL" ? filters.status : undefined;
  const lockedOnly = filters.lockedOnly || status === "LOCKED";
  const aiUntouched = filters.aiUntouched ?? false;
  const source = filters.source && filters.source !== "ALL" ? filters.source : undefined;

  const where: Prisma.EntityWhereInput = {
    campaignId,
    status: entityStatusWhere(status),
    ...(lockedOnly
      ? {
          OR: [
            { locked: true },
            { NOT: { lockedFields: { equals: [] } } },
          ],
        }
      : {}),
    // The AI-untouched quick filter implies source = AI, so it takes precedence
    // over an explicit source facet (the page clears that facet when toggling).
    ...(aiUntouched
      ? { source: ChangeSource.AI, version: 1 }
      : source
        ? { source }
        : {}),
    ...playerVisibleWhere(membership.role),
    ...(type ? { type } : {}),
    ...(tag
      ? {
          tags: {
            hasSome: tagCasings(tag),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { summary: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            {
              tags: {
                hasSome: tagCasings(query),
              },
            },
          ],
        }
      : {}),
  };

  if (paging) {
    // Clamp to safe bounds: page ≥ 1, pageSize ≤ 100.
    const page = Math.max(1, paging.page);
    const pageSize = Math.min(100, Math.max(1, paging.pageSize));
    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }, { id: "asc" }],
        select: entityListSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.entity.count({ where }),
    ]);
    return { entities, role: membership.role, total, page, pageSize };
  }

  const entities = await prisma.entity.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }, { id: "asc" }],
    select: entityListSelect,
  });

  // Return `total` even on the un-paged path (avoids a second count query).
  return { entities, role: membership.role, total: entities.length };
}

export type FleshCandidate = { id: string; name: string; type: EntityType };

// Non-locked, non-archived stub entities — the natural targets for a bulk AI
// flesh-out run (a full entity is fleshed one-off from its detail rail). DM-only
// (returns [] for players / non-members), so the World Browser's bulk-flesh
// panel is gated the same way as the AI key list.
export async function listFleshCandidates(
  userId: string,
  campaignId: string,
): Promise<FleshCandidate[]> {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) return [];
  return prisma.entity.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      locked: false,
      isStub: true,
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, type: true },
  });
}

export async function listCampaignTags(
  userId: string,
  campaignId: string,
): Promise<string[]> {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return [];

  const entities = await prisma.entity.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    select: {
      tags: true,
    },
  });

  const uniqueTags = new Map<string, string>();
  for (const entity of entities) {
    for (const tag of entity.tags) {
      const trimmed = tag.trim();
      if (trimmed) {
        const lower = trimmed.toLowerCase();
        if (!uniqueTags.has(lower)) {
          uniqueTags.set(lower, trimmed);
        }
      }
    }
  }

  return Array.from(uniqueTags.values()).sort((a, b) => a.localeCompare(b));
}

// Per-type counts for the world-browser facets. Scoped + visibility-aware, and
// independent of the active type filter so every facet shows its true total.
export async function getEntityTypeCounts(
  userId: string,
  campaignId: string,
): Promise<Partial<Record<EntityType, number>>> {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return {};

  const groups = await prisma.entity.groupBy({
    by: ["type"],
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    _count: { _all: true },
  });

  const counts: Partial<Record<EntityType, number>> = {};
  for (const group of groups) counts[group.type] = group._count._all;
  return counts;
}

export async function getEntityForUser(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return null;

  return prisma.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    select: entityDetailSelect,
  });
}

export async function updateEntity(
  userId: string,
  campaignId: string,
  entityId: string,
  input: UpdateEntityInput,
) {
  const parsed = updateEntitySchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: {
      id: true,
      type: true,
      name: true,
      summary: true,
      description: true,
      imageUrl: true,
      visibility: true,
      tags: true,
      version: true,
      isStub: true,
      data: true,
      crawler: {
        select: {
          realName: true,
          crawlerNo: true,
          level: true,
          hp: true,
          mp: true,
          gold: true,
          viewCount: true,
          followerCount: true,
          favoriteCount: true,
          killCount: true,
          isAlive: true,
          currentFloor: true,
        },
      },
      // FACTION/FLOOR satellites (ADR 0011 Part C): needed so the diff `from`
      // value of a satellite-backed `data.*` field is the real stored value, not
      // a JSON null.
      faction: {
        select: {
          standing: true,
          strength: true,
          allegiance: true,
          resources: true,
        },
      },
      floor: {
        select: {
          floorNumber: true,
          theme: true,
          startDay: true,
          collapseDay: true,
        },
      },
    },
  });

  if (!existing) throw new ServiceError("Entity not found.");
  if (existing.type !== parsed.type) {
    throw new ServiceError("Entity type cannot be changed.");
  }

  const patch: ReviewPatch = {
    _baseVersion: { to: existing.version },
  };
  addPatch(patch, "name", existing.name, parsed.name);
  addPatch(patch, "summary", existing.summary, nullIfEmpty(parsed.summary));
  addPatch(
    patch,
    "description",
    existing.description,
    nullIfEmpty(parsed.description),
  );
  addPatch(patch, "imageUrl", existing.imageUrl, nullIfEmpty(parsed.imageUrl));
  addPatch(patch, "visibility", existing.visibility, parsed.visibility as Visibility);
  addPatch(patch, "tags", existing.tags, parsed.tags);

  if (existing.isStub) {
    addPatch(patch, "isStub", true, false);
  }

  // All bespoke `data.*` fields derive from the type's entity-kind descriptor
  // (ADR 0009 slice 2): one data-driven pass replaces the per-type ITEM/FLOOR
  // blocks. Empty string / absent normalizes to the field default (booleans →
  // false, everything else → null), matching the prior `?? false` / `?? null`.
  const parsedData = parsed as Record<string, unknown>;
  // Read the existing blob through the versioned seam (ADR 0011) so the diff
  // `from` value is the upgraded shape, not a stale stored one. The 1:1 satellite
  // row (FACTION/FLOOR), picked from the type's descriptor, is merged in so
  // satellite-backed `data.*` fields diff against their real stored value, not a
  // JSON null (ADR 0011 Part C).
  const existingDataRecord = readKindData(
    existing.type,
    existing.data,
    satelliteRowOf(existing.type, existing),
  );
  const dataDefaults = kindDataDefaults(existing.type);
  for (const key of dataKeysFor(existing.type)) {
    const raw = parsedData[key];
    addPatch(
      patch,
      `data.${key}`,
      existingDataRecord[key] ?? dataDefaults[key] ?? null,
      raw === undefined || raw === "" ? dataDefaults[key] ?? null : raw,
    );
  }

  if (existing.type === EntityType.CRAWLER && existing.crawler) {
    addPatch(patch, "crawler.realName", existing.crawler.realName, nullIfEmpty(parsed.realName));
    addPatch(patch, "crawler.crawlerNo", existing.crawler.crawlerNo, nullIfEmpty(parsed.crawlerNo));
    addPatch(patch, "crawler.level", existing.crawler.level, parsed.level ?? 1);
    addPatch(patch, "crawler.hp", existing.crawler.hp, parsed.hp ?? null);
    addPatch(patch, "crawler.mp", existing.crawler.mp, parsed.mp ?? null);
    addPatch(patch, "crawler.gold", existing.crawler.gold, parsed.gold ?? 0);
    addPatch(
      patch,
      "crawler.viewCount",
      existing.crawler.viewCount,
      parsed.viewCount ?? BigInt(0),
    );
    addPatch(
      patch,
      "crawler.followerCount",
      existing.crawler.followerCount,
      parsed.followerCount ?? BigInt(0),
    );
    addPatch(
      patch,
      "crawler.favoriteCount",
      existing.crawler.favoriteCount,
      parsed.favoriteCount ?? BigInt(0),
    );
    addPatch(patch, "crawler.killCount", existing.crawler.killCount, parsed.killCount ?? 0);
    addPatch(patch, "crawler.isAlive", existing.crawler.isAlive, parsed.isAlive ?? true);
    addPatch(
      patch,
      "crawler.currentFloor",
      existing.crawler.currentFloor,
      parsed.currentFloor ?? null,
    );
  }

  if (Object.keys(patch).length === 1) return entityResult(entityId);

  await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Update ${existing.name}`,
    operations: [{ op: OpKind.UPDATE_ENTITY, targetId: entityId, patch }],
  });
  return entityResult(entityId);
}

export async function archiveEntity(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, name: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Entity not found.");

  await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Archive ${existing.name}`,
    operations: [{
      op: OpKind.DELETE_ENTITY,
      targetId: entityId,
      patch: {
        _baseVersion: { to: existing.version },
        status: { from: existing.status, to: CanonStatus.ARCHIVED },
      },
    }],
  });
  return { id: entityId };
}

export async function restoreEntity(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: CanonStatus.ARCHIVED },
    select: { id: true, name: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Archived entity not found.");

  await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Restore ${existing.name}`,
    operations: [{
      op: OpKind.UPDATE_ENTITY,
      targetId: entityId,
      patch: {
        _baseVersion: { to: existing.version },
        status: { from: existing.status, to: CanonStatus.CANON },
      },
    }],
  });
  return { id: entityId };
}
