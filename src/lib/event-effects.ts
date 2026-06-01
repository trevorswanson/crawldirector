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

// Compact, target-agnostic description of an effect's update, e.g. "Gold +500",
// "Floor = 1", or "Marked dead". The target name is rendered separately by the caller.
export function describeEffect(effect: EventEffectView): string {
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
