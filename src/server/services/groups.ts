import {
  CanonStatus,
  EntityType,
  RelationshipType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// Entity types that act as groups — i.e. that other entities can be MEMBER_OF /
// PART_OF / LEADS, and whose detail page shows a rolled-up roster. Any-to-any still holds
// at the DB level (docs/01-domain-model.md); this set only decides which entities
// surface a Roster panel and recurse when rolling up a hierarchy.
export const GROUP_ENTITY_TYPES: EntityType[] = [
  EntityType.PARTY,
  EntityType.GUILD,
  EntityType.FACTION,
  EntityType.ORGANIZATION,
];

export function isGroupEntityType(type: string): boolean {
  return (GROUP_ENTITY_TYPES as string[]).includes(type);
}

// Don't recurse forever on a malformed graph. The membership graph is small and
// shallow in practice (crawler → party → guild), so a generous cap is plenty.
const MAX_DEPTH = 6;

export type RosterEntry = {
  /** The membership edge connecting this entity to the parent group. */
  relationshipId: string;
  relationshipType: "MEMBER_OF" | "PART_OF" | "LEADS";
  sinceDay: number | null;
  untilDay: number | null;
  locked: boolean;
  secret: boolean;
  entity: { id: string; name: string; type: string };
  /** When the member is itself a group, its rolled-up roster (or null if the
   *  graph already expanded it elsewhere — guards against cycles/duplication). */
  subRoster: GroupRoster | null;
};

export type GroupRoster = {
  group: { id: string; name: string; type: string };
  leaders: RosterEntry[];
  members: RosterEntry[];
  /** Distinct member/sub-member entities across the whole subtree (leaders
   *  excluded), for an at-a-glance "rolls up N across the hierarchy" header. */
  rolledUpMemberCount: number;
};

type EdgeEndpoint = {
  id: string;
  name: string;
  type: EntityType;
  status: CanonStatus;
  visibility: Visibility;
};

type MembershipEdge = {
  id: string;
  type: RelationshipType;
  sinceDay: number | null;
  untilDay: number | null;
  locked: boolean;
  secret: boolean;
  sourceEntity: EdgeEndpoint;
  targetEntity: EdgeEndpoint;
};

const endpointSelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  visibility: true,
} as const;

function isPlayerVisible(entity: { status: CanonStatus; visibility: Visibility }) {
  return (
    entity.status !== CanonStatus.ARCHIVED &&
    entity.visibility === Visibility.PLAYER_VISIBLE
  );
}

function activeForRosterDay(
  edge: { sinceDay: number | null; untilDay: number | null },
  asOfDay: number | undefined,
) {
  if (asOfDay === undefined) {
    return edge.untilDay === null;
  }
  if (edge.sinceDay !== null && edge.sinceDay > asOfDay) return false;
  if (edge.untilDay !== null && edge.untilDay < asOfDay) return false;
  return true;
}

/**
 * Roll up the membership hierarchy rooted at a group entity: its leaders (LEADS
 * edges into the group) and members (MEMBER_OF edges into the group). Members
 * that are themselves groups expand recursively, so a guild rolls up its parties
 * and each party's members (docs/11-roadmap.md M3).
 *
 * Visibility-scoped: players never see secret membership edges, members they
 * can't otherwise see, or the roster of a group they can't see. Returns null
 * when the user isn't a member of the campaign or can't see the root group.
 */
// Map a roster edge's relationship type to its roster-bucket label: LEADS and
// PART_OF keep their own; every other edge rolls up as a plain MEMBER_OF.
function rosterEdgeKind(type: RelationshipType): "MEMBER_OF" | "PART_OF" | "LEADS" {
  switch (type) {
    case RelationshipType.LEADS:
      return "LEADS";
    case RelationshipType.PART_OF:
      return "PART_OF";
    default:
      return "MEMBER_OF";
  }
}

export async function getGroupRoster(
  userId: string,
  campaignId: string,
  groupId: string,
  options: { asOfDay?: number } = {},
): Promise<GroupRoster | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership) return null;
  const isPlayer = membership.role === Role.PLAYER;

  const root = await prisma.entity.findFirst({
    where: { id: groupId, campaignId, status: CanonStatus.CANON },
    select: endpointSelect,
  });
  if (!root) return null;
  if (isPlayer && !isPlayerVisible(root)) return null;

  // Pull every live membership/leadership edge in the campaign once, then walk
  // the tree in memory — the membership graph is small and this avoids N queries.
  const edges = (await prisma.relationship.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      type: {
        in: [
          RelationshipType.MEMBER_OF,
          RelationshipType.PART_OF,
          RelationshipType.LEADS,
        ],
      },
      ...(isPlayer ? { secret: false } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      sinceDay: true,
      untilDay: true,
      locked: true,
      secret: true,
      sourceEntity: { select: endpointSelect },
      targetEntity: { select: endpointSelect },
    },
  })) as MembershipEdge[];

  // Index edges by the group they point at (target = the group; source = the
  // member/leader). Archiving an entity soft-archives it but leaves its edges
  // in place, so drop archived members/leaders for everyone (not just players)
  // — otherwise a DM would see an archived crawler as a current member. Then
  // additionally hide endpoints a player can't see.
  const byTarget = new Map<string, MembershipEdge[]>();
  for (const edge of edges) {
    if (!activeForRosterDay(edge, options.asOfDay)) continue;
    if (edge.sourceEntity.status === CanonStatus.ARCHIVED) continue;
    if (isPlayer && !isPlayerVisible(edge.sourceEntity)) continue;
    const list = byTarget.get(edge.targetEntity.id) ?? [];
    list.push(edge);
    byTarget.set(edge.targetEntity.id, list);
  }

  // A group is only expanded once across the whole walk — that both breaks
  // cycles and keeps a diamond (two parties in the same guild) from ballooning.
  const expanded = new Set<string>();

  // Side table: each roster node → the distinct member ids in its subtree, so a
  // parent can union a child's set into its own without re-walking.
  const subRosterMemberIds = new Map<GroupRoster, Set<string>>();

  // Build a roster node. `seen` collects the distinct non-group member entity
  // ids in this node's subtree, so its `rolledUpMemberCount` reflects its own
  // subtree (and parents fold their children's sets in).
  function buildRoster(group: EdgeEndpoint, depth: number): GroupRoster {
    expanded.add(group.id);
    const incoming = byTarget.get(group.id) ?? [];
    const leaders: RosterEntry[] = [];
    const members: RosterEntry[] = [];
    const seen = new Set<string>();

    for (const edge of incoming) {
      const member = edge.sourceEntity;
      const relationshipType = rosterEdgeKind(edge.type);

      if (relationshipType === "LEADS") {
        leaders.push({
          relationshipId: edge.id,
          relationshipType,
          sinceDay: edge.sinceDay,
          untilDay: edge.untilDay,
          locked: edge.locked,
          secret: edge.secret,
          entity: { id: member.id, name: member.name, type: member.type },
          subRoster: null,
        });
        continue;
      }

      let subRoster: GroupRoster | null = null;
      if (
        isGroupEntityType(member.type) &&
        depth < MAX_DEPTH &&
        !expanded.has(member.id)
      ) {
        subRoster = buildRoster(member, depth + 1);
        for (const id of subRosterMemberIds.get(subRoster) ?? []) seen.add(id);
      } else if (!isGroupEntityType(member.type)) {
        seen.add(member.id);
      }
      members.push({
        relationshipId: edge.id,
        relationshipType,
        sinceDay: edge.sinceDay,
        untilDay: edge.untilDay,
        locked: edge.locked,
        secret: edge.secret,
        entity: { id: member.id, name: member.name, type: member.type },
        subRoster,
      });
    }

    const node: GroupRoster = {
      group: { id: group.id, name: group.name, type: group.type },
      leaders,
      members,
      rolledUpMemberCount: seen.size,
    };
    subRosterMemberIds.set(node, seen);
    return node;
  }

  return buildRoster(root, 0);
}
