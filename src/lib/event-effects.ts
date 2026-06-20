import { PERSONA_DIAL_KEYS, PERSONA_DIAL_LABELS } from "@/lib/persona";
import type { EventEffectStat } from "@/lib/validation";
import type { EventEffectView } from "@/server/services/events";

// Human labels for the crawler stats an event effect can update.
export const effectStatLabels: Record<EventEffectStat, string> = {
  gold: "Gold",
  hp: "HP",
  mp: "MP",
  level: "Level",
  killCount: "Kills",
  currentFloor: "Floor",
};

// "Resentment +20, Compliance −15" from a PERSONA_SHIFT's dial deltas, in
// canonical dial order; unknown/zero deltas dropped. Falls back to a generic
// label when no meaningful delta survives.
export function describeDialShifts(dialShifts: Record<string, number> | null | undefined): string {
  const parts = PERSONA_DIAL_KEYS.map((key) => [key, dialShifts?.[key]] as const)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => `${PERSONA_DIAL_LABELS[key]} ${value! >= 0 ? "+" : "−"}${Math.abs(value!)}`);
  return parts.length > 0 ? parts.join(", ") : "no change";
}

// Compact, target-agnostic description of an effect's update, e.g. "Gold +500",
// "Floor = 1", or "Marked dead". The target name is rendered separately by the caller.
export function describeEffect(effect: EventEffectView): string {
  if (effect.kind === "COLLAPSE_FLOOR") {
    return "Floor collapses → next floor opens";
  }
  if (effect.kind === "PERSONA_SHIFT") {
    return `Persona shift: ${describeDialShifts(effect.dialShifts)}`;
  }
  if (effect.kind === "SET_ALIVE") {
    return effect.value ? "Revived (alive)" : "Marked dead";
  }
  const label = effect.stat ? effectStatLabels[effect.stat] : "Stat";
  if (effect.kind === "SET_STAT") {
    return `${label} = ${effect.valueNumber ?? "?"}`;
  }
  const delta = effect.delta ?? 0;
  return `${label} ${delta >= 0 ? "+" : ""}${delta}`;
}
