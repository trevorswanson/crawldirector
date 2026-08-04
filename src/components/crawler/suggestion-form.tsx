"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Lightbulb } from "lucide-react";

import type { SuggestionActionState } from "@/app/(player)/actions";

// The M7 "Suggestions" submit form: a player proposes an edit to their own
// crawler's bio (`summary`) and/or notes (`description`) — the only two
// fields the surface exposes (docs/10-ui-ux.md). Submitting never writes
// canon directly; it files a PENDING `PLAYER_SUGGESTION` change set the DM
// reviews like any other proposal (invariant #1). Route-agnostic like
// AskPanel: takes a pre-bound campaign action rather than a campaignId.

type SuggestionFormAction = (
  prevState: SuggestionActionState,
  formData: FormData,
) => Promise<SuggestionActionState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[7px] border px-[14px] py-[8px] font-mono text-[11px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--player)",
        background: "color-mix(in srgb, var(--player) 12%, transparent)",
        color: "var(--player)",
      }}
    >
      <Lightbulb aria-hidden size={13} />
      {pending ? "Submitting…" : "Submit suggestion"}
    </button>
  );
}

const FIELD_CLASS =
  "field-shell w-full resize-y rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-[14px] py-[11px] text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--ring)]";

export function SuggestionForm({
  action: submitAction,
  currentSummary,
  currentDescription,
}: {
  /** The route's campaign-bound "submit suggestion" server action. */
  action: SuggestionFormAction;
  currentSummary: string | null;
  currentDescription: string | null;
}) {
  const [state, action] = useActionState<SuggestionActionState, FormData>(
    submitAction,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-[7px]">
        <label
          htmlFor="summary"
          className="font-mono text-[9.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]"
        >
          Bio
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={2}
          maxLength={500}
          defaultValue={currentSummary ?? ""}
          placeholder="A short line about your crawler…"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-[7px]">
        <label
          htmlFor="description"
          className="font-mono text-[9.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]"
        >
          Notes
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={10000}
          defaultValue={currentDescription ?? ""}
          placeholder="Longer notes, backstory, anything you want your DM to know…"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
        <p className="text-[11px] text-[var(--ink-faint)]">
          Sent to your DM for review — never applied automatically.
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="text-[12px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-[12px] text-[var(--ok)]">{state.success}</p>
      )}
    </form>
  );
}
