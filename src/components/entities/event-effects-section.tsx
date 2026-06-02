"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

import type { EventActionState } from "@/app/(dm)/actions";
import { describeEffect } from "@/lib/event-effects";
import type { EventEffectView } from "@/server/services/events";

/**
 * Read-side display of an event's declared effects plus an Apply control. Shared
 * by the entity Timeline panel and the campaign timeline. Effects are DM-only
 * (the service never projects them to players), so this only renders for DMs.
 * `onApply` routes APPLY_EVENT_EFFECTS through the pipeline and may return an
 * error (e.g. a locked target), which is surfaced without losing the list.
 */
export function EventEffectsSection({
  effects,
  resolveName,
  onApply,
}: {
  effects: EventEffectView[];
  resolveName: (targetId: string) => string;
  onApply: () => Promise<EventActionState>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (effects.length === 0) return null;
  const unapplied = effects.filter(
    (effect) => !effect.applied && effect.reviewStatus === null,
  );

  const apply = async () => {
    setError(null);
    setPending(true);
    const result = await onApply();
    setPending(false);
    if (result?.error) setError(result.error);
  };

  return (
    <div className="flex flex-col gap-[6px]">
      <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
        Effects
      </span>
      <ul className="flex flex-col gap-[4px]">
        {effects.map((effect) => (
          <li
            key={effect.id}
            className="flex flex-wrap items-center gap-x-[7px] gap-y-[2px] text-[11px] text-[var(--ink-dim)]"
          >
            <span className="text-[var(--ink)]">{resolveName(effect.targetId)}</span>
            <span className="text-[var(--ink-faint)]">·</span>
            <span>{describeEffect(effect)}</span>
            <span
              className="font-mono text-[8.5px] uppercase tracking-[.06em]"
              style={{ color: effect.applied ? "var(--ok)" : "var(--ink-faint)" }}
            >
              {effectStatusLabel(effect)}
            </span>
            {effect.note && (
              <span className="text-[var(--ink-faint)]">— {effect.note}</span>
            )}
          </li>
        ))}
      </ul>
      {unapplied.length > 0 && (
        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className="inline-flex w-fit items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          <Zap aria-hidden size={11} />
          {pending ? "Sending..." : "Send to review"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-[10.5px] text-[var(--no)]">
          {error}
        </p>
      )}
    </div>
  );
}

function effectStatusLabel(effect: EventEffectView) {
  if (effect.applied || effect.reviewStatus === "APPLIED") return "applied";
  if (effect.reviewStatus === "PENDING") return "pending review";
  if (effect.reviewStatus === "REJECTED") return "rejected";
  if (effect.reviewStatus === "SUPERSEDED") return "superseded";
  return "unapplied";
}
