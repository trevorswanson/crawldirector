import {
  CanonStatus,
  ChangeSource,
  EntityType,
  EventParticipantRole,
  OpKind,
  Prisma,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { orderFromCausality } from "@/lib/causality-order";
import { ServiceError } from "@/lib/errors";
import { generateRankBetween } from "@/lib/rank";
import {
  buildTimeRef,
  floorRelativeSortKey,
  phraseTimeRef,
  readTimeRef,
  type TimeBasis,
  type TimeRefInput,
  type TimeUnit,
} from "@/lib/time-ref";
import {
  createEventSchema,
  updateEventSchema,
  type CreateEventInput,
  type EventEffectKind,
  type EventEffectStat,
  type UpdateEventInput,
} from "@/lib/validation";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedEventChangeSet,
  createPendingEventChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
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

// The projected in-fiction time for an event (ADR 0004 slice 2). `phrase` is the
// generated display string (or the DM's `label` override); the structured
// fields seed the event form's basis/offset/unit pickers and anchor selector.
export type EventTimeInfo = {
  basis: TimeBasis;
  floor: number | null;
  offset: number | null;
  unit: TimeUnit | null;
  anchorEventId: string | null;
  label: string | null;
  phrase: string | null;
};

export type EventCausalitySummary = { id: string; title: string; linkId: string };

// A declared event effect, projected for display. DM-only — never surfaced to
// players (effects are a DM mechanic and can spoil unrevealed canon). The target
// name is resolved client-side from the campaign entity candidates.
export type EventEffectView = {
  id: string;
  kind: EventEffectKind;
  targetId: string;
  stat: EventEffectStat | null;
  delta: number | null;
  valueNumber: number | null;
  value: boolean | null;
  note: string | null;
  applied: boolean;
  appliedChangeSetId: string | null;
  pendingChangeSetId: string | null;
  pendingOperationId: string | null;
  reviewStatus: "PENDING" | "REJECTED" | "SUPERSEDED" | "APPLIED" | null;
};

// Project the event.effects JSON for display. Players get an empty list.
function projectEventEffects(value: unknown, isPlayer: boolean): EventEffectView[] {
  if (isPlayer || !Array.isArray(value)) return [];
  const views: EventEffectView[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    if (typeof record.kind !== "string") continue;
    if (typeof record.targetEntityId !== "string") continue;
    views.push({
      id: record.id,
      kind: record.kind as EventEffectKind,
      targetId: record.targetEntityId,
      stat: typeof record.stat === "string" ? (record.stat as EventEffectStat) : null,
      delta: typeof record.delta === "number" ? record.delta : null,
      valueNumber:
        typeof record.valueNumber === "number" ? record.valueNumber : null,
      value: typeof record.value === "boolean" ? record.value : null,
      note: typeof record.note === "string" ? record.note : null,
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
          : record.applied === true
            ? "APPLIED"
            : null,
    });
  }
  return views;
}

function reviewableEffectRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const effects: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.applied === true) continue;
    if (record.reviewStatus === "PENDING") continue;
    if (record.reviewStatus === "REJECTED" || record.reviewStatus === "SUPERSEDED") {
      continue;
    }
    if (typeof record.id !== "string" || typeof record.targetEntityId !== "string") {
      continue;
    }
    effects.push({ ...record });
  }
  return effects;
}

export type EntityEvent = {
  id: string;
  title: string;
  summary: string | null;
  time: EventTimeInfo;
  orderKey: number;
  // Intra-floor fractional sort key (ADR 0004). Exposed so the timeline can
  // compute drag neighbours; it is mechanical, never shown as a value.
  rank: string;
  secret: boolean;
  locked: boolean;
  source: ChangeSource;
  // The viewed entity's role in this event (its first, for the compact chip).
  role: EventParticipantRole;
  // Every role the viewed entity holds on this event (an entity can be e.g.
  // both ACTOR and TARGET). The edit form seeds a row per role so editing
  // never silently drops the entity's other-role participations.
  selfRoles: EventParticipantRole[];
  // Other participants (the viewed entity excluded), visibility-scoped.
  others: { id: string; name: string; type: string; role: EventParticipantRole }[];
  causedBy: EventCausalitySummary[];
  causes: EventCausalitySummary[];
  // Declared effects (DM-only — empty for players).
  effects: EventEffectView[];
};

export type CampaignTimelineParticipant = {
  id: string;
  name: string;
  type: string;
  role: EventParticipantRole;
};

export type CampaignTimelineEvent = {
  id: string;
  title: string;
  summary: string | null;
  time: EventTimeInfo;
  orderKey: number;
  // Intra-floor fractional sort key (ADR 0004) — used to compute drag
  // neighbours on the timeline; mechanical, never shown as a value.
  rank: string;
  secret: boolean;
  locked: boolean;
  source: ChangeSource;
  participants: CampaignTimelineParticipant[];
  causedBy: EventCausalitySummary[];
  causes: EventCausalitySummary[];
  // Declared effects (DM-only — empty for players).
  effects: EventEffectView[];
};

const otherEntitySelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  visibility: true,
} as const;

function isPlayerVisible(entity: {
  status: CanonStatus;
  visibility: Visibility;
}) {
  return (
    entity.status !== CanonStatus.ARCHIVED &&
    (entity.visibility === Visibility.SHARED_WITH_PLAYERS ||
      entity.visibility === Visibility.PLAYER_FACING)
  );
}

// Build the typed in-game time JSON (a `TimeRef`) the Event stores (ADR 0004
// slice 2). The mechanical order key (the floor) and intra-floor rank are
// derived from this anchor server-side in the review apply path, never authored
// here — DCC time is irregular, so floor is the natural coarse clock.
function buildInGameTime(input: {
  basis?: TimeBasis;
  floor?: number;
  offset?: number;
  unit?: TimeUnit;
  anchorEventId?: string;
  timeLabel?: string;
}) {
  const refInput: TimeRefInput = {
    basis: input.basis,
    floor: input.floor,
    offset: input.offset,
    unit: input.unit,
    anchorEventId: input.anchorEventId,
    label: input.timeLabel,
  };
  return buildTimeRef(refInput);
}

// Project a stored in-game time into `EventTimeInfo` for display. `anchorTitles`
// resolves an EVENT-basis anchor id to its title so the generated phrase can name
// the referenced event ("after Carl's stunt"); it is optional (an unresolved
// anchor falls back to a generic phrase).
function readTimeInfo(
  value: unknown,
  anchorTitles?: Map<string, string>,
): EventTimeInfo {
  const ref = readTimeRef(value);
  const anchorTitle = ref.anchorEventId
    ? anchorTitles?.get(ref.anchorEventId) ?? null
    : null;
  return {
    basis: ref.basis,
    floor: ref.floor ?? null,
    offset: ref.offset ?? null,
    unit: ref.unit ?? null,
    anchorEventId: ref.anchorEventId ?? null,
    label: ref.label ?? null,
    phrase: phraseTimeRef(ref, { anchorTitle }),
  };
}

// Titles for every EVENT-basis anchor referenced by a fetched event set, so the
// generated phrasing can name the anchor. One extra query keeps the timeline
// queries flat; anchors outside the visible set still resolve by id.
async function loadAnchorTitles(
  campaignId: string,
  events: { inGameTime: unknown }[],
): Promise<Map<string, string>> {
  const anchorIds = new Set<string>();
  for (const event of events) {
    const ref = readTimeRef(event.inGameTime);
    if (ref.basis === "EVENT" && ref.anchorEventId) anchorIds.add(ref.anchorEventId);
  }
  if (anchorIds.size === 0) return new Map();
  const rows = await prisma.event.findMany({
    where: { campaignId, id: { in: [...anchorIds] } },
    select: { id: true, title: true },
  });
  return new Map(rows.map((row) => [row.id, row.title]));
}

// Validate an EVENT-basis anchor: it must reference a live event in this
// campaign and never the event being edited (an event can't anchor to itself).
async function assertValidTimeAnchor(
  campaignId: string,
  inGameTime: ReturnType<typeof buildTimeRef>,
  selfEventId?: string,
) {
  if (inGameTime.basis !== "EVENT" || !inGameTime.anchorEventId) return;
  if (inGameTime.anchorEventId === selfEventId) {
    throw new ServiceError("An event cannot be anchored to itself.");
  }
  const anchor = await prisma.event.findFirst({
    where: {
      id: inGameTime.anchorEventId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true },
  });
  if (!anchor) throw new ServiceError("Anchor event not found.");
}

function isPlayerVisibleEvent(
  event: {
    status: CanonStatus;
    secret: boolean;
    participants: { entity: { status: CanonStatus; visibility: Visibility } }[];
  },
  isPlayer: boolean,
) {
  if (!isPlayer) return true;
  if (event.status === CanonStatus.ARCHIVED) return false;
  if (event.secret) return false;
  return event.participants.some((p) => isPlayerVisible(p.entity));
}

/**
 * Log an event with participants. Routes through the review pipeline as an
 * auto-approved DM change set so the event carries provenance
 * (docs/03-review-pipeline.md). DM/co-DM only.
 */
export async function createEvent(
  userId: string,
  campaignId: string,
  input: CreateEventInput,
) {
  const parsed = createEventSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  // Every participant must be live canon in this campaign.
  const participantIds = Array.from(
    new Set(parsed.participants.map((participant) => participant.entityId)),
  );
  const found = await prisma.entity.findMany({
    where: { campaignId, id: { in: participantIds }, status: CanonStatus.CANON },
    select: { id: true },
  });
  if (found.length !== participantIds.length) {
    throw new ServiceError("Participant entity not found.");
  }

  const inGameTime = buildInGameTime(parsed);
  await assertValidTimeAnchor(campaignId, inGameTime);
  // No `orderKey`: order is derived server-side from the in-game-time anchor at
  // apply time, never carried in the reviewable patch (ADR 0004).
  const patch: ReviewPatch = {
    title: { to: parsed.title },
    summary: { to: nullIfEmpty(parsed.summary) },
    inGameTime: { to: inGameTime },
    secret: { to: parsed.secret },
    participants: {
      to: parsed.participants.map((participant) => ({
        entityId: participant.entityId,
        role: participant.role,
      })),
    },
  };
  if (parsed.effects && parsed.effects.length > 0) {
    // Declared unapplied effects; applyCreateEvent validates each target is a
    // crawler. The DM applies them later from the timeline (parity with edit).
    patch.effects = {
      to: parsed.effects.map((effect) => ({
        ...(effect.id ? { id: effect.id } : {}),
        kind: effect.kind,
        targetEntityId: effect.targetEntityId,
        ...(effect.stat ? { stat: effect.stat } : {}),
        ...(typeof effect.delta === "number" ? { delta: effect.delta } : {}),
        ...(typeof effect.valueNumber === "number" ? { valueNumber: effect.valueNumber } : {}),
        ...(typeof effect.value === "boolean" ? { value: effect.value } : {}),
        ...(effect.note ? { note: effect.note } : {}),
      })),
    };
  }

  const result = await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Log event",
    operations: [{ op: OpKind.CREATE_EVENT, patch }],
  });
  return { id: result.targetIds[0] };
}

/**
 * Edit an event's scalar fields (title/summary/in-game time/secret) through the
 * review pipeline as an auto-approved DM change set, so the edit carries
 * provenance and respects locks. Participant editing is a separate slice.
 * DM/co-DM only.
 */
export async function updateEvent(
  userId: string,
  campaignId: string,
  eventId: string,
  input: UpdateEventInput,
  options: { applyEffects?: boolean } = {},
) {
  const parsed = updateEventSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.event.findFirst({
    where: { id: eventId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, version: true, participants: { select: { entityId: true } } },
  });
  if (!existing) throw new ServiceError("Event not found.");

  // Every desired participant must be live canon before we route the change set.
  if (parsed.participants) {
    const participantIds = Array.from(
      new Set(parsed.participants.map((participant) => participant.entityId)),
    );
    const found = await prisma.entity.findMany({
      where: { campaignId, id: { in: participantIds }, status: CanonStatus.CANON },
      select: { id: true },
    });
    if (found.length !== participantIds.length) {
      throw new ServiceError("Participant entity not found.");
    }
  }

  const inGameTime = buildInGameTime(parsed);
  await assertValidTimeAnchor(campaignId, inGameTime, eventId);
  // No `orderKey`: order is re-derived from the anchor at apply time (ADR 0004).
  const patch: ReviewPatch = {
    _baseVersion: { to: existing.version },
    title: { to: parsed.title },
    summary: { to: nullIfEmpty(parsed.summary) },
    inGameTime: { to: inGameTime },
    secret: { to: parsed.secret },
  };
  if (parsed.participants) {
    patch.participants = {
      to: parsed.participants.map((participant) => ({
        entityId: participant.entityId,
        role: participant.role,
      })),
    };
  }
  if (parsed.effects) {
    // The desired unapplied effect set; the review service preserves any already
    // applied effects and validates these targets are crawlers.
    patch.effects = {
      to: parsed.effects.map((effect) => ({
        ...(effect.id ? { id: effect.id } : {}),
        kind: effect.kind,
        targetEntityId: effect.targetEntityId,
        ...(effect.stat ? { stat: effect.stat } : {}),
        ...(typeof effect.delta === "number" ? { delta: effect.delta } : {}),
        ...(typeof effect.valueNumber === "number" ? { valueNumber: effect.valueNumber } : {}),
        ...(typeof effect.value === "boolean" ? { value: effect.value } : {}),
        ...(effect.note ? { note: effect.note } : {}),
      })),
    };
  }

  const operations: Parameters<typeof applyAutoApprovedEventChangeSet>[2]["operations"] = [
    { op: OpKind.UPDATE_EVENT, targetId: eventId, patch },
  ];
  if (options.applyEffects && parsed.effects && parsed.effects.length > 0) {
    operations.push({ op: OpKind.APPLY_EVENT_EFFECTS, targetId: eventId, patch: {} });
  }

  await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Edit event",
    operations,
  });

  // Affected pages = entities that were participants before OR after the edit,
  // so timelines that lost the event get revalidated too.
  const oldIds = existing.participants.map((participant) => participant.entityId);
  const newIds = parsed.participants
    ? parsed.participants.map((participant) => participant.entityId)
    : oldIds;
  const effectTargetIds = parsed.effects?.map((effect) => effect.targetEntityId) ?? [];
  return {
    id: eventId,
    participantIds: Array.from(new Set([...oldIds, ...newIds, ...effectTargetIds])),
  };
}

/**
 * Events an entity participates in, newest in-game time first. Visibility-scoped
 * — players never see secret events, and co-participants they can't see are
 * dropped from each event's `others` list.
 */
export async function listEventsForEntity(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<EntityEvent[]> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return [];
  const isPlayer = membership.role === Role.PLAYER;

  const events = await prisma.event.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...(isPlayer ? { secret: false } : {}),
      participants: { some: { entityId } },
    },
    orderBy: [{ orderKey: "desc" }, { rank: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      inGameTime: true,
      orderKey: true,
      rank: true,
      secret: true,
      locked: true,
      source: true,
      effects: true,
      participants: {
        select: {
          role: true,
          entityId: true,
          entity: { select: otherEntitySelect },
        },
      },
      causedBy: {
        where: { status: { not: CanonStatus.ARCHIVED } },
        select: {
          id: true,
          cause: {
            select: {
              id: true,
              title: true,
              status: true,
              secret: true,
              participants: {
                select: {
                  entity: { select: otherEntitySelect },
                },
              },
            },
          },
        },
      },
      causes: {
        where: { status: { not: CanonStatus.ARCHIVED } },
        select: {
          id: true,
          effect: {
            select: {
              id: true,
              title: true,
              status: true,
              secret: true,
              participants: {
                select: {
                  entity: { select: otherEntitySelect },
                },
              },
            },
          },
        },
      },
    },
  });

  const anchorTitles = await loadAnchorTitles(campaignId, events);
  const timeline: EntityEvent[] = [];
  for (const event of events) {
    const selfParticipations = event.participants.filter(
      (p) => p.entityId === entityId,
    );
    const self = selfParticipations[0];
    if (!self) continue;
    const others = event.participants
      .filter((p) => p.entityId !== entityId)
      .filter((p) => !isPlayer || isPlayerVisible(p.entity))
      .map((p) => ({
        id: p.entity.id,
        name: p.entity.name,
        type: p.entity.type,
        role: p.role,
      }));

    timeline.push({
      id: event.id,
      title: event.title,
      summary: event.summary,
      time: readTimeInfo(event.inGameTime, anchorTitles),
      orderKey: event.orderKey,
      rank: event.rank,
      secret: event.secret,
      locked: event.locked,
      source: event.source,
      role: self.role,
      selfRoles: selfParticipations.map((p) => p.role),
      others,
      effects: projectEventEffects(event.effects, isPlayer),
      causedBy: event.causedBy
        .filter((edge) => isPlayerVisibleEvent(edge.cause, isPlayer))
        .map((edge) => ({
          id: edge.cause.id,
          title: edge.cause.title,
          linkId: edge.id,
        })),
      causes: event.causes
        .filter((edge) => isPlayerVisibleEvent(edge.effect, isPlayer))
        .map((edge) => ({
          id: edge.effect.id,
          title: edge.effect.title,
          linkId: edge.id,
        })),
    });
  }
  return timeline;
}

/**
 * Campaign-wide event timeline for the dedicated M3 timeline page. Players get
 * the same visibility projection as entity timelines: secret events are hidden,
 * invisible co-participants are dropped, and a public event with no visible
 * participants is omitted rather than leaking orphaned canon.
 */
export async function listCampaignTimeline(
  userId: string,
  campaignId: string,
): Promise<CampaignTimelineEvent[]> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return [];
  const isPlayer = membership.role === Role.PLAYER;

  const events = await prisma.event.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...(isPlayer ? { secret: false } : {}),
    },
    orderBy: [{ orderKey: "desc" }, { rank: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      inGameTime: true,
      orderKey: true,
      rank: true,
      secret: true,
      locked: true,
      source: true,
      effects: true,
      participants: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          entity: { select: otherEntitySelect },
        },
      },
      causedBy: {
        where: { status: { not: CanonStatus.ARCHIVED } },
        select: {
          id: true,
          cause: {
            select: {
              id: true,
              title: true,
              status: true,
              secret: true,
              participants: {
                select: {
                  entity: { select: otherEntitySelect },
                },
              },
            },
          },
        },
      },
      causes: {
        where: { status: { not: CanonStatus.ARCHIVED } },
        select: {
          id: true,
          effect: {
            select: {
              id: true,
              title: true,
              status: true,
              secret: true,
              participants: {
                select: {
                  entity: { select: otherEntitySelect },
                },
              },
            },
          },
        },
      },
    },
  });

  const anchorTitles = await loadAnchorTitles(campaignId, events);
  const timeline: CampaignTimelineEvent[] = [];
  for (const event of events) {
    const participants = event.participants
      .filter((participant) => !isPlayer || isPlayerVisible(participant.entity))
      .map((participant) => ({
        id: participant.entity.id,
        name: participant.entity.name,
        type: participant.entity.type,
        role: participant.role,
      }));
    if (isPlayer && participants.length === 0) continue;

    timeline.push({
      id: event.id,
      title: event.title,
      summary: event.summary,
      time: readTimeInfo(event.inGameTime, anchorTitles),
      orderKey: event.orderKey,
      rank: event.rank,
      secret: event.secret,
      locked: event.locked,
      source: event.source,
      participants,
      effects: projectEventEffects(event.effects, isPlayer),
      causedBy: event.causedBy
        .filter((edge) => isPlayerVisibleEvent(edge.cause, isPlayer))
        .map((edge) => ({
          id: edge.cause.id,
          title: edge.cause.title,
          linkId: edge.id,
        })),
      causes: event.causes
        .filter((edge) => isPlayerVisibleEvent(edge.effect, isPlayer))
        .map((edge) => ({
          id: edge.effect.id,
          title: edge.effect.title,
          linkId: edge.id,
        })),
    });
  }

  return timeline;
}

// ── Floor metadata for the timeline's descent rail (docs/adr/0005) ──
// FLOOR-type entities carry their floor number + theme in Entity.data; an
// event's floor is its `orderKey` (ADR 0004). This stitches the two together so
// the timeline can band events under named floor headers and ladder the dungeon.

export type FloorDescriptor = {
  number: number;
  name: string | null;
  theme: string | null;
  entityId: string | null;
  // Absolute days-since-collapse the floor opened / collapses (docs/adr/0008).
  // Anchors that let FLOOR_START / FLOOR_COLLAPSE event times resolve to
  // absolute days, and bound the floor's inferred day-range.
  startDay: number | null;
  collapseDay: number | null;
};

export type LadderFloor = {
  number: number;
  name: string | null;
  count: number;
  current: boolean;
  reached: boolean;
  logged: boolean;
  entityId: string | null;
};

export type CampaignFloorMeta = {
  ladder: LadderFloor[];
  // Floor number → descriptor, for floors that have a FLOOR entity (visible).
  byNumber: Record<number, FloorDescriptor>;
  currentFloorNumber: number | null;
  currentFloorId: string | null;
  // Newest event on the current floor — drives the NOW marker / live ring.
  liveEventId: string | null;
  // FLOOR entities (visible to the viewer) for the current-floor picker.
  floorEntities: { id: string; name: string; floorNumber: number | null }[];
};

function readFloorData(value: unknown): {
  floorNumber: number | null;
  theme: string | null;
  startDay: number | null;
  collapseDay: number | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { floorNumber: null, theme: null, startDay: null, collapseDay: null };
  }
  const record = value as Record<string, unknown>;
  return {
    floorNumber: typeof record.floorNumber === "number" ? record.floorNumber : null,
    theme: typeof record.theme === "string" && record.theme.length > 0 ? record.theme : null,
    startDay: typeof record.startDay === "number" ? record.startDay : null,
    collapseDay: typeof record.collapseDay === "number" ? record.collapseDay : null,
  };
}

/**
 * Floor metadata for the campaign timeline: the dungeon ladder (1 → deepest
 * known), named/themed floor descriptors resolved from FLOOR entities, the
 * current ("ON AIR") floor, and the live event. Visibility-scoped — players
 * never see secret events or DM-only FLOOR entities, so their ladder counts and
 * floor names reflect only what they can see.
 */
export async function listCampaignFloors(
  userId: string,
  campaignId: string,
): Promise<CampaignFloorMeta> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) {
    return {
      ladder: [],
      byNumber: {},
      currentFloorNumber: null,
      currentFloorId: null,
      liveEventId: null,
      floorEntities: [],
    };
  }
  const isPlayer = membership.role === Role.PLAYER;

  // For DMs we can use a fast groupBy; for players we need to apply the same
  // participant-visibility projection as listCampaignTimeline so the sidebar
  // counts don't include events the player can't actually see.
  const eventCountQuery = isPlayer
    ? prisma.event.findMany({
        where: {
          campaignId,
          status: { not: CanonStatus.ARCHIVED },
          secret: false,
        },
        select: {
          id: true,
          orderKey: true,
          rank: true,
          createdAt: true,
          participants: {
            select: { entity: { select: otherEntitySelect } },
          },
        },
      })
    : prisma.event.groupBy({
        by: ["orderKey"],
        where: {
          campaignId,
          status: { not: CanonStatus.ARCHIVED },
        },
        _count: { _all: true },
      });

  const [campaign, floorRows, eventCountResult] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentFloorId: true },
    }),
    prisma.entity.findMany({
      where: {
        campaignId,
        type: EntityType.FLOOR,
        status: { not: CanonStatus.ARCHIVED },
        ...(isPlayer
          ? {
              visibility: {
                in: [Visibility.SHARED_WITH_PLAYERS, Visibility.PLAYER_FACING],
              },
            }
          : {}),
      },
      select: { id: true, name: true, data: true },
    }),
    eventCountQuery,
  ]);

  // Floor number → descriptor + the picker list. A FLOOR entity without a
  // floorNumber still appears in the picker (so the DM can assign one) but can't
  // band any events yet.
  const byNumber: Record<number, FloorDescriptor> = {};
  const floorEntities: CampaignFloorMeta["floorEntities"] = [];
  for (const row of floorRows) {
    const { floorNumber, theme, startDay, collapseDay } = readFloorData(row.data);
    floorEntities.push({ id: row.id, name: row.name, floorNumber });
    if (floorNumber != null && byNumber[floorNumber] === undefined) {
      byNumber[floorNumber] = {
        number: floorNumber,
        name: row.name,
        theme,
        entityId: row.id,
        startDay,
        collapseDay,
      };
    }
  }
  floorEntities.sort((a, b) => (a.floorNumber ?? Infinity) - (b.floorNumber ?? Infinity));

  const countByFloor = new Map<number, number>();
  let maxEventFloor = 0;

  if (isPlayer) {
    // Apply participant-visibility projection: skip events where all
    // participants are invisible to the player (same rule as listCampaignTimeline).
    for (const event of eventCountResult as Array<{
      orderKey: number;
      participants: Array<{ entity: { status: CanonStatus; visibility: Visibility } }>;
    }>) {
      const hasVisibleParticipant = event.participants.some((p) =>
        isPlayerVisible(p.entity),
      );
      if (!hasVisibleParticipant) continue;
      countByFloor.set(event.orderKey, (countByFloor.get(event.orderKey) ?? 0) + 1);
      if (event.orderKey > maxEventFloor) maxEventFloor = event.orderKey;
    }
  } else {
    for (const group of eventCountResult as Array<{
      orderKey: number;
      _count: { _all: number };
    }>) {
      countByFloor.set(group.orderKey, group._count._all);
      if (group.orderKey > maxEventFloor) maxEventFloor = group.orderKey;
    }
  }

  const rawCurrentFloorId = campaign?.currentFloorId ?? null;
  // For players, only expose the current-floor id if the referenced FLOOR entity
  // survived the visibility filter — otherwise we'd leak a DM-only entity id.
  const currentFloorId =
    isPlayer && rawCurrentFloorId != null
      ? floorEntities.some((f) => f.id === rawCurrentFloorId)
        ? rawCurrentFloorId
        : null
      : rawCurrentFloorId;
  const currentFloorNumber =
    currentFloorId != null
      ? floorEntities.find((floor) => floor.id === currentFloorId)?.floorNumber ?? null
      : null;

  const maxFloorNumber = floorEntities.reduce(
    (max, floor) => Math.max(max, floor.floorNumber ?? 0),
    0,
  );
  const ladderMax = Math.max(
    1,
    maxFloorNumber,
    maxEventFloor,
    currentFloorNumber ?? 0,
  );
  // Without an explicit current floor, "reached" falls back to the deepest floor
  // that actually has events, so the ladder still reads as a descent.
  const reachedThrough = currentFloorNumber ?? maxEventFloor;

  const ladder: LadderFloor[] = [];
  for (let number = 1; number <= ladderMax; number += 1) {
    const descriptor = byNumber[number];
    const count = countByFloor.get(number) ?? 0;
    ladder.push({
      number,
      name: descriptor?.name ?? null,
      count,
      current: currentFloorNumber === number,
      reached: number <= reachedThrough,
      logged: count > 0,
      entityId: descriptor?.entityId ?? null,
    });
  }

  let liveEventId: string | null = null;
  if (currentFloorNumber != null && (countByFloor.get(currentFloorNumber) ?? 0) > 0) {
    if (isPlayer) {
      const visibleEvents = eventCountResult as Array<{
        id: string;
        orderKey: number;
        rank: string;
        createdAt: Date;
        participants: Array<{ entity: { status: CanonStatus; visibility: Visibility } }>;
      }>;
      const live = visibleEvents
        .filter(
          (event) =>
            event.orderKey === currentFloorNumber &&
            event.participants.some((p) => isPlayerVisible(p.entity)),
        )
        .sort(
          (a, b) =>
            // Bytewise rank order (descending), matching the DM branch's
            // `orderBy: { rank: "desc" }` (the column is TEXT COLLATE "C").
            // localeCompare would disagree across the upper/lowercase boundary.
            (a.rank < b.rank ? 1 : a.rank > b.rank ? -1 : 0) ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )[0];
      liveEventId = live?.id ?? null;
    } else {
      const live = await prisma.event.findFirst({
        where: {
          campaignId,
          orderKey: currentFloorNumber,
          status: { not: CanonStatus.ARCHIVED },
        },
        orderBy: [{ rank: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
      liveEventId = live?.id ?? null;
    }
  }

  return {
    ladder,
    byNumber,
    currentFloorNumber,
    currentFloorId,
    liveEventId,
    floorEntities,
  };
}

/**
 * Place or release a canon lock on an event. Locking is audited and does not
 * bump `version`; it protects the event from later archived/edit operations.
 */
export async function setEventLock(
  userId: string,
  campaignId: string,
  eventId: string,
  locked: boolean,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: {
        id: eventId,
        campaignId,
        status: { not: CanonStatus.ARCHIVED },
      },
      select: {
        id: true,
        locked: true,
        participants: { select: { entityId: true } },
      },
    });
    if (!event) throw new ServiceError("Event not found.");

    if (event.locked === locked) {
      return {
        id: event.id,
        locked: event.locked,
        participantIds: event.participants.map((participant) => participant.entityId),
      };
    }

    const updated = await tx.event.update({
      where: { id: eventId },
      data: { locked },
      select: {
        id: true,
        locked: true,
        participants: { select: { entityId: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: locked ? "LOCK" : "UNLOCK",
        targetType: "EVENT",
        targetId: eventId,
        detail: {
          locked: updated.locked,
          previousLocked: event.locked,
        },
      },
    });

    return {
      id: updated.id,
      locked: updated.locked,
      participantIds: updated.participants.map((participant) => participant.entityId),
    };
  });
}

/**
 * Reorder an event within its floor by dropping it between two neighbours.
 * Order is mechanical, not canon (ADR 0004), so this updates the fractional
 * `rank` directly — audited, version-untouched, bypassing the review pipeline,
 * the same shape as `setEventLock`. Intra-floor only: each neighbour must share
 * the moved event's floor (`orderKey`); a cross-floor move is rejected. Pass the
 * ids of the events shown immediately above/below the drop slot (the displayed
 * order is rank-descending, so `above` has the higher rank); pass `null` for an
 * end of the list. Returns the participant ids whose timelines need
 * revalidation. DM/co-DM only.
 */
export async function reorderEvent(
  userId: string,
  campaignId: string,
  eventId: string,
  neighbors: { aboveId?: string | null; belowId?: string | null },
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: eventId, campaignId, status: { not: CanonStatus.ARCHIVED } },
      select: {
        id: true,
        orderKey: true,
        rank: true,
        participants: { select: { entityId: true } },
      },
    });
    if (!event) throw new ServiceError("Event not found.");

    const loadNeighborRank = async (
      neighborId: string | null | undefined,
    ): Promise<string | null> => {
      if (!neighborId) return null;
      if (neighborId === eventId) {
        throw new ServiceError("An event cannot be reordered next to itself.");
      }
      const neighbor = await tx.event.findFirst({
        where: { id: neighborId, campaignId, status: { not: CanonStatus.ARCHIVED } },
        select: { rank: true, orderKey: true },
      });
      if (!neighbor) throw new ServiceError("Neighbouring event not found.");
      if (neighbor.orderKey !== event.orderKey) {
        throw new ServiceError("Events can only be reordered within their floor.");
      }
      return neighbor.rank;
    };

    // Displayed rank-descending: the event above the slot has the higher rank
    // and the event below the lower one, so the new rank slots between them.
    const aboveRank = await loadNeighborRank(neighbors.aboveId);
    const belowRank = await loadNeighborRank(neighbors.belowId);

    let nextRank: string;
    try {
      nextRank = generateRankBetween(belowRank, aboveRank);
    } catch {
      throw new ServiceError("Could not place the event between those neighbours.");
    }

    const participantIds = event.participants.map((participant) => participant.entityId);
    if (nextRank === event.rank) {
      return { id: event.id, participantIds };
    }

    await tx.event.update({ where: { id: eventId }, data: { rank: nextRank } });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "REORDER",
        targetType: "EVENT",
        targetId: eventId,
        detail: {
          rank: nextRank,
          previousRank: event.rank,
          orderKey: event.orderKey,
        },
      },
    });

    return { id: event.id, participantIds };
  });
}

/**
 * Reorder every floor's *movable* events so causes sort before their effects,
 * using the `EventCausality` DAG (ADR 0004 slice 3 — "order from causality").
 * This is the bulk, one-click counterpart to a manual drag: a mechanical, audited
 * `rank` rewrite that bypasses the review pipeline (order is not canon, ADR 0004).
 * Pinned events — locked, or with a system-derived intra-floor order — are never
 * moved; floors with an unsatisfiable causal constraint (a contradiction between
 * pinned events, or a cycle) are left for the inline warning to flag. Returns the
 * moved event ids and the participant ids whose timelines need revalidation; an
 * empty `updatedIds` means the timeline was already causally ordered. DM/co-DM only.
 */
export async function orderEventsFromCausality(
  userId: string,
  campaignId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const events = await prisma.event.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: {
      id: true,
      orderKey: true,
      rank: true,
      locked: true,
      inGameTime: true,
      participants: { select: { entityId: true } },
      causes: {
        where: { status: { not: CanonStatus.ARCHIVED } },
        select: { effectId: true },
      },
    },
  });

  const orderable = events.map((event) => ({
    id: event.id,
    orderKey: event.orderKey,
    rank: event.rank,
    // Movable = the DM can drag it: unlocked and not system-derived order.
    movable: !event.locked && floorRelativeSortKey(readTimeRef(event.inGameTime)) === null,
    causes: event.causes.map((edge) => ({ id: edge.effectId })),
  }));

  const updates = orderFromCausality(orderable);
  if (updates.length === 0) {
    return { updatedIds: [] as string[], affectedEntityIds: [] as string[] };
  }

  const participantsById = new Map(
    events.map((event) => [event.id, event.participants.map((p) => p.entityId)] as const),
  );
  const rankById = new Map(events.map((event) => [event.id, event.rank] as const));

  const affectedEntityIds = new Set<string>();
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.event.update({ where: { id: update.id }, data: { rank: update.rank } });
      await tx.auditLog.create({
        data: {
          campaignId,
          actorUserId: userId,
          action: "REORDER",
          targetType: "EVENT",
          targetId: update.id,
          detail: {
            rank: update.rank,
            previousRank: rankById.get(update.id) ?? null,
            reason: "CAUSALITY",
          },
        },
      });
      for (const entityId of participantsById.get(update.id) ?? []) {
        affectedEntityIds.add(entityId);
      }
    }
  });

  return {
    updatedIds: updates.map((update) => update.id),
    affectedEntityIds: Array.from(affectedEntityIds),
  };
}

function markEffectsPendingReview(
  value: unknown,
  effectIds: Set<string>,
  changeSetId: string,
  operationId: string,
): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item as Prisma.InputJsonValue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !effectIds.has(record.id)) {
      return record as Prisma.InputJsonValue;
    }
    return {
      ...record,
      pendingChangeSetId: changeSetId,
      pendingOperationId: operationId,
      reviewStatus: "PENDING",
    } as Prisma.InputJsonValue;
  });
}

/**
 * Submit an event's declared effects to the Review Queue. The entity mutations
 * are not applied here; approving the resulting APPLY_EVENT_EFFECTS operation
 * applies them atomically through the lock-aware review pipeline. Returns the
 * entity ids whose pages may need to show pending review state. DM-only.
 */
export async function applyEventEffects(
  userId: string,
  campaignId: string,
  eventId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.event.findFirst({
    where: { id: eventId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: {
      id: true,
      effects: true,
      participants: { select: { entityId: true } },
    },
  });
  if (!existing) throw new ServiceError("Event not found.");

  const effects = reviewableEffectRecords(existing.effects);
  if (effects.length === 0) {
    throw new ServiceError("This event has no effects left to apply.");
  }
  const targetIds = Array.from(
    new Set(
      effects
        .map((effect) => effect.targetEntityId)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const changeSet = await createPendingEventChangeSet(userId, campaignId, {
    title: "Apply event effects",
    operations: [
      {
        op: OpKind.APPLY_EVENT_EFFECTS,
        targetId: eventId,
        patch: { effects: { to: effects as ReviewPatch[string]["to"] } },
      },
    ],
  });
  const operationId = changeSet.operations[0]?.id;
  if (!operationId) throw new ServiceError("Could not create effect review operation.");
  const effectIds = new Set(
    effects
      .map((effect) => effect.id)
      .filter((id): id is string => typeof id === "string"),
  );
  await prisma.event.update({
    where: { id: eventId },
    data: {
      effects: markEffectsPendingReview(
        existing.effects,
        effectIds,
        changeSet.id,
        operationId,
      ),
    },
    select: { id: true },
  });

  const participantIds = existing.participants.map((p) => p.entityId);
  return {
    id: eventId,
    changeSetId: changeSet.id,
    operationId,
    affectedEntityIds: Array.from(new Set([...participantIds, ...targetIds])),
  };
}

export async function linkEventCause(
  userId: string,
  campaignId: string,
  input: {
    causeId: string;
    effectId: string;
    weight?: number | null;
    note?: string | null;
  },
) {
  await assertCampaignDm(userId, campaignId);
  const patch: ReviewPatch = {
    causeId: { to: input.causeId },
    effectId: { to: input.effectId },
  };
  if (typeof input.weight === "number") {
    patch.weight = { to: input.weight };
  }
  const note = input.note?.trim();
  if (note) {
    patch.note = { to: note };
  }

  const result = await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Link event causality",
    operations: [{ op: OpKind.CREATE_EVENT_CAUSALITY, patch }],
  });
  return { id: result.targetIds[0] };
}

export async function archiveEventCausality(
  userId: string,
  campaignId: string,
  eventCausalityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.eventCausality.findFirst({
    where: {
      id: eventCausalityId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, causeId: true, effectId: true },
  });
  if (!existing) throw new ServiceError("Causality link not found.");

  await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Remove event causality",
    operations: [
      {
        op: OpKind.DELETE_EVENT_CAUSALITY,
        targetId: eventCausalityId,
        patch: { status: { from: CanonStatus.CANON, to: CanonStatus.ARCHIVED } },
      },
    ],
  });

  return {
    id: eventCausalityId,
    affectedEventIds: [existing.causeId, existing.effectId],
  };
}

export async function restoreEventCausality(
  userId: string,
  campaignId: string,
  eventCausalityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.eventCausality.findFirst({
    where: {
      id: eventCausalityId,
      campaignId,
      status: CanonStatus.ARCHIVED,
    },
    select: { id: true, causeId: true, effectId: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Archived causality link not found.");

  await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Restore event causality",
    operations: [
      {
        op: OpKind.DELETE_EVENT_CAUSALITY,
        targetId: eventCausalityId,
        patch: {
          _baseVersion: { to: existing.version },
          status: { from: existing.status, to: CanonStatus.CANON },
        },
      },
    ],
  });

  return {
    id: eventCausalityId,
    affectedEventIds: [existing.causeId, existing.effectId],
  };
}

/**
 * Soft-archive an event (retains history + causal links) through the review
 * pipeline. DM-only.
 */
export async function archiveEvent(
  userId: string,
  campaignId: string,
  eventId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.event.findFirst({
    where: { id: eventId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, status: true, participants: { select: { entityId: true } } },
  });
  if (!existing) throw new ServiceError("Event not found.");

  await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Remove event",
    operations: [
      {
        op: OpKind.UPDATE_EVENT,
        targetId: eventId,
        patch: { status: { from: existing.status, to: CanonStatus.ARCHIVED } },
      },
    ],
  });
  return {
    id: eventId,
    participantIds: existing.participants.map((participant) => participant.entityId),
  };
}

export async function restoreEvent(
  userId: string,
  campaignId: string,
  eventId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.event.findFirst({
    where: { id: eventId, campaignId, status: CanonStatus.ARCHIVED },
    select: {
      id: true,
      status: true,
      version: true,
      participants: { select: { entityId: true } },
    },
  });
  if (!existing) throw new ServiceError("Archived event not found.");

  await applyAutoApprovedEventChangeSet(userId, campaignId, {
    title: "Restore event",
    operations: [
      {
        op: OpKind.UPDATE_EVENT,
        targetId: eventId,
        patch: {
          _baseVersion: { to: existing.version },
          status: { from: existing.status, to: CanonStatus.CANON },
        },
      },
    ],
  });
  return {
    id: eventId,
    participantIds: existing.participants.map((participant) => participant.entityId),
  };
}
