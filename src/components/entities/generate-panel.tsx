"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { fleshOutEntityAction, type GenerateActionState } from "@/app/(dm)/actions";
import { Kicker } from "@/components/ui/kicker";

// AI generation panel on the entity detail rail (M4 — docs/04-ai-integration.md).
// DM-only, and shown only when the campaign has a provider key configured.
// "Flesh out" produces a PENDING proposal in the Review Queue (never canon —
// invariant #1), so the success state links there rather than mutating the page.
// Field-level locks are respected by the generator (invariant #2); a fully
// locked entity is rejected with a safe message.

function FleshButton({ locked }: { locked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || locked}
      title={
        locked
          ? "Entity is locked — unlock it to generate"
          : "Generate a richer summary, description, and tags as a review proposal"
      }
      className="inline-flex items-center gap-[6px] border px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={12} />
      {pending ? "Generating…" : "Flesh out"}
    </button>
  );
}

export function GeneratePanel({
  campaignId,
  entityId,
  locked,
}: {
  campaignId: string;
  entityId: string;
  locked: boolean;
}) {
  const [state, formAction] = useActionState<GenerateActionState, FormData>(
    fleshOutEntityAction.bind(null, campaignId, entityId),
    undefined,
  );

  return (
    <div>
      <Kicker dim noLead className="mb-3">
        AI generation
      </Kicker>
      <p className="mb-3 text-[11px] leading-[1.5] text-[var(--ink-faint)]">
        Draft a richer summary, description, and tags. The result lands in the
        Review Queue as a proposal — nothing becomes canon until you approve it.
      </p>
      <form action={formAction}>
        <FleshButton locked={locked} />
      </form>
      {state?.error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="mt-2 text-[11px] text-[var(--ok)]">
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
  );
}
