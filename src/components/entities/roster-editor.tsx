"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Crown, Lock, Pencil, Plus, Unlock, Users, X } from "lucide-react";

import {
  archiveRelationshipAction,
  createRelationshipAction,
  restoreRelationshipAction,
  searchEntityCandidatesAction,
  toggleRelationshipLockAction,
  updateRelationshipAction,
} from "@/app/(dm)/actions";
import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { SubRosterBlock } from "@/components/entities/roster-tree";
import { TypeDot } from "@/components/ui/type-dot";
import type { RosterEntry } from "@/server/services/groups";

export type RosterEditorCandidate = EntityCandidate;

type RosterRole = "member" | "leader";

// A roster row is a leader (LEADS edge) or a member (MEMBER_OF / PART_OF roll-up).
function entryRole(entry: RosterEntry): RosterRole {
  return entry.relationshipType === "LEADS" ? "leader" : "member";
}

function formatDayBounds(sinceDay: number | null, untilDay: number | null) {
  if (sinceDay === null && untilDay === null) return null;
  if (sinceDay !== null && untilDay !== null) return `Day ${sinceDay} -> ${untilDay}`;
  if (sinceDay !== null) return `Day ${sinceDay} -> current`;
  return `Until day ${untilDay}`;
}

// Hidden inputs that round-trip an edge's fields the roster editor doesn't
// expose, so an edit/promote never silently nulls disposition/notes (the update
// action rewrites every mutable field). `secret` is preserved separately —
// either a visible checkbox (edit) or a value="true" hidden input only when set.
function PreservedFields({ entry }: { entry: RosterEntry }) {
  return (
    <>
      <input type="hidden" name="disposition" value={entry.disposition ?? ""} />
      <input type="hidden" name="notes" value={entry.notes ?? ""} />
    </>
  );
}

function SubmitButton({ label, pendingLabel, disabled }: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex w-full items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
    >
      <Plus aria-hidden size={12} />
      {pending ? pendingLabel : label}
    </button>
  );
}

function EditDayBoundsForm({
  entry,
  onSubmit,
  onCancel,
  error,
}: {
  entry: RosterEntry;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <form
      action={onSubmit}
      className="mt-[6px] flex flex-col gap-2 border border-[var(--line)] bg-[var(--bg-3)] px-[10px] py-[9px]"
    >
      {/* The edge keeps its role on a day-bounds edit; promote/demote is separate. */}
      <input type="hidden" name="type" value={entry.relationshipType} />
      <PreservedFields entry={entry} />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="sinceDay"
          type="number"
          min={0}
          defaultValue={entry.sinceDay ?? ""}
          placeholder="Since day"
          aria-label="Since day"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
        />
        <input
          name="untilDay"
          type="number"
          min={0}
          defaultValue={entry.untilDay ?? ""}
          placeholder="Until day"
          aria-label="Until day"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
        />
      </div>
      <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
        <input type="checkbox" name="secret" value="true" defaultChecked={entry.secret} />
        DM-only (secret)
      </label>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <SubmitButton label="Save membership" pendingLabel="Saving..." />
        <button
          type="button"
          onClick={onCancel}
          className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditableRow({
  campaignId,
  groupId,
  entry,
}: {
  campaignId: string;
  groupId: string;
  entry: RosterEntry;
}) {
  const role = entryRole(entry);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const dayBounds = formatDayBounds(entry.sinceDay, entry.untilDay);
  // PART_OF (a sub-group's "part of" edge) isn't a leader/member toggle, so it
  // doesn't get a promote/demote control — only true LEADS / MEMBER_OF do.
  const canPromote = entry.relationshipType !== "PART_OF";
  const promoteType = role === "leader" ? "MEMBER_OF" : "LEADS";

  const handleEdit = async (formData: FormData) => {
    setEditError(null);
    const res = await updateRelationshipAction(
      campaignId,
      groupId,
      entry.relationshipId,
      undefined,
      formData,
    );
    if (res?.error) setEditError(res.error);
    else setEditing(false);
  };

  if (removed) {
    return (
      <div className="flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--ink-dim)]">
        <span>{role === "leader" ? "Leader" : "Member"} removed.</span>
        <form
          action={async () => {
            await restoreRelationshipAction(campaignId, groupId, entry.relationshipId);
            setRemoved(false);
          }}
        >
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--accent)] hover:text-[var(--ink)]"
          >
            Undo
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="group flex items-center gap-[7px] border border-[var(--line)] px-[10px] py-[8px]">
        {role === "leader" ? (
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
        {dayBounds && (
          <span className="font-mono text-[9px] uppercase tracking-[.04em] text-[var(--ink-faint)]">
            {dayBounds}
          </span>
        )}
        {entry.secret && (
          <span className="font-mono text-[9px] uppercase tracking-[.04em] text-[var(--hot)]">
            secret
          </span>
        )}
        {!entry.locked && canPromote && (
          <form
            action={async (formData: FormData) => {
              await updateRelationshipAction(
                campaignId,
                groupId,
                entry.relationshipId,
                undefined,
                formData,
              );
            }}
          >
            <input type="hidden" name="type" value={promoteType} />
            <input type="hidden" name="sinceDay" value={entry.sinceDay ?? ""} />
            <input type="hidden" name="untilDay" value={entry.untilDay ?? ""} />
            <PreservedFields entry={entry} />
            {entry.secret && <input type="hidden" name="secret" value="true" />}
            <button
              type="submit"
              aria-label={role === "leader" ? "Demote to member" : "Promote to leader"}
              title={role === "leader" ? "Make member" : "Make leader"}
              className="inline-flex items-center border border-[var(--line)] px-[5px] py-[3px] text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
            >
              {role === "leader" ? (
                <Users aria-hidden size={12} />
              ) : (
                <Crown aria-hidden size={12} />
              )}
            </button>
          </form>
        )}
        {!entry.locked && (
          <button
            type="button"
            onClick={() => {
              setEditError(null);
              setEditing((v) => !v);
            }}
            aria-label="Edit membership"
            title="Edit membership"
            aria-expanded={editing}
            className="inline-flex items-center border border-[var(--line)] px-[5px] py-[3px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            <Pencil aria-hidden size={12} />
          </button>
        )}
        <form
          action={toggleRelationshipLockAction.bind(
            null,
            campaignId,
            groupId,
            entry.relationshipId,
            entry.locked,
          )}
        >
          <button
            type="submit"
            aria-label={entry.locked ? "Unlock membership" : "Lock membership"}
            title={entry.locked ? "Unlock membership" : "Lock membership"}
            className="inline-flex items-center border px-[5px] py-[3px] transition-colors hover:text-[var(--sys)]"
            style={{
              borderColor: entry.locked ? "var(--sys)" : "var(--line)",
              color: entry.locked ? "var(--sys)" : "var(--ink-faint)",
            }}
          >
            {entry.locked ? (
              <Lock aria-hidden size={12} />
            ) : (
              <Unlock aria-hidden size={12} />
            )}
          </button>
        </form>
        {!entry.locked && (
          <form
            action={async () => {
              await archiveRelationshipAction(campaignId, groupId, entry.relationshipId);
              setRemoved(true);
            }}
          >
            <button
              type="submit"
              aria-label="Remove from roster"
              title="Remove from roster"
              className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
            >
              <X aria-hidden size={12} />
            </button>
          </form>
        )}
      </div>
      {editing && (
        <EditDayBoundsForm
          entry={entry}
          onSubmit={handleEdit}
          onCancel={() => {
            setEditError(null);
            setEditing(false);
          }}
          error={editError}
        />
      )}
      {entry.subRoster && (
        <SubRosterBlock campaignId={campaignId} subRoster={entry.subRoster} />
      )}
    </div>
  );
}

function AddRosterForm({
  campaignId,
  candidates,
  excludeIds,
  onSubmit,
  onCancel,
  error,
}: {
  campaignId: string;
  candidates: RosterEditorCandidate[];
  excludeIds: string[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  error: string | null;
}) {
  const [target, setTarget] = useState<RosterEditorCandidate | null>(null);
  const [role, setRole] = useState<RosterRole>("member");
  const type = role === "leader" ? "LEADS" : "MEMBER_OF";

  const search = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, { excludeIds });

  return (
    <form action={onSubmit} className="mt-3 flex flex-col gap-2">
      {/* The viewed group is the target; the picked entity is the source ("in"),
          so the edge reads "<entity> MEMBER_OF/LEADS <group>". */}
      <input type="hidden" name="direction" value="in" />
      <input type="hidden" name="type" value={type} />
      <EntityTypeahead
        name="targetId"
        candidates={candidates}
        searchCandidates={search}
        value={target}
        onChange={setTarget}
        placeholder="Search entity to add…"
        autoFocus
      />
      <div
        role="group"
        aria-label="Roster role"
        className="flex items-stretch gap-1"
      >
        {(["member", "leader"] as const).map((r) => {
          const active = role === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={active}
              onClick={() => setRole(r)}
              className="min-w-0 flex-1 truncate border px-[8px] py-[6px] text-[11px] transition-colors"
              style={{
                background: active ? "var(--bg-3)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-dim)",
                borderColor: active ? "var(--accent)" : "var(--line-strong)",
              }}
            >
              {r === "leader" ? "Leader" : "Member"}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          name="sinceDay"
          type="number"
          min={0}
          placeholder="Since day"
          aria-label="Since day"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
        />
        <input
          name="untilDay"
          type="number"
          min={0}
          placeholder="Until day"
          aria-label="Until day"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
        />
      </div>
      <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
        <input type="checkbox" name="secret" value="true" />
        DM-only (secret)
      </label>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <SubmitButton
          label={role === "leader" ? "Add leader" : "Add member"}
          pendingLabel="Adding..."
          disabled={!target}
        />
        <button
          type="button"
          onClick={onCancel}
          className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * DM-only editable view of a group's *direct* roster: add/remove members and
 * leaders, promote/demote, and edit day-bounds — all reusing the existing
 * relationship actions (every write routes through the review pipeline as an
 * auto-approved DM change set, invariant #1). Nested sub-group rosters are
 * rendered read-only here; they're edited on their own group's page.
 */
export function RosterEditor({
  campaignId,
  group,
  leaders,
  members,
  candidates,
}: {
  campaignId: string;
  group: { id: string; name: string; type: string };
  leaders: RosterEntry[];
  members: RosterEntry[];
  candidates: RosterEditorCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Exclude the group itself and everyone already on the direct roster, so the
  // add picker steers away from duplicate edges and self-membership.
  const excludeIds = useMemo(() => {
    const ids = new Set<string>([group.id]);
    for (const entry of leaders) ids.add(entry.entity.id);
    for (const entry of members) ids.add(entry.entity.id);
    return [...ids];
  }, [group.id, leaders, members]);
  const addCandidates = useMemo(
    () => candidates.filter((candidate) => !excludeIds.includes(candidate.id)),
    [candidates, excludeIds],
  );

  const handleAdd = async (formData: FormData) => {
    setAddError(null);
    const res = await createRelationshipAction(
      campaignId,
      group.id,
      undefined,
      formData,
    );
    if (res?.error) setAddError(res.error);
    else setOpen(false);
  };

  const empty = leaders.length === 0 && members.length === 0;

  return (
    <div>
      {empty && (
        <p className="mb-3 text-xs text-[var(--ink-faint)]">
          No members yet. Add a leader or member to build this group.
        </p>
      )}
      {leaders.length > 0 && (
        <section className="mb-4">
          <p className="mb-[6px] font-mono text-[9.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            Leaders
          </p>
          <div className="flex flex-col gap-[6px]">
            {leaders.map((leader) => (
              <EditableRow
                key={leader.relationshipId}
                campaignId={campaignId}
                groupId={group.id}
                entry={leader}
              />
            ))}
          </div>
        </section>
      )}
      {members.length > 0 && (
        <section className="mb-4">
          <p className="mb-[6px] font-mono text-[9.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            Members
          </p>
          <div className="flex flex-col gap-[6px]">
            {members.map((member) => (
              <EditableRow
                key={member.relationshipId}
                campaignId={campaignId}
                groupId={group.id}
                entry={member}
              />
            ))}
          </div>
        </section>
      )}

      {open ? (
        <AddRosterForm
          campaignId={campaignId}
          candidates={addCandidates}
          excludeIds={excludeIds}
          onSubmit={handleAdd}
          onCancel={() => {
            setAddError(null);
            setOpen(false);
          }}
          error={addError}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setAddError(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <Plus aria-hidden size={12} />
          Add to roster
        </button>
      )}
    </div>
  );
}
