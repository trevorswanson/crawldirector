"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import type { SessionActionState } from "@/app/(dm)/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[6px] self-start border border-[var(--line-strong)] bg-[var(--bg-3)] px-[12px] py-[7px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus aria-hidden size={12} />
      {pending ? "Starting…" : "Start session"}
    </button>
  );
}

/** Start a new play session (title required; date/focus/notes optional).
 * Redirects to the new session's log on success. */
export function CreateSessionForm({
  action: submitAction,
}: {
  action: (prevState: SessionActionState, formData: FormData) => Promise<SessionActionState>;
}) {
  const [state, action] = useActionState<SessionActionState, FormData>(submitAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-[1fr_160px]">
        <Input name="title" placeholder="Session title" aria-label="Session title" required maxLength={200} />
        <Input name="playedAt" type="date" aria-label="Date played" />
      </div>
      <Input name="focus" placeholder="Floor/area in focus (optional)" aria-label="Focus" maxLength={200} />
      <Textarea
        name="notes"
        rows={2}
        placeholder="Prep notes (optional)…"
        aria-label="Prep notes"
        maxLength={4000}
      />
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state?.error && (
          <p role="alert" className="text-[11.5px] text-[var(--no)]">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
