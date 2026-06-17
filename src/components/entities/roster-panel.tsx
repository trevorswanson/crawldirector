import Link from "next/link";
import { Crown, Lock, Users } from "lucide-react";

import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";
import type { GroupRoster, RosterEntry } from "@/server/services/groups";

function EntityRow({
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

// Recursive members tree: each group member nests its own roster beneath it.
function MembersTree({
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
            <div className="mt-[6px] ml-[10px] flex flex-col gap-[6px] border-l border-[var(--line)] pl-[10px]">
              {entry.subRoster.leaders.length > 0 && (
                <div className="flex flex-col gap-[6px]">
                  {entry.subRoster.leaders.map((leader) => (
                    <EntityRow
                      key={leader.relationshipId}
                      campaignId={campaignId}
                      entry={leader}
                      leader
                    />
                  ))}
                </div>
              )}
              {entry.subRoster.members.length > 0 ? (
                <MembersTree
                  campaignId={campaignId}
                  entries={entry.subRoster.members}
                />
              ) : (
                entry.subRoster.leaders.length === 0 && (
                  <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                    No members yet.
                  </p>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Read-only rollup of a group's membership hierarchy: leaders, direct members,
 * and (for sub-groups like a guild's parties) their members nested beneath.
 * Membership edges are added/removed from the Connections panel — this view
 * just rolls them up (docs/11-roadmap.md M3 group hierarchies).
 */
export function RosterPanel({
  campaignId,
  roster,
  asOfDay,
}: {
  campaignId: string;
  roster: GroupRoster;
  asOfDay?: number;
}) {
  const { leaders, members, rolledUpMemberCount } = roster;
  const empty = leaders.length === 0 && members.length === 0;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Users aria-hidden size={13} style={{ color: "var(--ink-faint)" }} />
        <Kicker dim noLead>
          Roster · {rolledUpMemberCount}{" "}
          {rolledUpMemberCount === 1 ? "member" : "members"}
          {asOfDay !== undefined ? ` · Day ${asOfDay}` : ""}
        </Kicker>
      </div>

      {empty ? (
        <p className="text-xs text-[var(--ink-faint)]">
          No members yet. Add{" "}
          <span className="font-mono text-[var(--accent)]">MEMBER OF</span> /{" "}
          <span className="font-mono text-[var(--accent)]">LEADS</span>{" "}
          connections to build this group.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {leaders.length > 0 && (
            <section>
              <p className="mb-[6px] font-mono text-[9.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                Leaders
              </p>
              <div className="flex flex-col gap-[6px]">
                {leaders.map((leader) => (
                  <EntityRow
                    key={leader.relationshipId}
                    campaignId={campaignId}
                    entry={leader}
                    leader
                  />
                ))}
              </div>
            </section>
          )}
          {members.length > 0 && (
            <section>
              <p className="mb-[6px] font-mono text-[9.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                Members
              </p>
              <MembersTree campaignId={campaignId} entries={members} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
