"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Radio, Sparkles } from "lucide-react";

import type {
  PublishSessionRecapActionState,
  SessionRecapActionState,
} from "@/app/(dm)/actions";

// Session recap (M8 slice 4 — docs/08-session-mode.md "Recaps & broadcasts"). A
// one-button generator: no input fields, since the recap is derived entirely
// from this session's own log + promoted events. Ephemeral like "Ask" — the
// panel has no "save" affordance, and regenerating simply replaces the shown
// text (nothing is persisted server-side). Slice 5 adds an optional publish
// step: the DM can turn the currently-shown recap into a player-facing
// SYSTEM_MESSAGE, a deliberate second action, not automatic.

type SessionRecapFormAction = (
  prevState: SessionRecapActionState,
  formData: FormData,
) => Promise<SessionRecapActionState>;

type PublishRecapFormAction = (
  prevState: PublishSessionRecapActionState,
  formData: FormData,
) => Promise<PublishSessionRecapActionState>;

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

function PublishSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-[5px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[9px] py-[5px] font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Publishing…" : "Publish"}
    </button>
  );
}

// Collapsed "Publish to players" affordance under a shown recap. Expands to a
// one-field form (a headline; the recap body rides along as a hidden field,
// carried verbatim from the client — never regenerated server-side). Once
// published this swaps itself for a static confirmation + link, mirroring
// PromoteEntryForm's collapse-to-link pattern. `key`d by the parent on the
// generate call's timestamp so a fresh "Generate recap" click always remounts
// this back to its collapsed state, instead of showing a stale confirmation
// for a since-replaced recap.
function PublishRecapForm({
  campaignId,
  action,
  recap,
  defaultTitle,
}: {
  campaignId: string;
  action: PublishRecapFormAction;
  recap: string;
  defaultTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [state, formAction] = useActionState<PublishSessionRecapActionState, FormData>(
    action,
    undefined,
  );

  if (state?.entityId) {
    return (
      <p className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ok)]">
        Published to players ·{" "}
        <Link
          href={`/campaigns/${campaignId}/entities/${state.entityId}`}
          className="underline"
        >
          view message
        </Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-[5px] font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        <Radio aria-hidden size={11} />
        Publish to players
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-[8px]">
      <input type="hidden" name="recap" value={recap} />
      <input
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
        aria-label="Broadcast title"
        className="min-w-[220px] flex-1 border border-[var(--line)] bg-[var(--bg-1)] px-[8px] py-[5px] text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
      <PublishSubmit />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        Cancel
      </button>
      {state?.error && (
        <p role="alert" className="w-full text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function SessionRecapPanel({
  action: submitAction,
  publishAction,
  campaignId,
  defaultPublishTitle,
}: {
  action: SessionRecapFormAction;
  publishAction: PublishRecapFormAction;
  campaignId: string;
  defaultPublishTitle: string;
}) {
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
          <PublishRecapForm
            key={state.timestamp}
            campaignId={campaignId}
            action={publishAction}
            recap={state.recap}
            defaultTitle={defaultPublishTitle}
          />
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
