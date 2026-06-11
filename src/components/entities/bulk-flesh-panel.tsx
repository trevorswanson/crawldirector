"use client";

import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import type { EntityType } from "@/generated/prisma/client";
import {
  fleshOutEntitiesAction,
  type BulkGenerateActionState,
} from "@/app/(dm)/actions";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";

// Bulk multi-entity flesh-out panel on the World Browser header (M4 —
// docs/04-ai-integration.md). DM-only, rendered only when the campaign has a
// provider key configured and there are stub entities to flesh. The DM checks
// several stubs and runs them in one batch; each lands as its own PENDING
// `UPDATE_ENTITY` proposal in the Review Queue (never canon — invariant #1), so
// the success state links there and reports which entities were proposed vs
// skipped (and why) rather than mutating the page.

export type BulkFleshCandidate = { id: string; name: string; type: EntityType };

function BulkFleshSubmit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="inline-flex items-center gap-[6px] border px-[12px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={12} />
      {pending
        ? "Fleshing…"
        : count > 0
          ? `Flesh out ${count}`
          : "Flesh out"}
    </button>
  );
}

export function BulkFleshPanel({
  campaignId,
  candidates,
}: {
  campaignId: string;
  candidates: BulkFleshCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [handledRun, setHandledRun] = useState<number | undefined>(undefined);
  const [state, action] = useActionState<BulkGenerateActionState, FormData>(
    fleshOutEntitiesAction.bind(null, campaignId),
    undefined,
  );

  // Clear the selection once per successful run so a second run starts fresh.
  // Adjusting state during render (keyed off the run's timestamp) is the React-
  // recommended pattern for resetting state when an input changes — no effect.
  if (state?.proposedCount && state.timestamp !== handledRun) {
    setHandledRun(state.timestamp);
    setSelected(new Set());
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.id)));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-[6px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.06em] transition-[filter,color] hover:brightness-110"
        style={{
          borderColor: "var(--ai)",
          background: "color-mix(in srgb, var(--ai) 12%, transparent)",
          color: "var(--ai)",
        }}
        aria-expanded={open}
      >
        <Sparkles aria-hidden size={13} />
        Flesh out with AI
      </button>
      {open && (
        <div className="fade-in order-last -mx-[22px] -mb-[14px] mt-0 w-[calc(100%+44px)] border-t border-[var(--line)] bg-[var(--bg-2)] px-[22px] py-[12px]">
          <p className="mb-2 text-[11px] leading-[1.5] text-[var(--ink-faint)]">
            Pick the stub entities to flesh out. Each lands as its own draft
            proposal in the Review Queue — nothing becomes canon until you
            approve it.
          </p>
          <form action={action} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={toggleAll}
                className="font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                {selected.size} selected
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto border border-[var(--line)] bg-[var(--bg)]">
              {candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-[var(--line)] px-2.5 py-1.5 text-[12.5px] last:border-b-0 hover:bg-[var(--bg-2)]"
                >
                  <input
                    type="checkbox"
                    name="entityIds"
                    value={candidate.id}
                    checked={selected.has(candidate.id)}
                    onChange={() => toggle(candidate.id)}
                  />
                  <TypeDot type={candidate.type} />
                  <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                    {formatEntityType(candidate.type)}
                  </span>
                  <span className="text-[var(--ink)]">{candidate.name}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <BulkFleshSubmit count={selected.size} />
              {state?.error && (
                <p role="alert" className="text-[11px] text-[var(--no)]">
                  {state.error}
                </p>
              )}
              {state?.success && (
                <p className="text-[11px] text-[var(--ok)]">
                  {state.success}{" "}
                  <Link
                    href={`/campaigns/${campaignId}/review`}
                    className="underline hover:text-[var(--ink)]"
                  >
                    Open Review Queue ↗
                  </Link>
                </p>
              )}
            </div>
            {state?.outcomes && state.outcomes.length > 0 && (
              <ul className="flex flex-col gap-px text-[11px]">
                {state.outcomes.map((outcome, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className="font-mono text-[9px] uppercase tracking-[.08em]"
                      style={{
                        color:
                          outcome.status === "proposed"
                            ? "var(--ok)"
                            : "var(--ink-faint)",
                      }}
                    >
                      {outcome.status === "proposed" ? "Proposed" : "Skipped"}
                    </span>
                    <span className="text-[var(--ink-dim)]">{outcome.entityName}</span>
                    {outcome.detail && (
                      <span className="text-[var(--ink-faint)]">— {outcome.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>
      )}
    </>
  );
}
