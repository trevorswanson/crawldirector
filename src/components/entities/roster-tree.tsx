import Link from "next/link";
import { Crown, Lock } from "lucide-react";

import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";
import type { GroupRoster, RosterEntry } from "@/server/services/groups";

/**
 * One read-only roster row: a member or leader entity with its type/secret/lock
 * badges. Shared by the read-only `RosterPanel` (players + nested sub-rosters)
 * and the DM `RosterEditor` (which renders nested sub-rosters read-only — only
 * the viewed group's *direct* roster is editable).
 */
export function EntityRow({
  campaignId,
  entry,
  leader,
}: {
  campaignId: string;
  entry: RosterEntry;
  leader?: boolean;
}) {
  return (
    <div className="flex items-center gap-[7px] border border-[var(--line)] px-[10px] py-[8px]">
      {leader ? (
        <Crown aria-hidden size={11} style={{ color: "var(--accent)" }} />
      ) : (
        <TypeDot type={entry.entity.type} size={7} />
      )}
      <Link
        href={`/campaigns/${campaignId}/entities/${entry.entity.id}`}
        className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
      >
        {entry.entity.name}
      </Link>
      <span className="font-mono text-[9px] uppercase tracking-[.04em] text-[var(--ink-faint)]">
        {formatEntityType(entry.entity.type)}
      </span>
      {entry.secret && (
        <span className="font-mono text-[9px] uppercase tracking-[.04em] text-[var(--hot)]">
          secret
        </span>
      )}
      {entry.locked && (
        <Lock aria-hidden size={11} style={{ color: "var(--sys)" }} />
      )}
    </div>
  );
}

/**
 * The indented, read-only roll-up of a sub-group's own roster (its leaders and
 * members), nested beneath the member that is itself a group. Shared so the
 * editor can render a direct member's sub-group read-only with identical markup.
 */
export function SubRosterBlock({
  campaignId,
  subRoster,
}: {
  campaignId: string;
  subRoster: GroupRoster;
}) {
  return (
    <div className="mt-[6px] ml-[10px] flex flex-col gap-[6px] border-l border-[var(--line)] pl-[10px]">
      {subRoster.leaders.length > 0 && (
        <div className="flex flex-col gap-[6px]">
          {subRoster.leaders.map((leader) => (
            <EntityRow
              key={leader.relationshipId}
              campaignId={campaignId}
              entry={leader}
              leader
            />
          ))}
        </div>
      )}
      {subRoster.members.length > 0 ? (
        <MembersTree campaignId={campaignId} entries={subRoster.members} />
      ) : (
        subRoster.leaders.length === 0 && (
          <p className="font-mono text-[10px] text-[var(--ink-faint)]">
            No members yet.
          </p>
        )
      )}
    </div>
  );
}

/**
 * Recursive read-only members tree: each group member nests its own roster
 * (leaders + members) beneath it. Used for sub-groups (a guild's parties and
 * their members) on both the read-only and editable roster surfaces.
 */
export function MembersTree({
  campaignId,
  entries,
}: {
  campaignId: string;
  entries: RosterEntry[];
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      {entries.map((entry) => (
        <div key={entry.relationshipId}>
          <EntityRow campaignId={campaignId} entry={entry} />
          {entry.subRoster && (
            <SubRosterBlock campaignId={campaignId} subRoster={entry.subRoster} />
          )}
        </div>
      ))}
    </div>
  );
}
