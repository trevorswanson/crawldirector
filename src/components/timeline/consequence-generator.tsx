"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  proposeEventConsequencesAction,
  type GenerateActionState,
} from "@/app/(dm)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[6px] border px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={12} />
      {pending ? "Generating…" : "Propose consequences"}
    </button>
  );
}

export function ConsequenceGenerator({ campaignId, eventId }: { campaignId: string; eventId: string }) {
  const [state, action] = useActionState<GenerateActionState, FormData>(
    proposeEventConsequencesAction.bind(null, campaignId, eventId),
    undefined,
  );

  return (
    <div className="mt-[11px] border-t border-[var(--line)] pt-[10px]">
      <p className="mb-2 text-[11px] leading-[1.5] text-[var(--ink-faint)]">
        Draft bounded effects and causal links for Review Queue approval.
      </p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <SubmitButton />
        {state?.error && <p role="alert" className="text-[11px] text-[var(--no)]">{state.error}</p>}
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
      </form>
    </div>
  );
}
