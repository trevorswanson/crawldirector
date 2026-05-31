"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, Plus, Search, X } from "lucide-react";

import {
  archiveRelationshipAction,
  createRelationshipAction,
} from "@/app/(dm)/actions";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";
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

export type ConnectionCandidate = { id: string; name: string; type: string };

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
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<ConnectionCandidate | null>(null);
  const [type, setType] = useState<RelationshipTypeValue>("ALLY_OF");
  // Collapsed by default: show only the applicable types until the DM opts into
  // the full list, so the picker stays short and strongly steers toward sense.
  const [showAll, setShowAll] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? candidates.filter((c) => c.name.toLowerCase().includes(q))
      : candidates;
    return pool.slice(0, 8);
  }, [candidates, query]);

  // Target-first: the type picker is only meaningful once we know both ends.
  const targetType = target?.type as EntityTypeValue | undefined;
  const options = useMemo(
    () =>
      targetType
        ? relationshipPickerOptions(sourceType, targetType)
        : null,
    [sourceType, targetType],
  );

  const selectTarget = (candidate: ConnectionCandidate) => {
    setTarget(candidate);
    setShowAll(false);
    setType(
      defaultRelationshipType(sourceType, candidate.type as EntityTypeValue),
    );
  };

  const unusual =
    targetType !== undefined &&
    options !== null &&
    options.suggested.length > 0 &&
    !isSuggestedRelationship(type, sourceType, targetType);

  return (
    <form action={onSubmit} className="mt-3 flex flex-col gap-2">
      {/* Step 1 — pick the target entity */}
      {target ? (
        <div className="flex items-center gap-[7px] border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px]">
          <TypeDot type={target.type} size={7} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink)]">
            {target.name}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            {formatEntityType(target.type)}
          </span>
          <button
            type="button"
            title="Choose a different entity"
            onClick={() => {
              setTarget(null);
              setQuery("");
            }}
            className="inline-flex items-center p-[2px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
          >
            <X aria-hidden size={12} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg)] px-2">
            <Search aria-hidden size={12} className="text-[var(--ink-faint)]" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entity to connect…"
              className="w-full bg-transparent py-[6px] text-[11.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            />
          </div>
          <div className="flex max-h-[180px] flex-col overflow-y-auto border border-[var(--line)]">
            {matches.length === 0 ? (
              <p className="px-2 py-[7px] font-mono text-[10px] text-[var(--ink-faint)]">
                No matching entities.
              </p>
            ) : (
              matches.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => selectTarget(candidate)}
                  className="flex items-center gap-[7px] px-2 py-[6px] text-left transition-colors hover:bg-[var(--bg-3)]"
                >
                  <TypeDot type={candidate.type} size={7} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">
                    {candidate.name}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                    {formatEntityType(candidate.type)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

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

      <input type="hidden" name="targetId" value={target?.id ?? ""} />

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

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const res = await createRelationshipAction(campaignId, entityId, undefined, formData);
    if (res?.error) {
      setError(res.error);
    } else {
      setOpen(false);
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
          <div
            key={c.id}
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
                title="Remove connection"
                className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
              >
                <X aria-hidden size={12} />
              </button>
            </form>
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
