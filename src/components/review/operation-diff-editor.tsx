"use client";

import { useState } from "react";
import {
  Check,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { withoutFloorCandidates } from "@/components/entities/participant-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewInputKind } from "@/lib/review";
import {
  eventParticipantRoleValues,
  timeBasisValues,
  timeUnitValues,
  type TimeBasisValue,
  type TimeUnitValue,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

type FieldDecision = "ACCEPTED" | "PENDING" | "REJECTED";
type ParticipantRole = (typeof eventParticipantRoleValues)[number];

export type ReviewStructuredField =
  | { kind: "entity"; value: EntityCandidate | null }
  | {
      kind: "inGameTime";
      basis: TimeBasisValue;
      floor: number | null;
      offset: number | null;
      unit: TimeUnitValue | null;
      anchorEventId: string | null;
      label: string;
    }
  | {
      kind: "participants";
      value: { entity: EntityCandidate | null; role: ParticipantRole }[];
    };

// One field of an operation, with its diff text + initial decision/edit state
// pre-computed on the server so this client component stays purely presentational.
export type ReviewFieldInit = {
  field: string;
  fromText: string | null;
  toText: string;
  kind: ReviewInputKind;
  blocked: boolean;
  stale: boolean;
  decision: FieldDecision;
  editing: boolean;
  draft: string;
  structured?: ReviewStructuredField;
};

type FieldState = {
  editing: boolean;
  draft: string;
};

/**
 * Read-first operation diff. Each field renders as a before/after diff
 * (mockup `screen-review.jsx`); a DM Accepts / Rejects / Edits per field, and
 * only an Edit reveals an input. Accept/Reject persist one row immediately;
 * editing replaces those controls with row-local Save/Discard buttons. Op-level
 * Accept all / Reject (in the header) handle the bulk path. Blocked fields are
 * display-only.
 */
export function OperationDiffEditor({
  decisionAction,
  editAction,
  fields,
  opRejected,
  readOnly = false,
  candidates = [],
}: {
  decisionAction: (
    field: string,
    decision: "ACCEPTED" | "PENDING" | "REJECTED",
  ) => void | Promise<void>;
  editAction: (field: string, formData: FormData) => void | Promise<void>;
  fields: ReviewFieldInit[];
  opRejected: boolean;
  readOnly?: boolean;
  candidates?: EntityCandidate[];
}) {
  const [state, setState] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.field,
        { editing: field.editing, draft: field.draft },
      ]),
    ),
  );

  const patchField = (name: string, patch: Partial<FieldState>) =>
    setState((current) => ({ ...current, [name]: { ...current[name], ...patch } }));

  return (
    <>
      {fields.map((field) => {
        const fs = state[field.field];
        const rejected = opRejected || field.decision === "REJECTED";

        return (
          <div
            key={field.field}
            className={cn(
              "grid grid-cols-[92px_minmax(0,1fr)_auto] items-start gap-3 border-t border-[var(--line)] px-3 py-[9px]",
              field.blocked && "bg-[color-mix(in_srgb,var(--sys)_7%,transparent)]",
              rejected && "opacity-45",
            )}
          >
            {fs.editing && !field.blocked && !opRejected && !readOnly ? (
              <form action={editAction.bind(null, field.field)} className="contents">
                <FieldLabel field={field.field} />
                <FieldValue
                  candidates={candidates}
                  draft={fs.draft}
                  editing
                  field={field}
                  onChange={(draft) => patchField(field.field, { draft })}
                  rejected={rejected}
                />
                <div className="flex gap-1">
                  <Button aria-label={`Save ${field.field}`} size="sm" type="submit" variant="ok">
                    <Save aria-hidden size={12} />
                    Save
                  </Button>
                  <Button
                    aria-label={`Discard ${field.field} edit`}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      patchField(field.field, { editing: false, draft: field.draft })
                    }
                  >
                    <X aria-hidden size={12} />
                    Discard
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <FieldLabel field={field.field} />
                <FieldValue
                  candidates={candidates}
                  draft={fs.draft}
                  field={field}
                  onChange={(draft) => patchField(field.field, { draft })}
                  rejected={rejected}
                />
                {!field.blocked && !opRejected && !readOnly ? (
                  <div className="flex gap-1">
                    <form
                      action={decisionAction.bind(
                        null,
                        field.field,
                        field.decision === "ACCEPTED" ? "PENDING" : "ACCEPTED",
                      )}
                    >
                      <FieldToggle
                        active={field.decision === "ACCEPTED"}
                        label={`Accept ${field.field}`}
                        color="var(--ok)"
                      >
                        <Check aria-hidden size={13} />
                      </FieldToggle>
                    </form>
                    <form
                      action={decisionAction.bind(
                        null,
                        field.field,
                        field.decision === "REJECTED" ? "PENDING" : "REJECTED",
                      )}
                    >
                      <FieldToggle
                        active={field.decision === "REJECTED"}
                        label={`Reject ${field.field}`}
                        color="var(--no)"
                      >
                        <X aria-hidden size={13} />
                      </FieldToggle>
                    </form>
                    <FieldToggle
                      active={false}
                      label={`Edit ${field.field}`}
                      color="var(--accent)"
                      type="button"
                      onClick={() => patchField(field.field, { editing: true })}
                    >
                      <Pencil aria-hidden size={12} />
                    </FieldToggle>
                  </div>
                ) : (
                  <div className="w-[84px]" />
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function FieldLabel({ field }: { field: string }) {
  return (
    <div className="font-mono text-[10.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
      {field}
    </div>
  );
}

function FieldValue({
  candidates,
  draft,
  editing = false,
  field,
  onChange,
  rejected,
}: {
  candidates: EntityCandidate[];
  draft: string;
  editing?: boolean;
  field: ReviewFieldInit;
  onChange: (draft: string) => void;
  rejected: boolean;
}) {
  return (
    <div className="min-w-0 text-[12.5px] leading-[1.5]">
      {field.fromText !== null && (
        <div
          className={cn(
            "mb-[3px] break-words text-[var(--del)] opacity-80",
            !rejected && "line-through",
          )}
        >
          <span className="mono mr-[6px] text-[10px] opacity-70">-</span>
          {field.fromText}
        </div>
      )}
      {editing ? (
        <div className="mt-1">
          <input type="hidden" name="kind" value={field.kind} />
          <ValueInput
            field={field.field}
            kind={field.kind}
            value={draft}
            structured={field.structured}
            candidates={candidates}
            onChange={onChange}
          />
        </div>
      ) : (
        <div className="break-words text-[var(--add)]">
          <span className="mono mr-[6px] text-[10px] opacity-70">+</span>
          <span
            className={cn(
              field.blocked ? "text-[var(--ink-faint)]" : "text-[var(--ink)]",
              rejected && "line-through",
            )}
          >
            {field.toText}
          </span>
        </div>
      )}
      {field.blocked && (
        <div className="mt-[5px] inline-flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--sys)]">
          <Lock aria-hidden size={11} />
          BLOCKED BY LOCK — UNLOCK TARGET TO APPLY
        </div>
      )}
      {field.stale && !field.blocked && (
        <div className="mt-[5px] inline-flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--hot)]">
          <TriangleAlert aria-hidden size={11} />
          CANON CHANGED UNDER THIS — RESOLVE BELOW
        </div>
      )}
    </div>
  );
}

function FieldToggle({
  active,
  label,
  color,
  onClick,
  type = "submit",
  children,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick?: () => void;
  type?: "button" | "submit";
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className="grid size-[26px] place-items-center border"
      style={{
        borderColor: active ? color : "var(--line-strong)",
        background: active ? `color-mix(in srgb, ${color} 18%, transparent)` : "transparent",
        color: active ? color : "var(--ink-faint)",
      }}
    >
      {children}
    </button>
  );
}

function ValueInput({
  field,
  kind,
  value,
  structured,
  candidates,
  onChange,
}: {
  field: string;
  kind: ReviewInputKind;
  value: string;
  structured?: ReviewStructuredField;
  candidates: EntityCandidate[];
  onChange: (value: string) => void;
}) {
  const name = "value";
  if (structured?.kind === "entity") {
    return (
      <EntityReviewInput
        candidates={candidates}
        field={field}
        initial={structured.value}
        onChange={onChange}
      />
    );
  }
  if (structured?.kind === "inGameTime") {
    return <InGameTimeReviewInput structured={structured} onChange={onChange} />;
  }
  if (structured?.kind === "participants") {
    return (
      <ParticipantsReviewInput
        candidates={candidates}
        field={field}
        initial={structured.value}
        onChange={onChange}
      />
    );
  }
  if (kind === "boolean") {
    return (
      <select
        aria-label={`${field} value`}
        className="h-8 w-full border border-[var(--line-strong)] bg-[var(--bg)] px-2 font-mono text-[11px] text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        name={name}
        value={value === "false" ? "false" : "true"}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (kind === "json" || (kind === "string" && value.length > 80)) {
    return (
      <Textarea
        aria-label={`${field} value`}
        className={cn("min-h-16", kind === "json" ? "font-mono text-[11px]" : "text-xs")}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      aria-label={`${field} value`}
      className="h-8 font-mono text-[11px]"
      name={name}
      type={kind === "number" ? "number" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function EntityReviewInput({
  candidates,
  field,
  initial,
  onChange,
}: {
  candidates: EntityCandidate[];
  field: string;
  initial: EntityCandidate | null;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <input type="hidden" name="value" value={value?.id ?? ""} />
      <EntityTypeahead
        name={`entity:${field}`}
        candidates={candidates}
        value={value}
        onChange={(candidate) => {
          setValue(candidate);
          onChange(candidate?.id ?? "");
        }}
      />
    </>
  );
}

// A short human hint for each basis, so the picker reads in plain language.
const basisLabels: Record<TimeBasisValue, string> = {
  COLLAPSE: "Since collapse",
  FLOOR_START: "After floor opened",
  FLOOR_COLLAPSE: "Before floor falls",
  EVENT: "Before/after an event",
  ABSOLUTE_DAY: "Absolute day",
  UNSCHEDULED: "Unscheduled",
};

// Structured editor for an event's typed `timeRef` (ADR 0004 slice 2): the DM
// edits basis + floor + offset + unit (+ a one-off label override) and the
// hidden `value` carries the normalized JSON. An EVENT-basis anchor id is
// preserved as-is (the review queue has no event typeahead yet — see PROGRESS).
function InGameTimeReviewInput({
  structured,
  onChange,
}: {
  structured: Extract<ReviewStructuredField, { kind: "inGameTime" }>;
  onChange: (value: string) => void;
}) {
  const [basis, setBasis] = useState<TimeBasisValue>(structured.basis);
  const [floor, setFloor] = useState(
    structured.floor == null ? "" : String(structured.floor),
  );
  const [offset, setOffset] = useState(
    structured.offset == null ? "" : String(structured.offset),
  );
  const [unit, setUnit] = useState<TimeUnitValue>(structured.unit ?? "DAY");
  const [label, setLabel] = useState(structured.label);

  const usesOffset = basis !== "UNSCHEDULED";
  const serialize = (next: {
    basis: TimeBasisValue;
    floor: string;
    offset: string;
    unit: TimeUnitValue;
    label: string;
  }) =>
    JSON.stringify({
      basis: next.basis,
      ...(next.floor.trim() ? { floor: Number(next.floor) } : {}),
      ...(structured.anchorEventId && next.basis === "EVENT"
        ? { anchorEventId: structured.anchorEventId }
        : {}),
      ...(next.basis !== "UNSCHEDULED" && next.offset.trim()
        ? { offset: Number(next.offset), unit: next.unit }
        : {}),
      ...(next.label.trim() ? { label: next.label.trim() } : {}),
    });
  const current = { basis, floor, offset, unit, label };
  const update = (patch: Partial<typeof current>) => {
    const next = { ...current, ...patch };
    onChange(serialize(next));
  };

  return (
    <div className="grid gap-2">
      <input type="hidden" name="value" value={serialize(current)} />
      <select
        aria-label="Time basis"
        className="h-8 w-full border border-[var(--line-strong)] bg-[var(--bg)] px-2 font-mono text-[11px] text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        value={basis}
        onChange={(event) => {
          const nextBasis = event.target.value as TimeBasisValue;
          setBasis(nextBasis);
          update({ basis: nextBasis });
        }}
      >
        {timeBasisValues.map((value) => (
          <option key={value} value={value}>
            {basisLabels[value]}
          </option>
        ))}
      </select>
      <div className="grid gap-2 sm:grid-cols-[90px_90px_minmax(0,1fr)]">
        <Input
          aria-label="In-game floor"
          min={1}
          max={18}
          placeholder="Floor"
          type="number"
          value={floor}
          onChange={(event) => {
            setFloor(event.target.value);
            update({ floor: event.target.value });
          }}
        />
        <Input
          aria-label="Time offset"
          placeholder="Offset"
          type="number"
          disabled={!usesOffset}
          value={offset}
          onChange={(event) => {
            setOffset(event.target.value);
            update({ offset: event.target.value });
          }}
        />
        <select
          aria-label="Time unit"
          disabled={!usesOffset}
          className="h-8 w-full border border-[var(--line-strong)] bg-[var(--bg)] px-2 font-mono text-[11px] text-[var(--ink)] disabled:opacity-50 focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          value={unit}
          onChange={(event) => {
            const nextUnit = event.target.value as TimeUnitValue;
            setUnit(nextUnit);
            update({ unit: nextUnit });
          }}
        >
          {timeUnitValues.map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <Input
        aria-label="In-game time label"
        placeholder="Label override (optional)"
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
          update({ label: event.target.value });
        }}
      />
    </div>
  );
}

function ParticipantsReviewInput({
  candidates,
  field,
  initial,
  onChange,
}: {
  candidates: EntityCandidate[];
  field: string;
  initial: { entity: EntityCandidate | null; role: ParticipantRole }[];
  onChange: (value: string) => void;
}) {
  const seed =
    initial.length > 0 ? initial : [{ entity: null, role: "ACTOR" as ParticipantRole }];
  const [rows, setRows] = useState(
    seed.map((row, index) => ({ key: index, ...row })),
  );
  const [nextKey, setNextKey] = useState(seed.length);
  // Floors are set via the time picker, not as participants (ADR 0008 §3).
  const pickable = withoutFloorCandidates(candidates);
  const update = (
    next: { key: number; entity: EntityCandidate | null; role: ParticipantRole }[],
  ) => {
    setRows(next);
    onChange(
      JSON.stringify(
        next
          .filter((row) => row.entity)
          .map((row) => ({ entityId: row.entity!.id, role: row.role })),
      ),
    );
  };
  const value = JSON.stringify(
    rows
      .filter((row) => row.entity)
      .map((row) => ({ entityId: row.entity!.id, role: row.role })),
  );

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="value" value={value} />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rows.length >= 20 || pickable.length === 0}
          onClick={() => {
            update([...rows, { key: nextKey, entity: null, role: "ACTOR" }]);
            setNextKey((current) => current + 1);
          }}
        >
          <Plus aria-hidden size={12} />
          Add participant
        </Button>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
        >
          <EntityTypeahead
            name={`participant:${field}:${row.key}`}
            candidates={pickable}
            value={row.entity}
            onChange={(entity) =>
              update(
                rows.map((item) =>
                  item.key === row.key ? { ...item, entity } : item,
                ),
              )
            }
          />
          <select
            aria-label="Participant role"
            value={row.role}
            onChange={(event) =>
              update(
                rows.map((item) =>
                  item.key === row.key
                    ? { ...item, role: event.target.value as ParticipantRole }
                    : item,
                ),
              )
            }
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
          >
            {eventParticipantRoleValues.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            aria-label="Remove participant"
            type="button"
            disabled={rows.length === 1}
            onClick={() => update(rows.filter((item) => item.key !== row.key))}
            className="inline-flex h-[34px] items-center justify-center border border-[var(--line)] px-[8px] text-[var(--ink-faint)] hover:text-[var(--no)] disabled:opacity-40"
          >
            <Trash2 aria-hidden size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
