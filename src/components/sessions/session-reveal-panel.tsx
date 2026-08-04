"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Eye, X } from "lucide-react";

import {
  revealEntityBroadlyAction,
  revealSessionKnowledgeAction,
  revokeSessionRevealAction,
  type RevealActionState,
} from "@/app/(dm)/actions";
import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import type { SessionRevealView } from "@/server/services/knowledge";

// Live reveal (M8 slice 3, docs/08-session-mode.md "Live reveal"), reachable
// from the session screen: a broad reveal flips an entity's visibility
// campaign-wide, a private reveal grants one recipient (another actor entity,
// or a specific player) knowledge of it without changing campaign-wide
// visibility. Private reveals made from here are tied to this session
// (`sourceEventId`) and listed below; a broad reveal has no such history here
// — it's a plain campaign-wide visibility change, already provenanced on the
// entity's own change-set history.

export type PlayerRecipientCandidate = {
  membershipId: string;
  userName: string | null;
  userEmail: string | null;
};

function SubmitButton({
  disabled,
  label,
  pendingLabel,
}: {
  disabled?: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-[6px] self-start border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function FormFeedback({ state }: { state: RevealActionState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-[11px] text-[var(--no)]">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return <p className="text-[11px] text-[var(--ok)]">{state.success}</p>;
  }
  return null;
}

function BroadRevealForm({
  campaignId,
  sessionId,
  candidates,
}: {
  campaignId: string;
  sessionId: string;
  candidates: EntityCandidate[];
}) {
  const [state, formAction] = useActionState<RevealActionState, FormData>(
    revealEntityBroadlyAction.bind(null, campaignId, sessionId),
    undefined,
  );
  const [entity, setEntity] = useState<EntityCandidate | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && formRef.current) {
      formRef.current.reset();
      setEntity(null);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <EntityTypeahead
        name="entityId"
        candidates={candidates}
        value={entity}
        onChange={setEntity}
        placeholder="Reveal an entity to all players…"
      />
      <div className="flex items-center gap-3">
        <SubmitButton
          disabled={!entity}
          label="Reveal to players"
          pendingLabel="Revealing…"
        />
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

function PrivateRevealForm({
  campaignId,
  sessionId,
  candidates,
  players,
}: {
  campaignId: string;
  sessionId: string;
  candidates: EntityCandidate[];
  players: PlayerRecipientCandidate[];
}) {
  const [state, formAction] = useActionState<RevealActionState, FormData>(
    revealSessionKnowledgeAction.bind(null, campaignId, sessionId),
    undefined,
  );
  const [target, setTarget] = useState<EntityCandidate | null>(null);
  const [recipientKind, setRecipientKind] = useState<"MEMBERSHIP" | "ENTITY">(
    players.length > 0 ? "MEMBERSHIP" : "ENTITY",
  );
  const [recipientEntity, setRecipientEntity] = useState<EntityCandidate | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && formRef.current) {
      formRef.current.reset();
      setTarget(null);
      setRecipientEntity(null);
    }
  }, [state]);

  const canSubmitEntity = recipientKind === "ENTITY" ? Boolean(recipientEntity) : true;
  const canSubmitMembership = recipientKind === "MEMBERSHIP" ? players.length > 0 : true;
  const disabled = !target || !canSubmitEntity || !canSubmitMembership;

  const recipientCandidates = candidates.filter((c) => c.id !== target?.id);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <EntityTypeahead
        name="targetEntityId"
        candidates={candidates}
        value={target}
        onChange={setTarget}
        placeholder="What's revealed…"
      />
      <div className="flex gap-[6px]">
        <input type="hidden" name="recipientKind" value={recipientKind} />
        {(["MEMBERSHIP", "ENTITY"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setRecipientKind(kind)}
            className={`border px-[9px] py-[4px] font-mono text-[9.5px] uppercase tracking-[.08em] transition-colors ${
              recipientKind === kind
                ? "border-[var(--accent)] text-[var(--ink)]"
                : "border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
            }`}
          >
            {kind === "MEMBERSHIP" ? "Player" : "Entity"}
          </button>
        ))}
      </div>
      {recipientKind === "MEMBERSHIP" ? (
        players.length === 0 ? (
          <p className="font-mono text-[10px] leading-[1.5] text-[var(--ink-faint)]">
            No players have joined this campaign yet.
          </p>
        ) : (
          <select
            name="membershipId"
            defaultValue=""
            aria-label="Reveal to player"
            className="h-9 border border-[var(--line-strong)] bg-[var(--bg)] px-[10px] text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          >
            <option value="" disabled>
              Pick a player…
            </option>
            {players.map((player) => (
              <option key={player.membershipId} value={player.membershipId}>
                {player.userName ?? player.userEmail ?? "Player"}
              </option>
            ))}
          </select>
        )
      ) : (
        <EntityTypeahead
          name="recipientEntityId"
          candidates={recipientCandidates}
          value={recipientEntity}
          onChange={setRecipientEntity}
          placeholder="Who learns this…"
        />
      )}
      <input
        name="notes"
        maxLength={500}
        placeholder="Notes (optional)"
        aria-label="Reveal notes"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
      />
      <div className="flex items-center gap-3">
        <SubmitButton
          disabled={disabled}
          label="Reveal privately"
          pendingLabel="Revealing…"
        />
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

function RevealHistoryList({
  campaignId,
  sessionId,
  reveals,
}: {
  campaignId: string;
  sessionId: string;
  reveals: SessionRevealView[];
}) {
  if (reveals.length === 0) {
    return (
      <p className="text-[11.5px] text-[var(--ink-faint)]">
        No private reveals recorded for this session yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-[6px]">
      {reveals.map((reveal) => (
        <li
          key={reveal.id}
          className="flex items-start justify-between gap-3 border border-[var(--line)] px-[10px] py-[8px]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[6px] text-[12px] text-[var(--ink)]">
              <TypeDot type={reveal.target.type} size={7} />
              <Link
                href={`/campaigns/${campaignId}/entities/${reveal.target.id}`}
                className="font-semibold hover:underline"
              >
                {reveal.target.name}
              </Link>
              <span className="text-[var(--ink-faint)]">→</span>
              {reveal.recipient.kind === "ENTITY" ? (
                <>
                  <TypeDot type={reveal.recipient.entity.type} size={7} />
                  <Link
                    href={`/campaigns/${campaignId}/entities/${reveal.recipient.entity.id}`}
                    className="font-semibold hover:underline"
                  >
                    {reveal.recipient.entity.name}
                  </Link>
                </>
              ) : (
                <span className="font-semibold">
                  {reveal.recipient.userName ?? reveal.recipient.userEmail ?? "Player"}
                </span>
              )}
            </div>
            {reveal.notes && (
              <p className="mt-[3px] text-[11px] leading-[1.45] text-[var(--ink-dim)]">
                {reveal.notes}
              </p>
            )}
          </div>
          <form
            action={revokeSessionRevealAction.bind(null, campaignId, sessionId, reveal.id)}
          >
            <button
              type="submit"
              aria-label="Revoke reveal"
              title="Revoke reveal"
              className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
            >
              <X aria-hidden size={12} />
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function SessionRevealPanel({
  campaignId,
  sessionId,
  candidates,
  players,
  reveals,
}: {
  campaignId: string;
  sessionId: string;
  candidates: EntityCandidate[];
  players: PlayerRecipientCandidate[];
  reveals: SessionRevealView[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-[7px]">
        <Eye aria-hidden size={13} className="text-[var(--ink-faint)]" />
        <Kicker dim noLead>
          Live reveal
        </Kicker>
      </div>
      <p className="mb-4 font-mono text-[9.5px] leading-[1.5] text-[var(--ink-faint)]">
        Share something at the table now — broadly to every player, or privately
        to one recipient. Not the same as promoting a log entry to canon.
      </p>
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="flex-1">
          <Kicker dim noLead className="mb-2">
            Broadly
          </Kicker>
          <BroadRevealForm
            campaignId={campaignId}
            sessionId={sessionId}
            candidates={candidates}
          />
        </div>
        <div className="flex-1">
          <Kicker dim noLead className="mb-2">
            Privately
          </Kicker>
          <PrivateRevealForm
            campaignId={campaignId}
            sessionId={sessionId}
            candidates={candidates}
            players={players}
          />
        </div>
      </div>
      <div className="mt-5">
        <Kicker dim noLead className="mb-2">
          Revealed this session · {reveals.length}
        </Kicker>
        <RevealHistoryList
          campaignId={campaignId}
          sessionId={sessionId}
          reveals={reveals}
        />
      </div>
    </div>
  );
}
