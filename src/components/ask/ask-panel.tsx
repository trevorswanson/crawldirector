"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { CalendarClock, Layers, Share2, Sparkles, type LucideIcon } from "lucide-react";

import { askCampaignAction, type AskActionState } from "@/app/(dm)/actions";
import type { AskSource } from "@/server/services/ask";

// "Ask the Campaign" panel (M5 slice 5 — docs/07-search-retrieval.md). A
// read-only, retrieval-augmented Q&A: the DM (or, when the player interface
// lands in M7, a scoped player) asks a natural-language question and gets a
// grounded answer whose inline [n] citations link back to the source canon for
// verification. The answer is never canon — it is a synthesized view, so the
// panel says so and offers no "save" affordance.

const SOURCE_ICON: Record<AskSource["targetType"], LucideIcon> = {
  ENTITY: Layers,
  RELATIONSHIP: Share2,
  EVENT: CalendarClock,
};

function AskSubmit() {
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
      {pending ? "Asking the campaign…" : "Ask"}
    </button>
  );
}

// Render the answer text, turning each inline [n] citation into a link to the
// matching source. Splitting on the bracket token keeps surrounding prose
// intact; an out-of-range [n] (no matching source) is left as plain text.
function AnswerBody({ answer, sources }: { answer: string; sources: AskSource[] }) {
  const byIndex = new Map(sources.map((source) => [source.index, source]));
  const parts = answer.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-[var(--ink)]">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        const source = match ? byIndex.get(Number(match[1])) : undefined;
        if (!source) return <Fragment key={i}>{part}</Fragment>;
        return (
          <Link
            key={i}
            href={source.href}
            title={`${source.kind} — ${source.label}`}
            className="mx-[1px] align-super font-mono text-[10px] text-[var(--ai)] hover:underline"
          >
            [{source.index}]
          </Link>
        );
      })}
    </p>
  );
}

function SourceRow({ source }: { source: AskSource }) {
  const Icon = SOURCE_ICON[source.targetType];
  return (
    <Link
      href={source.href}
      className="flex items-center gap-[10px] border border-[var(--line)] bg-[var(--bg)] px-[12px] py-[9px] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-2)]"
    >
      <span className="font-mono text-[11px] text-[var(--ink-faint)]">[{source.index}]</span>
      <Icon aria-hidden size={13} className="shrink-0 text-[var(--ink-faint)]" />
      <span className="font-mono text-[9.5px] uppercase tracking-[.07em] text-[var(--ink-faint)]">
        {source.kind}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-dim)]">
        {source.label}
      </span>
      {source.cited && (
        <span className="hud-tag px-[5px] py-px text-[8.5px]" style={{ color: "var(--ai)" }}>
          Cited
        </span>
      )}
    </Link>
  );
}

export function AskPanel({
  campaignId,
  initialQuestion = "",
}: {
  campaignId: string;
  initialQuestion?: string;
}) {
  const [state, action] = useActionState<AskActionState, FormData>(
    askCampaignAction.bind(null, campaignId),
    undefined,
  );
  const [question, setQuestion] = useState(initialQuestion);
  const [, startTransition] = useTransition();
  const submittedInitial = useRef(false);

  useEffect(() => {
    const trimmed = initialQuestion.trim();
    if (!trimmed || submittedInitial.current) return;
    submittedInitial.current = true;
    const formData = new FormData();
    formData.set("question", trimmed);
    startTransition(() => {
      action(formData);
    });
  }, [action, initialQuestion, startTransition]);

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-3">
        <textarea
          name="question"
          rows={3}
          required
          autoFocus
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about this campaign's canon — e.g. “Which NPCs has Carl wronged, and why?”"
          className="field-shell w-full resize-y rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-[14px] py-[11px] text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--ring)]"
          aria-label="Ask the campaign a question"
        />
        <div className="flex items-center gap-3">
          <AskSubmit />
          <p className="text-[11px] text-[var(--ink-faint)]">
            Answers are synthesized from canon you can see, with citations. Never saved as canon.
          </p>
        </div>
      </form>

      {state?.error && (
        <p role="alert" className="text-[12px] text-[var(--no)]">
          {state.error}
        </p>
      )}

      {state?.answer && (
        <div className="panel flex flex-col gap-4 p-[18px]">
          <AnswerBody answer={state.answer} sources={state.sources ?? []} />

          {state.grounded && state.sources && state.sources.length > 0 && (
            <div className="flex flex-col gap-[7px] border-t border-[var(--line)] pt-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                Sources · retrieved from canon
              </p>
              {state.sources.map((source) => (
                <SourceRow key={`${source.targetType}:${source.targetId}`} source={source} />
              ))}
            </div>
          )}

          {state.model && (
            <p className="font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              {state.model}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
