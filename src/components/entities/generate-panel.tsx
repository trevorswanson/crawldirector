"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  fleshOutEntityAction,
  inferRelationshipsForEntityAction,
  type GenerateActionState,
} from "@/app/(dm)/actions";
import { Kicker } from "@/components/ui/kicker";

// AI generation panel on the entity detail rail (M4 — docs/04-ai-integration.md).
// DM-only, and shown only when the campaign has a provider key configured.
// "Flesh out" produces a PENDING proposal in the Review Queue (never canon —
// invariant #1), so the success state links there rather than mutating the page.
// Field-level locks are respected by the generator (invariant #2); a fully
// locked entity is rejected with a safe message.

function GenerateButton({
  locked,
  idleLabel,
  pendingLabel,
  title,
}: {
  locked: boolean;
  idleLabel: string;
  pendingLabel: string;
  title: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || locked}
      title={
        locked
          ? "Entity is locked — unlock it to generate"
          : title
      }
      className="inline-flex items-center gap-[6px] border px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={12} />
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function ReviewQueueLink({
  campaignId,
  changeSetId,
  label = "Open Review Queue ↗",
}: {
  campaignId: string;
  changeSetId?: string;
  label?: string;
}) {
  return (
    <Link
      href={`/campaigns/${campaignId}/review${changeSetId ? `?selected=${changeSetId}` : ""}`}
      className="underline hover:text-[var(--ink)]"
    >
      {label}
    </Link>
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
  const [fleshState, fleshFormAction] = useActionState<GenerateActionState, FormData>(
    fleshOutEntityAction.bind(null, campaignId, entityId),
    undefined,
  );
  const [relationshipState, relationshipFormAction] = useActionState<GenerateActionState, FormData>(
    inferRelationshipsForEntityAction.bind(null, campaignId, entityId),
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
      <div className="flex flex-wrap gap-2">
        <form action={fleshFormAction}>
          <GenerateButton
            locked={locked}
            idleLabel="Flesh out"
            pendingLabel="Generating…"
            title="Generate a richer summary, description, and tags as a review proposal"
          />
        </form>
        <form action={relationshipFormAction}>
          <GenerateButton
            locked={locked}
            idleLabel="Infer relationships"
            pendingLabel="Inferring…"
            title="Propose likely relationships involving this entity"
          />
        </form>
      </div>
      {fleshState?.error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
          {fleshState.error}
        </p>
      )}
      {fleshState?.success && (
        <p className="mt-2 text-[11px] text-[var(--ok)]">
          {fleshState.success}{" "}
          <ReviewQueueLink campaignId={campaignId} changeSetId={fleshState.changeSetId} />
        </p>
      )}
      {relationshipState?.error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
          {relationshipState.error}
        </p>
      )}
      {relationshipState?.success && (
        <p className="mt-2 text-[11px] text-[var(--ok)]">
          {relationshipState.success}{" "}
          <ReviewQueueLink
            campaignId={campaignId}
            changeSetId={relationshipState.changeSetId}
            label="Open relationship proposals ↗"
          />
        </p>
      )}
    </div>
  );
}
