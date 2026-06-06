"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { eventParticipantRoleValues } from "@/lib/validation";

type Role = (typeof eventParticipantRoleValues)[number];

export type ParticipantRowValue = { entity: EntityCandidate | null; role: Role };

/**
 * Shared participant editor used by every multi-participant event form (logging
 * and editing). Emits indexed `participantId_N` / `participantRole_N` fields
 * counted by a hidden `participantCount`, which the event actions parse via
 * `parseParticipantRows`. Pass `initial` to prefill existing participants.
 */
export function ParticipantRows({
  candidates,
  initial,
}: {
  candidates: EntityCandidate[];
  initial?: ParticipantRowValue[];
}) {
  const seed: ParticipantRowValue[] =
    initial && initial.length > 0 ? initial : [{ entity: null, role: "ACTOR" }];
  const [rows, setRows] = useState(seed.map((row, index) => ({ key: index, ...row })));
  const [nextKey, setNextKey] = useState(seed.length);

  const addRow = () => {
    if (rows.length >= 20) return;
    setRows((current) => [...current, { key: nextKey, entity: null, role: "ACTOR" }]);
    setNextKey((current) => current + 1);
  };

  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="participantCount" value={rows.length} />
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
          Participants
        </span>
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 20 || candidates.length === 0}
          className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)] disabled:opacity-50"
        >
          <Plus aria-hidden size={11} />
          Add participant
        </button>
      </div>
      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
          <EntityTypeahead
            name={`participantId_${index}`}
            candidates={candidates}
            value={row.entity}
            onChange={(entity) =>
              setRows((current) =>
                current.map((item) =>
                  item.key === row.key ? { ...item, entity } : item,
                ),
              )
            }
            placeholder="Search participant..."
          />
          <select
            name={`participantRole_${index}`}
            aria-label="Participant role"
            value={row.role}
            onChange={(event) =>
              setRows((current) =>
                current.map((item) =>
                  item.key === row.key
                    ? { ...item, role: event.target.value as Role }
                    : item,
                ),
              )
            }
            className="self-start border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
          >
            {eventParticipantRoleValues.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={
              rows.length === 1
                ? "An event needs at least one participant"
                : "Remove participant row"
            }
            onClick={() => removeRow(row.key)}
            disabled={rows.length === 1}
            className="inline-flex h-[34px] items-center justify-center border border-[var(--line)] px-[8px] text-[var(--ink-faint)] hover:text-[var(--no)] disabled:opacity-40"
          >
            <Trash2 aria-hidden size={12} />
          </button>
        </div>
      ))}
      {rows.length === 1 && (
        <p className="text-[10.5px] text-[var(--ink-faint)]">
          An event needs at least one participant. Add another to remove this one.
        </p>
      )}
    </div>
  );
}
