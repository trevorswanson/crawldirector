import {
  CanonStatus,
  ChangeSource,
  EventParticipantRole,
  OpKind,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { createEventSchema, type CreateEventInput } from "@/lib/validation";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedEventChangeSet,
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

export type EntityEvent = {
  id: string;
  title: string;
  summary: string | null;
  time: EventTimeInfo;
  orderKey: number;
  secret: boolean;
  source: ChangeSource;
  // The viewed entity's role in this event.
  role: EventParticipantRole;
  // Other participants (the viewed entity excluded), visibility-scoped.
  others: { id: string; name: string; type: string; role: EventParticipantRole }[];
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
function buildInGameTime(input: CreateEventInput) {
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
      source: true,
      participants: {
        select: {
          role: true,
          entityId: true,
          entity: { select: otherEntitySelect },
        },
      },
    },
  });

  const timeline: EntityEvent[] = [];
  for (const event of events) {
    const self = event.participants.find((p) => p.entityId === entityId);
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
      source: event.source,
      role: self.role,
      others,
    });
  }
  return timeline;
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
    select: { id: true, status: true },
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
  return { id: eventId };
}
