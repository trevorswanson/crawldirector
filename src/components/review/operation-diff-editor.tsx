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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewInputKind } from "@/lib/review";
import { eventParticipantRoleValues } from "@/lib/validation";
import { cn } from "@/lib/utils";

type FieldDecision = "ACCEPTED" | "PENDING" | "REJECTED";
type ParticipantRole = (typeof eventParticipantRoleValues)[number];

export type ReviewStructuredField =
  | { kind: "entity"; value: EntityCandidate | null }
  | { kind: "inGameTime"; floor: number | null; label: string }
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
  decision: FieldDecision;
  editing: boolean;
  draft: string;
};

/**
 * Read-first operation diff. Each field renders as a before/after diff
 * (mockup `screen-review.jsx`); a DM Accepts / Rejects / Edits per field, and
 * only an Edit reveals an input. Saving persists an EDITED decision via
 * `editChangeOperationPatchAction` (accepted fields → `editedPatch`); rejected
 * fields are omitted. Op-level Accept all / Reject (in the header) handle the
 * bulk path. Blocked fields are display-only.
 */
export function OperationDiffEditor({
  action,
  fields,
  opRejected,
  readOnly = false,
  candidates = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: ReviewFieldInit[];
  opRejected: boolean;
  readOnly?: boolean;
  candidates?: EntityCandidate[];
}) {
  const [state, setState] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.field,
        { decision: field.decision, editing: field.editing, draft: field.draft },
      ]),
    ),
  );

  const patchField = (name: string, patch: Partial<FieldState>) =>
    setState((current) => ({ ...current, [name]: { ...current[name], ...patch } }));

  const dirty = fields.some((field) => {
    const fs = state[field.field];
    return (
      fs.decision !== field.decision ||
      fs.editing !== field.editing ||
      fs.draft !== field.draft
    );
  });

  return (
    <form action={action}>
      {fields.map((field) => {
        const fs = state[field.field];
        const rejected = opRejected || fs.decision === "REJECTED";

        return (
          <div
            key={field.field}
            className={cn(
              "grid grid-cols-[92px_minmax(0,1fr)_auto] items-start gap-3 border-t border-[var(--line)] px-3 py-[9px]",
              field.blocked && "bg-[color-mix(in_srgb,var(--sys)_7%,transparent)]",
              rejected && "opacity-45",
            )}
          >
            <div className="font-mono text-[10.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              {field.field}
            </div>

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

              {fs.editing && !field.blocked ? (
                <div className="mt-1">
                  <input type="hidden" name="field" value={field.field} />
                  <input type="hidden" name={`kind:${field.field}`} value={field.kind} />
                  {fs.decision === "ACCEPTED" && (
                    <input type="hidden" name={`apply:${field.field}`} value="on" />
                  )}
                  <ValueInput
                    field={field.field}
                    kind={field.kind}
                    value={fs.draft}
                    structured={field.structured}
                    candidates={candidates}
                    onChange={(draft) => patchField(field.field, { draft })}
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
                  {/* Carry the accepted (non-editing) value so Save persists it. */}
                  {!field.blocked && (
                    <>
                      <input type="hidden" name="field" value={field.field} />
                      <input type="hidden" name={`kind:${field.field}`} value={field.kind} />
                      <input type="hidden" name={`value:${field.field}`} value={field.draft} />
                      {fs.decision === "ACCEPTED" && (
                        <input type="hidden" name={`apply:${field.field}`} value="on" />
                      )}
                    </>
                  )}
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

            {!field.blocked && !opRejected && !readOnly ? (
              <div className="flex gap-1">
                <FieldToggle
                  active={fs.decision === "ACCEPTED"}
                  label={`Accept ${field.field}`}
                  color="var(--ok)"
                  onClick={() =>
                    patchField(field.field, {
                      decision:
                        fs.decision === "ACCEPTED" ? "PENDING" : "ACCEPTED",
                    })
                  }
                >
                  <Check aria-hidden size={13} />
                </FieldToggle>
                <FieldToggle
                  active={fs.decision === "REJECTED"}
                  label={`Reject ${field.field}`}
                  color="var(--no)"
                  onClick={() =>
                    patchField(field.field, {
                      decision:
                        fs.decision === "REJECTED" ? "PENDING" : "REJECTED",
                      editing: false,
                    })
                  }
                >
                  <X aria-hidden size={13} />
                </FieldToggle>
                <FieldToggle
                  active={fs.editing}
                  label={`Edit ${field.field}`}
                  color="var(--accent)"
                  onClick={() =>
                    patchField(
                      field.field,
                      fs.editing
                        ? { editing: false, draft: field.draft }
                        : { editing: true, decision: "ACCEPTED" },
                    )
                  }
                >
                  <Pencil aria-hidden size={12} />
                </FieldToggle>
              </div>
            ) : (
              <div className="w-[84px]" />
            )}
          </div>
        );
      })}

      {!readOnly && !opRejected && (
        <div className="border-t border-[var(--line)] px-3 py-3">
          <Button type="submit" size="sm" variant="outline" disabled={!dirty}>
            <Save aria-hidden size={14} />
            Save field edits
          </Button>
        </div>
      )}
    </form>
  );
}

function FieldToggle({
  active,
  label,
  color,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
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
  const name = `value:${field}`;
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
    return (
      <InGameTimeReviewInput
        field={field}
        floor={structured.floor}
        label={structured.label}
        onChange={onChange}
      />
    );
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
      <input type="hidden" name={`value:${field}`} value={value?.id ?? ""} />
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

function InGameTimeReviewInput({
  field,
  floor: initialFloor,
  label: initialLabel,
  onChange,
}: {
  field: string;
  floor: number | null;
  label: string;
  onChange: (value: string) => void;
}) {
  const [floor, setFloor] = useState(initialFloor == null ? "" : String(initialFloor));
  const [label, setLabel] = useState(initialLabel);
  const update = (nextFloor: string, nextLabel: string) => {
    const value = JSON.stringify({
      ...(nextFloor.trim() ? { floor: Number(nextFloor) } : {}),
      ...(nextLabel.trim() ? { label: nextLabel.trim() } : {}),
    });
    onChange(value);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
      <input type="hidden" name={`value:${field}`} value={JSON.stringify({
        ...(floor.trim() ? { floor: Number(floor) } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      })} />
      <Input
        aria-label="In-game floor"
        min={1}
        max={18}
        placeholder="Floor"
        type="number"
        value={floor}
        onChange={(event) => {
          setFloor(event.target.value);
          update(event.target.value, label);
        }}
      />
      <Input
        aria-label="In-game time label"
        placeholder="Time label"
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
          update(floor, event.target.value);
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
      <input type="hidden" name={`value:${field}`} value={value} />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rows.length >= 20 || candidates.length === 0}
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
            candidates={candidates}
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
