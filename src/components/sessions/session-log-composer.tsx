"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { NotebookPen } from "lucide-react";

import type { SessionLogEntryActionState } from "@/app/(dm)/actions";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";
import { SessionTagPicker } from "@/components/sessions/session-tag-picker";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[6px] self-start border border-[var(--line-strong)] bg-[var(--bg-3)] px-[12px] py-[7px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <NotebookPen aria-hidden size={12} />
      {pending ? "Logging…" : "Log entry"}
    </button>
  );
}

/**
 * The running session-log capture composer (docs/08-session-mode.md): a
 * quick, freeform textarea plus an optional entity tag picker. Entries are
 * scratch — they land in the log immediately (no review pipeline; not canon)
 * and are promoted to a canonical Event in a later M8 slice.
 *
 * A plain async form action (not `useActionState`), mirroring
 * `roster-editor.tsx`'s `handleAdd`. The text field is kept controlled (not
 * left to React 19's automatic uncontrolled-field reset on any completed
 * action) so a rejected submit never silently drops the DM's typed entry.
 */
export function SessionLogComposer({
  campaignId,
  action: submitAction,
  candidates,
}: {
  campaignId: string;
  action: (
    prevState: SessionLogEntryActionState,
    formData: FormData,
  ) => Promise<SessionLogEntryActionState>;
  candidates: EntityCandidate[];
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  const handleSubmit = async (formData: FormData) => {
    const result = await submitAction(undefined, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setText("");
    setPickerKey((k) => k + 1);
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-[10px]">
      <Textarea
        name="text"
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Donut insulted the Maestro on air; +sponsor drama…"
        aria-label="Log entry"
        required
      />
      <SessionTagPicker key={pickerKey} campaignId={campaignId} candidates={candidates} />
      <div className="flex items-center gap-3">
        <SubmitButton />
        {error && (
          <p role="alert" className="text-[11.5px] text-[var(--no)]">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
