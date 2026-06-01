"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, Lock, Pencil, Plus, Unlock, X } from "lucide-react";

import {
  archiveRelationshipAction,
  createRelationshipAction,
  toggleRelationshipLockAction,
  updateRelationshipAction,
} from "@/app/(dm)/actions";
import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import {
  defaultRelationshipType,
  isSuggestedRelationship,
  relationshipEdgeLabel,
  relationshipOptionLabel,
  relationshipPickerOptions,
  type EntityTypeValue,
  type RelationshipTypeValue,
} from "@/lib/relationship-types";
import type { EntityConnection } from "@/server/services/relationships";

export type ConnectionCandidate = EntityCandidate;

// Sentinel option value that expands the type picker to the full grouped list.
const SHOW_ALL_TYPES = "__SHOW_ALL_TYPES__";

function AddButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex w-full items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
    >
      <Plus aria-hidden size={12} />
      {pending ? "Adding..." : "Add connection"}
    </button>
  );
}

function AddConnectionForm({
  sourceType,
  candidates,
  onSubmit,
  onCancel,
  error,
}: {
  sourceType: EntityTypeValue;
  candidates: ConnectionCandidate[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  error: string | null;
}) {
  const [target, setTarget] = useState<ConnectionCandidate | null>(null);
  const [type, setType] = useState<RelationshipTypeValue>("ALLY_OF");
  // Collapsed by default: show only the applicable types until the DM opts into
  // the full list, so the picker stays short and strongly steers toward sense.
  const [showAll, setShowAll] = useState(false);

  // Target-first: the type picker is only meaningful once we know both ends.
  const targetType = target?.type as EntityTypeValue | undefined;
  const options = useMemo(
    () =>
      targetType
        ? relationshipPickerOptions(sourceType, targetType)
        : null,
    [sourceType, targetType],
  );

  const selectTarget = (candidate: ConnectionCandidate | null) => {
    setTarget(candidate);
    setShowAll(false);
    if (candidate) {
      setType(
        defaultRelationshipType(sourceType, candidate.type as EntityTypeValue),
      );
    }
  };

  const unusual =
    targetType !== undefined &&
    options !== null &&
    options.suggested.length > 0 &&
    !isSuggestedRelationship(type, sourceType, targetType);

  return (
    <form action={onSubmit} className="mt-3 flex flex-col gap-2">
      {/* Step 1 — pick the target entity */}
      <EntityTypeahead
        name="targetId"
        candidates={candidates}
        value={target}
        onChange={selectTarget}
        placeholder="Search entity to connect…"
        autoFocus
      />

      {/* Step 2 — pick the relationship type, ranked by the chosen pairing.
          Collapsed to suggested-only until the DM picks "Show all…". */}
      {target && options && (
        <>
          <select
            name="type"
            value={type}
            onChange={(e) => {
              if (e.target.value === SHOW_ALL_TYPES) {
                setShowAll(true);
                return;
              }
              setType(e.target.value as RelationshipTypeValue);
            }}
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] font-mono text-[11px] text-[var(--ink)]"
          >
            <optgroup label="Suggested">
              {options.suggested.map((t) => (
                <option key={t} value={t}>
                  {relationshipOptionLabel(t)}
                </option>
              ))}
            </optgroup>
            {showAll ? (
              options.categories.map((cat) => (
                <optgroup key={cat.group} label={cat.label}>
                  {cat.types.map((t) => (
                    <option key={t} value={t}>
                      {relationshipOptionLabel(t)}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : options.categories.length > 0 ? (
              <optgroup label="─────────">
                <option value={SHOW_ALL_TYPES}>
                  Show all relationship types…
                </option>
              </optgroup>
            ) : null}
          </select>
          {showAll && options.categories.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="self-start font-mono text-[9.5px] uppercase tracking-[.06em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
            >
              Show suggested only
            </button>
          )}
          {unusual && (
            <p className="font-mono text-[9.5px] leading-[1.5] text-[var(--hot)]">
              Unusual pairing — allowed, just uncommon.
            </p>
          )}
        </>
      )}

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
        <AddButton disabled={!target} />
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

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function EditConnectionForm({
  connection,
  viewerType,
  onSubmit,
  onCancel,
  error,
}: {
  connection: EntityConnection;
  viewerType: EntityTypeValue;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  error: string | null;
}) {
  // Restore the edge's true orientation so the type picker ranks sensibly: for
  // an incoming edge the other entity is the source and the viewed entity the
  // target.
  const edgeSourceType = (
    connection.direction === "out" ? viewerType : connection.other.type
  ) as EntityTypeValue;
  const edgeTargetType = (
    connection.direction === "out" ? connection.other.type : viewerType
  ) as EntityTypeValue;
  const options = useMemo(
    () => relationshipPickerOptions(edgeSourceType, edgeTargetType),
    [edgeSourceType, edgeTargetType],
  );

  return (
    <form action={onSubmit} className="mt-[6px] flex flex-col gap-2 border border-[var(--line)] bg-[var(--bg-3)] px-[10px] py-[9px]">
      <select
        name="type"
        defaultValue={connection.type}
        aria-label="Relationship type"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] font-mono text-[11px] text-[var(--ink)]"
      >
        <optgroup label="Suggested">
          {options.suggested.map((t) => (
            <option key={t} value={t}>
              {relationshipOptionLabel(t)}
            </option>
          ))}
        </optgroup>
        {options.categories.map((cat) => (
          <optgroup key={cat.group} label={cat.label}>
            {cat.types.map((t) => (
              <option key={t} value={t}>
                {relationshipOptionLabel(t)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        name="disposition"
        type="number"
        min={-100}
        max={100}
        defaultValue={connection.disposition ?? ""}
        placeholder="Disposition (−100…100)"
        aria-label="Disposition"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
      />
      <textarea
        name="notes"
        rows={2}
        maxLength={500}
        defaultValue={connection.notes ?? ""}
        placeholder="Notes (optional)"
        aria-label="Notes"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
      />
      <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
        <input type="checkbox" name="secret" value="true" defaultChecked={connection.secret} />
        DM-only (secret)
      </label>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <SaveButton label="Save connection" />
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

export function ConnectionsPanel({
  campaignId,
  entityId,
  sourceType,
  connections,
  candidates,
}: {
  campaignId: string;
  entityId: string;
  sourceType: string;
  connections: EntityConnection[];
  candidates: ConnectionCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which edge is being edited inline, with its own error slot.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const res = await createRelationshipAction(campaignId, entityId, undefined, formData);
    if (res?.error) {
      setError(res.error);
    } else {
      setOpen(false);
    }
  };

  const handleEdit = (relationshipId: string) => async (formData: FormData) => {
    setEditError(null);
    const res = await updateRelationshipAction(
      campaignId,
      entityId,
      relationshipId,
      undefined,
      formData,
    );
    if (res?.error) {
      setEditError(res.error);
    } else {
      setEditingId(null);
    }
  };

  return (
    <div>
      <Kicker dim noLead className="mb-3">
        Connections · {connections.length}
      </Kicker>

      {connections.length === 0 && (
        <p className="text-xs text-[var(--ink-faint)]">No relationships yet.</p>
      )}

      <div className="flex flex-col gap-[6px]">
        {connections.map((c) => (
          <div key={c.id}>
          <div
            className="group flex items-start gap-2 border border-[var(--line)] px-[10px] py-[9px]"
          >
            <Link
              href={`/campaigns/${campaignId}/entities/${c.other.id}`}
              className="min-w-0 flex-1"
            >
              <div className="mb-[5px] flex items-center gap-[6px]">
                <ArrowRight
                  aria-hidden
                  size={11}
                  className={c.direction === "in" ? "rotate-180" : ""}
                  style={{ color: "var(--ink-faint)" }}
                />
                <span
                  className="font-mono text-[9.5px] uppercase tracking-[.04em]"
                  style={{ color: c.secret ? "var(--hot)" : "var(--accent)" }}
                >
                  {relationshipEdgeLabel(c.type, c.direction)}
                  {c.secret ? " · secret" : ""}
                </span>
              </div>
              <div className="flex items-center gap-[7px]">
                <TypeDot type={c.other.type} size={7} />
                <span className="truncate text-[12.5px] font-semibold text-[var(--ink)]">
                  {c.other.name}
                </span>
              </div>
            </Link>
            {!c.locked && (
              <button
                type="button"
                onClick={() => {
                  setEditError(null);
                  setEditingId(editingId === c.id ? null : c.id);
                }}
                aria-label="Edit connection"
                title="Edit connection"
                aria-expanded={editingId === c.id}
                className="inline-flex items-center border border-[var(--line)] px-[5px] py-[3px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
              >
                <Pencil aria-hidden size={12} />
              </button>
            )}
            <form
              action={toggleRelationshipLockAction.bind(
                null,
                campaignId,
                entityId,
                c.id,
                c.locked,
              )}
            >
              <button
                type="submit"
                aria-label={c.locked ? "Unlock connection" : "Lock connection"}
                title={c.locked ? "Unlock connection" : "Lock connection"}
                className="inline-flex items-center border px-[5px] py-[3px] transition-colors hover:text-[var(--sys)]"
                style={{
                  borderColor: c.locked ? "var(--sys)" : "var(--line)",
                  color: c.locked ? "var(--sys)" : "var(--ink-faint)",
                }}
              >
                {c.locked ? (
                  <Lock aria-hidden size={12} />
                ) : (
                  <Unlock aria-hidden size={12} />
                )}
              </button>
            </form>
            {!c.locked && (
            <form
              action={archiveRelationshipAction.bind(
                null,
                campaignId,
                entityId,
                c.id,
              )}
            >
              <button
                type="submit"
                aria-label="Remove connection"
                title="Remove connection"
                className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
              >
                <X aria-hidden size={12} />
              </button>
            </form>
            )}
          </div>
          {editingId === c.id && (
            <EditConnectionForm
              connection={c}
              viewerType={sourceType as EntityTypeValue}
              onSubmit={handleEdit(c.id)}
              onCancel={() => {
                setEditError(null);
                setEditingId(null);
              }}
              error={editError}
            />
          )}
          </div>
        ))}
      </div>

      {candidates.length === 0 ? (
        <p className="mt-3 font-mono text-[10px] leading-[1.5] text-[var(--ink-faint)]">
          Create another entity to connect this one to it.
        </p>
      ) : open ? (
        <AddConnectionForm
          sourceType={sourceType as EntityTypeValue}
          candidates={candidates}
          onSubmit={handleSubmit}
          onCancel={() => {
            setError(null);
            setOpen(false);
          }}
          error={error}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="mt-3 inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <Plus aria-hidden size={12} />
          Add connection
        </button>
      )}
    </div>
  );
}
