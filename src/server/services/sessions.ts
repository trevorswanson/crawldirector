import { CanonStatus, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { describeProviderError, resolveCampaignProvider } from "@/server/ai";
import { ProviderError, type LLMUsage } from "@/server/ai/types";
import {
  SESSION_RECAP_GENERATOR,
  SESSION_RECAP_MAX_TOKENS,
  buildSessionRecapPrompt,
  type SessionRecapLogEntry,
  type SessionRecapPromotedEvent,
} from "@/server/ai/generators/session-recap";
import { logActionError } from "@/server/log";
import { assertWithinSpendCap, recordAiUsage } from "@/server/services/ai-usage";
import { createEvent } from "@/server/services/events";

// Live session capture (M8 slice 1 — docs/08-session-mode.md). A `GameSession`
// (renamed from docs' `Session` to avoid colliding with NextAuth's own Session
// model) is the DM's play-session log: title, date, floor/area focus, prep
// notes, and a running `SessionLogEntry` capture log. Both are scratch, not
// canon — created by a direct DM mutation, not the review pipeline (invariant
// #1 is about canon writes; this isn't one), mirroring knowledge.ts.
//
// Promoting a log entry to a canonical Event (M8 slice 2) *does* route through
// the review pipeline — via `createEvent`'s existing auto-approved DM change
// set — so the promoted Event carries full provenance even though the log
// entry it came from doesn't.

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

export type SessionSummary = {
  id: string;
  title: string;
  playedAt: Date | null;
  focus: string | null;
  entryCount: number;
  createdAt: Date;
};

export type SessionTaggedEntity = { id: string; name: string; type: string };

export type SessionLogEntryView = {
  id: string;
  at: Date;
  text: string;
  taggedEntities: SessionTaggedEntity[];
  promotedEventId: string | null;
};

export type SessionDetail = {
  id: string;
  title: string;
  playedAt: Date | null;
  focus: string | null;
  notes: string | null;
  createdAt: Date;
  entries: SessionLogEntryView[];
};

// Newest-played-first (unset-date sessions last), DM-only.
export async function listSessions(
  userId: string,
  campaignId: string,
  take: number | null = null,
): Promise<SessionSummary[]> {
  await assertCampaignDm(userId, campaignId);

  const sessions = await prisma.gameSession.findMany({
    where: { campaignId },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    ...(take == null ? {} : { take }),
    select: {
      id: true,
      title: true,
      playedAt: true,
      focus: true,
      createdAt: true,
      _count: { select: { entries: true } },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    playedAt: session.playedAt,
    focus: session.focus,
    createdAt: session.createdAt,
    entryCount: session._count.entries,
  }));
}

export async function createSession(
  userId: string,
  campaignId: string,
  input: { title: string; playedAt?: string; focus?: string; notes?: string },
): Promise<{ id: string }> {
  await assertCampaignDm(userId, campaignId);

  const title = input.title.trim();
  if (!title) throw new ServiceError("Session title is required.");

  return prisma.gameSession.create({
    data: {
      campaignId,
      title,
      playedAt: input.playedAt ? new Date(input.playedAt) : null,
      focus: input.focus?.trim() || null,
      notes: input.notes?.trim() || null,
    },
    select: { id: true },
  });
}

// Resolve each entry's `taggedIds` to live entity refs in one bulk lookup
// (archived/deleted tags are dropped rather than shown as broken links).
async function resolveTaggedEntities(
  campaignId: string,
  entries: { taggedIds: string[] }[],
): Promise<Map<string, SessionTaggedEntity>> {
  const ids = [...new Set(entries.flatMap((entry) => entry.taggedIds))];
  if (ids.length === 0) return new Map();
  const entities = await prisma.entity.findMany({
    where: { id: { in: ids }, campaignId },
    select: { id: true, name: true, type: true },
  });
  return new Map(entities.map((entity) => [entity.id, entity] as const));
}

export async function getSession(
  userId: string,
  campaignId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  await assertCampaignDm(userId, campaignId);

  const session = await prisma.gameSession.findFirst({
    where: { id: sessionId, campaignId },
    select: {
      id: true,
      title: true,
      playedAt: true,
      focus: true,
      notes: true,
      createdAt: true,
      entries: {
        orderBy: { at: "asc" },
        select: { id: true, at: true, text: true, taggedIds: true, promotedEventId: true },
      },
    },
  });
  if (!session) return null;

  const byId = await resolveTaggedEntities(campaignId, session.entries);

  return {
    id: session.id,
    title: session.title,
    playedAt: session.playedAt,
    focus: session.focus,
    notes: session.notes,
    createdAt: session.createdAt,
    entries: session.entries.map((entry) => ({
      id: entry.id,
      at: entry.at,
      text: entry.text,
      promotedEventId: entry.promotedEventId,
      taggedEntities: entry.taggedIds
        .map((id) => byId.get(id))
        .filter((entity): entity is SessionTaggedEntity => Boolean(entity)),
    })),
  };
}

export async function addSessionLogEntry(
  userId: string,
  campaignId: string,
  sessionId: string,
  input: { text: string; taggedIds?: string[] },
): Promise<{ id: string }> {
  await assertCampaignDm(userId, campaignId);

  const text = input.text.trim();
  if (!text) throw new ServiceError("Log entry text is required.");

  const session = await prisma.gameSession.findFirst({
    where: { id: sessionId, campaignId },
    select: { id: true },
  });
  if (!session) throw new ServiceError("Session not found.");

  const requestedIds = [...new Set((input.taggedIds ?? []).map((id) => id.trim()).filter(Boolean))];
  let taggedIds: string[] = [];
  if (requestedIds.length > 0) {
    const entities = await prisma.entity.findMany({
      where: { id: { in: requestedIds }, campaignId },
      select: { id: true },
    });
    taggedIds = entities.map((entity) => entity.id);
  }

  return prisma.sessionLogEntry.create({
    data: { sessionId, text, taggedIds },
    select: { id: true },
  });
}

/**
 * Promote a log entry to a canonical Event through the normal review pipeline
 * (docs/08: "source: DM, auto-approved but fully provenanced"). The DM
 * supplies only a title; the entry's own text becomes the event's summary and
 * its still-live tagged entities become ACTOR participants, so the low-
 * friction capture flow stays low-friction on the way to canon too. Causal
 * links and effects aren't set here — the DM adds those afterward from the
 * Timeline like any other event. An already-promoted entry can't be promoted
 * again (`promotedEventId` is a one-way pointer).
 */
export async function promoteSessionLogEntryToEvent(
  userId: string,
  campaignId: string,
  sessionId: string,
  entryId: string,
  input: { title: string },
): Promise<{ id: string }> {
  await assertCampaignDm(userId, campaignId);

  const title = input.title.trim();
  if (!title) throw new ServiceError("Event title is required.");

  const entry = await prisma.sessionLogEntry.findFirst({
    where: { id: entryId, sessionId, session: { campaignId } },
    select: { id: true, text: true, taggedIds: true, promotedEventId: true },
  });
  if (!entry) throw new ServiceError("Log entry not found.");
  if (entry.promotedEventId) {
    throw new ServiceError("This entry has already been promoted to an event.");
  }

  let participants: { entityId: string; role: "ACTOR" }[] = [];
  if (entry.taggedIds.length > 0) {
    const live = await prisma.entity.findMany({
      where: { id: { in: entry.taggedIds }, campaignId, status: CanonStatus.CANON },
      select: { id: true },
    });
    participants = live.map((live) => ({ entityId: live.id, role: "ACTOR" as const }));
  }

  const event = await createEvent(userId, campaignId, {
    title,
    summary: entry.text,
    secret: false,
    participants,
  });

  await prisma.sessionLogEntry.update({
    where: { id: entryId },
    data: { promotedEventId: event.id },
  });

  return { id: event.id };
}

export type SessionRecapResult = {
  recap: string;
  model: string;
  providerId: string;
};

/**
 * Generate a "previously on Dungeon Crawler World" recap for one session, from
 * its raw log entries plus the events it promoted to canon
 * (docs/08-session-mode.md "Session recap"). Read-only synthesis, like "Ask"
 * (`ask.ts`) — never writes canon (invariant #1) and is never persisted; the DM
 * regenerates on demand. Persona voice, per-crawler spotlights, and publishing
 * a recap as a player-facing SYSTEM_MESSAGE stay later M8 slices. DM-only.
 * Throws a `ServiceError` (safe message — invariant #6) for a non-DM caller, an
 * unknown session, an empty session, no configured provider, a reached spend
 * cap, or a provider failure.
 */
export async function generateSessionRecap(
  userId: string,
  campaignId: string,
  sessionId: string,
): Promise<SessionRecapResult> {
  await assertCampaignDm(userId, campaignId);

  const [campaign, session] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true, styleGuide: true },
    }),
    prisma.gameSession.findFirst({
      where: { id: sessionId, campaignId },
      select: {
        title: true,
        playedAt: true,
        focus: true,
        entries: {
          orderBy: { at: "asc" },
          select: { text: true, taggedIds: true, promotedEventId: true },
        },
      },
    }),
  ]);
  if (!campaign) throw new ServiceError("Campaign not found.");
  if (!session) throw new ServiceError("Session not found.");
  if (session.entries.length === 0) {
    throw new ServiceError("Add a log entry before generating a recap.");
  }

  const byId = await resolveTaggedEntities(campaignId, session.entries);
  const entries: SessionRecapLogEntry[] = session.entries.map((entry) => ({
    text: entry.text,
    taggedNames: entry.taggedIds
      .map((id) => byId.get(id)?.name)
      .filter((name): name is string => Boolean(name)),
  }));

  const promotedEventIds = session.entries
    .map((entry) => entry.promotedEventId)
    .filter((id): id is string => Boolean(id));
  const eventRows =
    promotedEventIds.length === 0
      ? []
      : await prisma.event.findMany({
          where: { id: { in: promotedEventIds }, campaignId, status: CanonStatus.CANON },
          select: {
            title: true,
            summary: true,
            participants: { select: { entity: { select: { name: true } } } },
          },
        });
  const promotedEvents: SessionRecapPromotedEvent[] = eventRows.map((event) => ({
    title: event.title,
    summary: event.summary,
    participantNames: event.participants.map((p) => p.entity.name),
  }));

  const provider = await resolveCampaignProvider(campaignId);
  if (!provider) {
    throw new ServiceError("Add an AI provider key in Settings to generate a session recap.");
  }

  await assertWithinSpendCap(campaignId);

  const { system, messages } = buildSessionRecapPrompt({
    campaignName: campaign.name,
    styleGuide: campaign.styleGuide,
    sessionTitle: session.title,
    playedAt: session.playedAt ? session.playedAt.toISOString().slice(0, 10) : null,
    focus: session.focus,
    entries,
    promotedEvents,
  });

  let recap: string;
  let usage: LLMUsage;
  let usageModel: string;
  let usageProviderId: string;
  try {
    const result = await provider.generate({
      system,
      messages,
      maxTokens: SESSION_RECAP_MAX_TOKENS,
    });
    recap = result.text.trim();
    usage = result.usage;
    usageModel = result.model;
    usageProviderId = result.providerId;
  } catch (error) {
    logActionError(
      `Session-recap generation failed (provider=${provider.id})`,
      error,
      provider.redactSecrets,
    );
    const message = error instanceof ProviderError ? error.message : describeProviderError(error);
    throw new ServiceError(message);
  }

  if (!recap) {
    throw new ServiceError("The model did not return a usable recap.");
  }

  // Best-effort: never lose a paid recap over a usage-tracking write (mirrors askCampaign).
  try {
    await recordAiUsage({
      campaignId,
      userId,
      providerId: usageProviderId,
      model: usageModel,
      generatorId: SESSION_RECAP_GENERATOR.id,
      usage,
    });
  } catch {
    // usage tracking is non-critical
  }

  return { recap, model: usageModel, providerId: usageProviderId };
}
