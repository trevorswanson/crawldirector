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
// meaning (hybrid) rather than keywords alone. Embeddings are derived data, but
// the manual rebuild is disabled while one is already QUEUED/RUNNING so a DM
// cannot accidentally queue overlapping paid embedding work.

type ActiveSemanticJob = {
  id: string;
  status: "QUEUED" | "RUNNING";
  createdAt: Date;
  startedAt: Date | null;
};

function BuildSubmit({ activeStatus }: { activeStatus?: "QUEUED" | "RUNNING" }) {
  const { pending } = useFormStatus();
  const activeLabel =
    activeStatus === "RUNNING"
      ? "Semantic index running"
      : activeStatus === "QUEUED"
        ? "Semantic index queued"
        : null;
  return (
    <button
      type="submit"
      disabled={pending || Boolean(activeStatus)}
      className="inline-flex items-center gap-[6px] border px-[12px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={12} />
      {pending ? "Queuing…" : (activeLabel ?? "Build semantic index")}
    </button>
  );
}

export function BuildSemanticIndexButton({
  campaignId,
  activeJob = null,
}: {
  campaignId: string;
  activeJob?: ActiveSemanticJob | null;
}) {
  const [state, action] = useActionState<GenerateActionState, FormData>(
    enqueueBuildSemanticIndexAction.bind(null, campaignId),
    undefined,
  );
  const activeStatus = state?.activeJobStatus ?? activeJob?.status;
  const activeMessage =
    activeStatus === "RUNNING"
      ? "Semantic index job is running. Check the Job Queue for status."
      : activeStatus === "QUEUED"
        ? "Semantic index job is queued. Check the Job Queue for status."
        : null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <BuildSubmit activeStatus={activeStatus} />
      {state?.error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[11px] text-[var(--ok)]">{state.success}</p>}
      {!state?.success && activeMessage && (
        <p className="text-[11px] text-[var(--ink-faint)]">{activeMessage}</p>
      )}
    </form>
  );
}
