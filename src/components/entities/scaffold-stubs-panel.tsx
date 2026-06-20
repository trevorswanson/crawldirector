"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { scaffoldStubsAction, type GenerateActionState } from "@/app/(dm)/actions";

// Bulk-stub scaffolding panel on the World Browser header (M4 —
// docs/04-ai-integration.md). DM-only, and rendered only when the campaign has a
// provider key configured. The DM describes what to scaffold; the result lands
// in the Review Queue as a single PENDING change set of stub creates (never
// canon — invariant #1), so the success state links there rather than mutating
// the page.

function ScaffoldSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[6px] border px-[12px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={12} />
      {pending ? "Scaffolding…" : "Scaffold stubs"}
    </button>
  );
}

export function ScaffoldStubsPanel({
  campaignId,
  embedded = false,
}: {
  campaignId: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [state, action] = useActionState<GenerateActionState, FormData>(
    scaffoldStubsAction.bind(null, campaignId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && formRef.current) formRef.current.reset();
  }, [state]);

  return (
    <>
      {!embedded && (
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
          Scaffold with AI
        </button>
      )}
      {open && (
        <div
          className={
            embedded
              ? "fade-in"
              : "fade-in order-last -mx-[22px] -mb-[14px] mt-0 w-[calc(100%+44px)] border-t border-[var(--line)] bg-[var(--bg-2)] px-[22px] py-[12px]"
          }
        >
          <p className="mb-2 text-[11px] leading-[1.5] text-[var(--ink-faint)]">
            Describe a set of entities to scaffold (e.g. “the shopkeepers and
            stalls of the Bone Market”). Each lands as a stub proposal in the
            Review Queue — nothing becomes canon until you approve it.
          </p>
          <form ref={formRef} action={action} className="flex flex-col gap-2">
            <textarea
              name="instruction"
              required
              rows={2}
              placeholder="What should I scaffold?"
              className="w-full resize-y rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <div className="flex items-center gap-3">
              <ScaffoldSubmit />
              {state?.error && (
                <p role="alert" className="text-[11px] text-[var(--no)]">
                  {state.error}
                </p>
              )}
              {state?.success && (
                <p className="text-[11px] text-[var(--ok)]">
                  {state.success}{" "}
                  <Link
                    href={`/campaigns/${campaignId}/review${state.changeSetId ? `?selected=${state.changeSetId}` : ""}`}
                    className="underline hover:text-[var(--ink)]"
                  >
                    Open Review Queue ↗
                  </Link>
                </p>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
