"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  enqueueBuildSemanticIndexAction,
  type GenerateActionState,
} from "@/app/(dm)/actions";

// "Build semantic index" control on the search page (M5 slice 4a — docs/07-
// search-retrieval.md). DM-only, and rendered only when the campaign has an
// embedding-capable provider configured. Enqueues an EMBED_SEARCH_DOCS job that
// the worker runs off the request path; once it finishes, search ranks by
// meaning (hybrid) rather than keywords alone. Embeddings are derived data —
// regenerable from canon — so this is safe to re-run any time.

function BuildSubmit() {
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
      {pending ? "Queuing…" : "Build semantic index"}
    </button>
  );
}

export function BuildSemanticIndexButton({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState<GenerateActionState, FormData>(
    enqueueBuildSemanticIndexAction.bind(null, campaignId),
    undefined,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <BuildSubmit />
      {state?.error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[11px] text-[var(--ok)]">{state.success}</p>}
    </form>
  );
}
