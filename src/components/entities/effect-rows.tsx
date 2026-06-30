"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { effectStatLabels } from "@/lib/event-effects";
import {
  eventEffectKindMeta,
  eventEffectKindValues,
  eventEffectRequiresTarget,
  eventEffectStatValues,
  type EventEffectKind,
  type EventEffectStat,
} from "@/lib/event-effect-kinds";
import { PERSONA_DIAL_KEYS, PERSONA_DIAL_LABELS } from "@/lib/persona";

export type EffectRowValue = {
  id?: string;
  kind: EventEffectKind;
  target: EntityCandidate | null;
  stat: EventEffectStat;
  delta: string;
  valueNumber: string;
  // "alive" | "dead" — only meaningful for SET_ALIVE.
  alive: "alive" | "dead";
  // PERSONA_SHIFT: per-dial delta strings keyed by dial name (empty = no change).
  dialShifts: Record<string, string>;
  // GRANT_ACHIEVEMENT: the ACHIEVEMENT entity granted to the crawler `target`.
  achievement: EntityCandidate | null;
  note: string;
};


// Convert a stored dialShifts map (numbers) into the editor's string form.
export function dialShiftsToStrings(
  dialShifts: Record<string, number> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (dialShifts) {
    for (const [key, value] of Object.entries(dialShifts)) out[key] = String(value);
  }
  return out;
}

// Seed an editor row from a projected event effect, resolving the target name
// from the right candidate pool for the effect's kind (crawler vs. SYSTEM_AI
// persona), plus the granted achievement for GRANT_ACHIEVEMENT. Shared by the
// entity + campaign timeline edit forms.
export function effectViewToRow(
  effect: {
    id: string;
    kind: EventEffectKind;
    targetId: string | null;
    stat: EventEffectStat | null;
    delta: number | null;
    valueNumber: number | null;
    value: boolean | null;
    dialShifts: Record<string, number> | null;
    achievementId: string | null;
    note: string | null;
  },
  options: {
    crawlerCandidates: EntityCandidate[];
    personaCandidates: EntityCandidate[];
    achievementCandidates?: EntityCandidate[];
    resolveName: (targetId: string) => string;
  },
): EffectRowValue {
  const isPersona = eventEffectKindMeta[effect.kind].target === "PERSONA";
  const pool = isPersona ? options.personaCandidates : options.crawlerCandidates;
  const achievementPool = options.achievementCandidates ?? [];
  return {
    id: effect.id,
    kind: effect.kind,
    target: effect.targetId
      ? pool.find((candidate) => candidate.id === effect.targetId) ?? {
          id: effect.targetId,
          name: options.resolveName(effect.targetId),
          type: isPersona ? "SYSTEM_AI" : "CRAWLER",
        }
      : null,
    stat: effect.stat ?? "gold",
    delta: effect.delta != null ? String(effect.delta) : "",
    valueNumber: effect.valueNumber != null ? String(effect.valueNumber) : "",
    alive: effect.value ? "alive" : "dead",
    dialShifts: dialShiftsToStrings(effect.dialShifts),
    achievement: effect.achievementId
      ? achievementPool.find((candidate) => candidate.id === effect.achievementId) ?? {
          id: effect.achievementId,
          name: options.resolveName(effect.achievementId),
          type: "ACHIEVEMENT",
        }
      : null,
    note: effect.note ?? "",
  };
}

function emptyRow(): EffectRowValue {
  return {
    kind: "ADJUST_STAT",
    target: null,
    stat: "gold",
    delta: "",
    valueNumber: "",
    alive: "dead",
    dialShifts: {},
    achievement: null,
    note: "",
  };
}

/**
 * Editor for an event's structured effects (deltas applied to a crawler — or a
 * SYSTEM_AI persona — on approval). Emits indexed `effectKind_N` /
 * `effectTarget_N` / `effectStat_N` / `effectDelta_N` / `effectValueNumber_N` /
 * `effectValue_N` / `effectDial_N_<dial>` / `effectAchievement_N` /
 * `effectNote_N` / `effectId_N` fields counted by a hidden `effectCount`, parsed
 * by `parseEffectRows`. `candidates` are the campaign's crawler entities (the
 * valid targets for stat/alive/grant effects); `personaCandidates` are the
 * SYSTEM_AI entities a PERSONA_SHIFT can drift; `achievementCandidates` are the
 * ACHIEVEMENT entities a GRANT_ACHIEVEMENT can grant.
 */
export function EffectRows({
  candidates,
  personaCandidates = [],
  achievementCandidates = [],
  initial,
  allowAdd = true,
  searchCandidates,
  searchPersonaCandidates,
  searchAchievementCandidates,
}: {
  candidates: EntityCandidate[];
  personaCandidates?: EntityCandidate[];
  achievementCandidates?: EntityCandidate[];
  initial?: EffectRowValue[];
  allowAdd?: boolean;
  searchCandidates?: (query: string) => Promise<EntityCandidate[]>;
  searchPersonaCandidates?: (query: string) => Promise<EntityCandidate[]>;
  searchAchievementCandidates?: (query: string) => Promise<EntityCandidate[]>;
}) {
  const [rows, setRows] = useState(
    (initial ?? []).map((row, index) => ({ key: index, ...row })),
  );
  const [nextKey, setNextKey] = useState(initial?.length ?? 0);

  const addRow = () => {
    if (rows.length >= 20) return;
    setRows((current) => [...current, { key: nextKey, ...emptyRow() }]);
    setNextKey((current) => current + 1);
  };

  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const patchRow = (key: number, patch: Partial<EffectRowValue>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="effectCount" value={rows.length} />
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
          Effects
        </span>
        {allowAdd && (
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= 20}
            className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)] disabled:opacity-50"
          >
            <Plus aria-hidden size={11} />
            Add effect
          </button>
        )}
      </div>
      {candidates.length === 0 && (
        <p className="text-[10.5px] text-[var(--ink-faint)]">
          No crawlers in this campaign — only floor effects can be applied.
        </p>
      )}
      {rows.map((row, index) => (
        <div
          key={row.key}
          className="flex flex-col gap-2 border border-[var(--line)] bg-[var(--bg)] px-[8px] py-[7px]"
        >
          {row.id ? (
            <input type="hidden" name={`effectId_${index}`} value={row.id} />
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
            <select
              name={`effectKind_${index}`}
              aria-label="Effect kind"
              value={row.kind}
              onChange={(event) =>
                patchRow(row.key, { kind: event.target.value as EventEffectKind })
              }
              className="self-start border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
            >
              {eventEffectKindValues.map((kind) => (
                <option key={kind} value={kind}>
                  {eventEffectKindMeta[kind].label}
                </option>
              ))}
            </select>
            {eventEffectRequiresTarget(row.kind) ? (
              <EntityTypeahead
                name={`effectTarget_${index}`}
                candidates={
                  eventEffectKindMeta[row.kind].target === "PERSONA"
                    ? personaCandidates
                    : candidates
                }
                searchCandidates={
                  eventEffectKindMeta[row.kind].target === "PERSONA"
                    ? searchPersonaCandidates
                    : searchCandidates
                }
                value={row.target}
                onChange={(target) => patchRow(row.key, { target })}
                placeholder={
                  eventEffectKindMeta[row.kind].target === "PERSONA"
                    ? "Search System AI..."
                    : "Search crawler..."
                }
              />
            ) : (
              <span className="self-center font-mono text-[10.5px] text-[var(--ink-faint)]">
                Acts on this event&rsquo;s floor
              </span>
            )}
            <button
              type="button"
              title="Remove effect row"
              onClick={() => removeRow(row.key)}
              className="inline-flex h-[34px] items-center justify-center border border-[var(--line)] px-[8px] text-[var(--ink-faint)] hover:text-[var(--no)]"
            >
              <Trash2 aria-hidden size={12} />
            </button>
          </div>
          {eventEffectKindMeta[row.kind].usesStat ? (
            <div className="grid gap-2 sm:grid-cols-[150px_120px]">
              <select
                name={`effectStat_${index}`}
                aria-label="Stat to adjust"
                value={row.stat}
                onChange={(event) =>
                  patchRow(row.key, { stat: event.target.value as EventEffectStat })
                }
                className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
              >
                {eventEffectStatValues.map((stat) => (
                  <option key={stat} value={stat}>
                    {effectStatLabels[stat]}
                  </option>
                ))}
              </select>
              <input
                name={
                  row.kind === "ADJUST_STAT"
                    ? `effectDelta_${index}`
                    : `effectValueNumber_${index}`
                }
                type="number"
                aria-label={row.kind === "ADJUST_STAT" ? "Delta" : "Value"}
                value={row.kind === "ADJUST_STAT" ? row.delta : row.valueNumber}
                onChange={(event) =>
                  patchRow(
                    row.key,
                    row.kind === "ADJUST_STAT"
                      ? { delta: event.target.value }
                      : { valueNumber: event.target.value },
                  )
                }
                placeholder={row.kind === "ADJUST_STAT" ? "± amount" : "Value"}
                className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
              />
            </div>
          ) : eventEffectKindMeta[row.kind].usesAlive ? (
            <select
              name={`effectValue_${index}`}
              aria-label="Alive or dead"
              value={row.alive}
              onChange={(event) =>
                patchRow(row.key, { alive: event.target.value as "alive" | "dead" })
              }
              className="w-[150px] border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
            >
              <option value="dead">Mark dead</option>
              <option value="alive">Mark alive</option>
            </select>
          ) : eventEffectKindMeta[row.kind].usesDials ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {PERSONA_DIAL_KEYS.map((dial) => (
                <label
                  key={dial}
                  className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]"
                >
                  {PERSONA_DIAL_LABELS[dial]}
                  <input
                    name={`effectDial_${index}_${dial}`}
                    type="number"
                    aria-label={`${PERSONA_DIAL_LABELS[dial]} shift`}
                    value={row.dialShifts[dial] ?? ""}
                    onChange={(event) =>
                      patchRow(row.key, {
                        dialShifts: { ...row.dialShifts, [dial]: event.target.value },
                      })
                    }
                    placeholder="±0"
                    className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[5px] text-right text-[12px] text-[var(--ink)]"
                  />
                </label>
              ))}
            </div>
          ) : eventEffectKindMeta[row.kind].usesAchievement ? (
            <EntityTypeahead
              name={`effectAchievement_${index}`}
              candidates={achievementCandidates}
              searchCandidates={searchAchievementCandidates}
              value={row.achievement}
              onChange={(achievement) => patchRow(row.key, { achievement })}
              placeholder="Search achievement..."
            />
          ) : null}
          <input
            name={`effectNote_${index}`}
            maxLength={200}
            value={row.note}
            onChange={(event) => patchRow(row.key, { note: event.target.value })}
            aria-label="Effect note"
            placeholder="Note (optional)"
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
          />
        </div>
      ))}
    </div>
  );
}
