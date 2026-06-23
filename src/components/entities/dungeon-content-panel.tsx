"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { generateDungeonContentAction, type GenerateActionState } from "@/app/(dm)/actions";
import { formatEntityType } from "@/lib/entities";
import { PERSONA_VOICED_ENTITY_TYPES } from "@/lib/persona";

// Dungeon-content generator panel (M6 — docs/05-system-ai-persona.md). DM-only,
// rendered inside the World Browser AI actions dialog only when the campaign has
// a provider key configured. The DM picks a persona-voiced kind and briefs the
// System AI on what to create; the result lands in the Review Queue as a single
// PENDING entity create (never canon — invariant #1), so the success state links
// there rather than mutating the page. When the campaign has an active System AI
// persona the generated flavor is written in its current voice.

function GenerateSubmit() {
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
      {pending ? "Generating…" : "Generate"}
    </button>
  );
}

export function DungeonContentPanel({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState<GenerateActionState, FormData>(
    generateDungeonContentAction.bind(null, campaignId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && formRef.current) formRef.current.reset();
  }, [state]);

  return (
    <div className="fade-in">
      <p className="mb-2 text-[11px] leading-[1.5] text-[var(--ink-faint)]">
        Brief the System AI to create one new piece of dungeon content (e.g. “a
        floor-3 boss themed around betrayal”). It writes in the active persona’s
        voice and lands as a proposal in the Review Queue — nothing becomes canon
        until you approve it.
      </p>
      <form ref={formRef} action={action} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
            Kind
          </span>
          <select
            name="type"
            defaultValue="BOSS"
            className="w-full rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
            {PERSONA_VOICED_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatEntityType(type)}
              </option>
            ))}
          </select>
        </label>
        <textarea
          name="brief"
          required
          rows={2}
          placeholder="What should the System AI create?"
          className="w-full resize-y rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
        <div className="flex items-center gap-3">
          <GenerateSubmit />
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
  );
}
