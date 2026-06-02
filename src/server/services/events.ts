import {
  CanonStatus,
  ChangeSource,
  EventParticipantRole,
  OpKind,
  Prisma,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
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

export type EventTimeInfo = { floor: number | null; label: string | null };

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

// Build the flexible in-game time JSON ({ floor?, label? }) the Event stores,
// plus the integer order key the timeline sorts by (DCC time is irregular, so
// floor is the natural coarse ordering — see docs/01-domain-model.md).
function buildInGameTime(input: { floor?: number; timeLabel?: string }) {
  const time: { floor?: number; label?: string } = {};
  if (typeof input.floor === "number") time.floor = input.floor;
  const label = nullIfEmpty(input.timeLabel);
  if (label) time.label = label;
  return time;
}

function readTimeInfo(value: unknown): EventTimeInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { floor: null, label: null };
  }
  const record = value as Record<string, unknown>;
  return {
    floor: typeof record.floor === "number" ? record.floor : null,
    label: typeof record.label === "string" ? record.label : null,
  };
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
  const patch: ReviewPatch = {
    title: { to: parsed.title },
    summary: { to: nullIfEmpty(parsed.summary) },
    inGameTime: { to: inGameTime },
    orderKey: { to: typeof parsed.floor === "number" ? parsed.floor : 0 },
    secret: { to: parsed.secret },
    participants: {
      to: parsed.participants.map((participant) => ({
        entityId: participant.entityId,
        role: participant.role,
      })),
    },
  };

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
  const patch: ReviewPatch = {
    _baseVersion: { to: existing.version },
    title: { to: parsed.title },
    summary: { to: nullIfEmpty(parsed.summary) },
    inGameTime: { to: inGameTime },
    orderKey: { to: typeof parsed.floor === "number" ? parsed.floor : 0 },
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
    orderBy: [{ orderKey: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      inGameTime: true,
      orderKey: true,
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
      time: readTimeInfo(event.inGameTime),
      orderKey: event.orderKey,
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
    orderBy: [{ orderKey: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      inGameTime: true,
      orderKey: true,
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
      time: readTimeInfo(event.inGameTime),
      orderKey: event.orderKey,
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
