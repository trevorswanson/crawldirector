import { Users } from "lucide-react";

import { EntityRow, MembersTree } from "@/components/entities/roster-tree";
import {
  RosterEditor,
  type RosterEditorCandidate,
} from "@/components/entities/roster-editor";
import { Kicker } from "@/components/ui/kicker";
import type { GroupRoster } from "@/server/services/groups";

/**
 * Rollup of a group's membership hierarchy: leaders, direct members, and (for
 * sub-groups like a guild's parties) their members nested beneath. For DMs the
 * group's *direct* leaders/members are editable (add/remove/promote/day-bounds)
 * via the `RosterEditor`; players and nested sub-rosters stay read-only.
 * Membership edges are the same any-to-any relationships shown in Connections —
 * this view just rolls them up (docs/11-roadmap.md M3 group hierarchies).
 */
export function RosterPanel({
  campaignId,
  roster,
  asOfDay,
  editable = false,
  candidates = [],
}: {
  campaignId: string;
  roster: GroupRoster;
  asOfDay?: number;
  /** DM-only: render the direct roster as an editable surface. */
  editable?: boolean;
  /** Candidate entities for the "add to roster" typeahead (DM only). */
  candidates?: RosterEditorCandidate[];
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

      {editable ? (
        <RosterEditor
          campaignId={campaignId}
          group={roster.group}
          leaders={leaders}
          members={members}
          candidates={candidates}
        />
      ) : empty ? (
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
