"use client";

import { useState } from "react";
import { Pencil, Save } from "lucide-react";

import {
  EffectRows,
  effectViewToRow,
} from "@/components/entities/effect-rows";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";
import { Button } from "@/components/ui/button";
import { describeDialShifts, effectStatLabels } from "@/lib/event-effects";
import type { EventEffectKind, EventEffectStat } from "@/lib/validation";

// Serializable seed for one reviewed effect, read off the operation's patch
// (or its prior editedPatch) by the server. Mirrors the stored effect shape
// minus the review-pointer bookkeeping the editor never touches.
export type ReviewEffectSeed = {
  id: string;
  kind: EventEffectKind;
  // Null for subject-derived kinds (COLLAPSE_FLOOR) that carry no crawler target.
  targetEntityId: string | null;
  stat: EventEffectStat | null;
  delta: number | null;
  valueNumber: number | null;
  value: boolean | null;
  // PERSONA_SHIFT: per-dial integer deltas. Null for non-persona kinds.
  dialShifts: Record<string, number> | null;
  // GRANT_ACHIEVEMENT: the ACHIEVEMENT entity granted. Null for non-grant kinds.
  achievementEntityId: string | null;
  note: string | null;
  before?: number | boolean | null;
  after?: number | boolean | null;
};

/**
 * Structured editor for a pending APPLY_EVENT_EFFECTS operation, replacing the
 * Review Queue's generic JSON patch textarea. A DM can correct each effect's
 * kind / target crawler / stat / delta / value before approval; Save submits an
 * EDITED decision via `editEventEffectsOperationAction`. `candidates` are the
 * campaign's crawler entities (the only valid effect targets).
 */
// Compact, target-prefixed description of one effect for the read-only summary,
// e.g. "Gold +500", "HP = 40", "Marked dead".
function describeSeed(
  seed: ReviewEffectSeed,
  resolveName?: (entityId: string) => string,
): string {
  if (seed.kind === "COLLAPSE_FLOOR") {
    return "Floor collapses — closes the current floor and opens the next the same day";
  }
  if (seed.kind === "PERSONA_SHIFT") {
    return `Persona shift: ${describeDialShifts(seed.dialShifts)}`;
  }
  if (seed.kind === "GRANT_ACHIEVEMENT") {
    const name = seed.achievementEntityId ? resolveName?.(seed.achievementEntityId) : null;
    return name ? `Earns achievement: ${name}` : "Earns achievement";
  }
  if (seed.before !== undefined && seed.after !== undefined) {
    const label =
      seed.kind === "SET_ALIVE"
        ? ""
        : `${seed.stat ? effectStatLabels[seed.stat] : "Stat"} `;
    return `${label}${formatEffectValue(seed.before, seed.kind)} → ${formatEffectValue(seed.after, seed.kind)}`;
  }
  if (seed.kind === "SET_ALIVE") return seed.value ? "Revived (alive)" : "Marked dead";
  const label = seed.stat ? effectStatLabels[seed.stat] : "Stat";
  if (seed.kind === "SET_STAT") return `${label} = ${seed.valueNumber ?? "?"}`;
  const delta = seed.delta ?? 0;
  return `${label} ${delta >= 0 ? "+" : ""}${delta}`;
}

function formatEffectValue(
  value: number | boolean | null,
  kind: ReviewEffectSeed["kind"],
) {
  if (value === null) return "Unset";
  if (kind === "SET_ALIVE" && typeof value === "boolean") {
    return value ? "Alive" : "Dead";
  }
  return typeof value === "number" ? value.toLocaleString("en-US") : String(value);
}

export function EffectOperationEditor({
  action,
  candidates,
  personaCandidates = [],
  achievementCandidates = [],
  effects,
  rejected,
  readOnly = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  candidates: EntityCandidate[];
  personaCandidates?: EntityCandidate[];
  achievementCandidates?: EntityCandidate[];
  effects: ReviewEffectSeed[];
  rejected: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const candidatesById = new Map(
    [...candidates, ...personaCandidates, ...achievementCandidates].map(
      (candidate) => [candidate.id, candidate],
    ),
  );
  const resolveName = (entityId: string) =>
    candidatesById.get(entityId)?.name ?? entityId;

  if (!editing) {
    return (
      <div className={rejected ? "opacity-45" : undefined}>
        <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {effects.length === 0 ? (
            <p className="px-3 py-[9px] text-[12.5px] text-[var(--ink-faint)]">
              No effects in this proposal.
            </p>
          ) : (
            effects.map((seed, index) => (
              <div
                key={seed.id || index}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-[9px] text-[12.5px] leading-[1.5]"
              >
                <div className="min-w-0">
                  {seed.targetEntityId && (
                    <span className="font-semibold text-[var(--ink)]">
                      {candidatesById.get(seed.targetEntityId)?.name ?? seed.targetEntityId}
                    </span>
                  )}
                  <span className={`text-[var(--add)]${seed.targetEntityId ? " mx-[7px]" : ""}`}>
                    {describeSeed(seed, resolveName)}
                  </span>
                  {seed.note && (
                    <span className="text-[var(--ink-faint)]">— {seed.note}</span>
                  )}
                </div>
                {!rejected && !readOnly && (
                  <Button
                    aria-label={`Edit effect ${index + 1}`}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil aria-hidden size={12} />
                    Edit
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const initial = effects.map((seed) =>
    effectViewToRow(
      { ...seed, targetId: seed.targetEntityId, achievementId: seed.achievementEntityId },
      {
        crawlerCandidates: candidates,
        personaCandidates,
        achievementCandidates,
        // Unresolved targets (e.g. an archived entity) fall back to a bare id so
        // the typeahead still submits the original target rather than dropping it.
        resolveName: (id) => id,
      },
    ),
  );
  return (
    <form action={action}>
      <div className="border-t border-[var(--line)] px-3 py-3">
        <EffectRows
          candidates={candidates}
          personaCandidates={personaCandidates}
          achievementCandidates={achievementCandidates}
          initial={initial}
          allowAdd={false}
        />
      </div>
      <div className="flex gap-2 border-t border-[var(--line)] px-3 py-3">
        <Button type="submit" size="sm" variant="outline">
          <Save aria-hidden size={14} />
          Save effects
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
