"use client";

import { Save } from "lucide-react";

import {
  EffectRows,
  type EffectRowValue,
} from "@/components/entities/effect-rows";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";
import { Button } from "@/components/ui/button";
import type { EventEffectKind, EventEffectStat } from "@/lib/validation";

// Serializable seed for one reviewed effect, read off the operation's patch
// (or its prior editedPatch) by the server. Mirrors the stored effect shape
// minus the review-pointer bookkeeping the editor never touches.
export type ReviewEffectSeed = {
  id: string;
  kind: EventEffectKind;
  targetEntityId: string;
  stat: EventEffectStat | null;
  delta: number | null;
  valueNumber: number | null;
  value: boolean | null;
  note: string | null;
};

function toRow(
  seed: ReviewEffectSeed,
  candidatesById: Map<string, EntityCandidate>,
): EffectRowValue {
  return {
    id: seed.id,
    kind: seed.kind,
    // Unresolved targets (e.g. an archived crawler) fall back to a bare id so
    // the typeahead still submits the original target rather than dropping it.
    target:
      candidatesById.get(seed.targetEntityId) ??
      (seed.targetEntityId
        ? { id: seed.targetEntityId, name: seed.targetEntityId, type: "CRAWLER" }
        : null),
    stat: seed.stat ?? "gold",
    delta: seed.delta != null ? String(seed.delta) : "",
    valueNumber: seed.valueNumber != null ? String(seed.valueNumber) : "",
    alive: seed.value === true ? "alive" : "dead",
    note: seed.note ?? "",
  };
}

/**
 * Structured editor for a pending APPLY_EVENT_EFFECTS operation, replacing the
 * Review Queue's generic JSON patch textarea. A DM can correct each effect's
 * kind / target crawler / stat / delta / value before approval; Save submits an
 * EDITED decision via `editEventEffectsOperationAction`. `candidates` are the
 * campaign's crawler entities (the only valid effect targets).
 */
export function EffectOperationEditor({
  action,
  candidates,
  effects,
  rejected,
}: {
  action: (formData: FormData) => void | Promise<void>;
  candidates: EntityCandidate[];
  effects: ReviewEffectSeed[];
  rejected: boolean;
}) {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const initial = effects.map((seed) => toRow(seed, candidatesById));

  return (
    <form action={action} className={rejected ? "opacity-45" : undefined}>
      <div className="border-t border-[var(--line)] px-3 py-3">
        <EffectRows candidates={candidates} initial={initial} />
      </div>
      <div className="border-t border-[var(--line)] px-3 py-3">
        <Button type="submit" size="sm" variant="outline">
          <Save aria-hidden size={14} />
          Save effects
        </Button>
      </div>
    </form>
  );
}
