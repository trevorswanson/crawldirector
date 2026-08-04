"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import type { PromoteSessionLogEntryActionState } from "@/app/(dm)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[5px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[9px] py-[5px] font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Promoting…" : "Create event"}
    </button>
  );
}

/**
 * Inline "promote to Event" affordance for one unpromoted log entry
 * (docs/08-session-mode.md). Collapsed to a single button by default; expands
 * to a one-field form (title only — the entry's own text becomes the event's
 * summary, its tagged entities become participants, server-side). On success
 * the parent session page's `revalidatePath` refreshes the entry with a set
 * `promotedEventId`, so `SessionLogList` swaps this form out for a static
 * "view event" link — no local success state to manage here.
 */
export function PromoteEntryForm({
  action,
  defaultTitle,
}: {
  action: (
    prevState: PromoteSessionLogEntryActionState,
    formData: FormData,
  ) => Promise<PromoteSessionLogEntryActionState>;
  defaultTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    const result = await action(undefined, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-[5px] font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        <Sparkles aria-hidden size={11} />
        Promote to event
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-center gap-[8px]">
      <input
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
        aria-label="Event title"
        className="min-w-[220px] flex-1 border border-[var(--line)] bg-[var(--bg-1)] px-[8px] py-[5px] text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
      <SubmitButton />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
    </form>
  );
}
