"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import type { SessionRecapActionState } from "@/app/(dm)/actions";

// Session recap (M8 slice 4 — docs/08-session-mode.md "Recaps & broadcasts"). A
// one-button generator: no input fields, since the recap is derived entirely
// from this session's own log + promoted events. Ephemeral like "Ask" — the
// panel has no "save" affordance, and regenerating simply replaces the shown
// text (nothing is persisted server-side).

type SessionRecapFormAction = (
  prevState: SessionRecapActionState,
  formData: FormData,
) => Promise<SessionRecapActionState>;

function GenerateRecapSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[7px] border px-[14px] py-[8px] font-mono text-[11px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--ai)",
        background: "color-mix(in srgb, var(--ai) 12%, transparent)",
        color: "var(--ai)",
      }}
    >
      <Sparkles aria-hidden size={13} />
      {pending ? "Generating recap…" : "Generate recap"}
    </button>
  );
}

export function SessionRecapPanel({ action: submitAction }: { action: SessionRecapFormAction }) {
  const [state, action] = useActionState<SessionRecapActionState, FormData>(submitAction, undefined);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
          Session recap · &ldquo;Previously on Dungeon Crawler World&rdquo;
        </p>
        <form action={action}>
          <GenerateRecapSubmit />
        </form>
      </div>

      {state?.error && (
        <p role="alert" className="text-[12px] text-[var(--no)]">
          {state.error}
        </p>
      )}

      {state?.recap ? (
        <div className="panel flex flex-col gap-3 p-[18px]">
          <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-[var(--ink)]">
            {state.recap}
          </p>
          {state.model && (
            <p className="font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              {state.model}
            </p>
          )}
        </div>
      ) : (
        !state?.error && (
          <p className="text-[12px] text-[var(--ink-faint)]">
            Generate a &ldquo;previously on&hellip;&rdquo; summary from this session&rsquo;s log and
            any events it promoted. Flavor narration, not canon — never saved.
          </p>
        )
      )}
    </div>
  );
}
