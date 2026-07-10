import {
  CanonStatus,
  EntityType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { getMembershipRole } from "@/server/services/campaigns";

// ── Player System-message feed (M7) ─────────────────────────────────────────
//
// The in-fiction broadcast feed the player crawler interface renders: THE
// SYSTEM's announcements to the crawlers. Each item is a `SYSTEM_MESSAGE`
// entity, so the feed is a visibility-projected read (invariant #5) — a PLAYER
// sees only `PLAYER_VISIBLE` messages, and only live CANON (a pending/archived
// proposal never reaches a player). Unlike the crawler sheet/loadout this is
// campaign-wide, not scoped to the caller's crawler: every player sees the same
// broadcast feed the DM has published, newest first.

export type SystemFeedMessage = {
  entityId: string;
  name: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  /** When the System issued the broadcast (the entity's creation time). */
  broadcastAt: Date;
};

// Player-scoped: the campaign's System-message feed for the caller, or an empty
// list if they are not a member. A PLAYER sees only PLAYER_VISIBLE messages;
// only live CANON entities ever surface (belt-and-suspenders on top of the role
// filter, matching the Known World). Ordered newest broadcast first.
export async function getSystemMessageFeed(
  userId: string,
  campaignId: string,
): Promise<SystemFeedMessage[]> {
  const role = await getMembershipRole(userId, campaignId);
  if (!role) return [];

  const messages = await prisma.entity.findMany({
    where: {
      campaignId,
      type: EntityType.SYSTEM_MESSAGE,
      status: CanonStatus.CANON,
      ...(role === Role.PLAYER
        ? { visibility: Visibility.PLAYER_VISIBLE }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      summary: true,
      description: true,
      tags: true,
      createdAt: true,
    },
  });

  return messages.map((m) => ({
    entityId: m.id,
    name: m.name,
    summary: m.summary,
    description: m.description,
    tags: m.tags,
    broadcastAt: m.createdAt,
  }));
}
