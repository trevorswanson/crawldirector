"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Plus, X } from "lucide-react";

import {
  archiveEventCausalityAction,
  archiveEventAction,
  createEventAction,
  linkEventCauseAction,
  type EventCausalityActionState,
} from "@/app/(dm)/actions";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { eventParticipantRoleValues } from "@/lib/validation";
import type { EntityEvent } from "@/server/services/events";

export type TimelineCandidate = { id: string; name: string; type: string };

function formatTime(time: EntityEvent["time"]) {
  if (time.label) return time.label;
  if (time.floor != null) return `Floor ${time.floor}`;
  return null;
}

function EventLink({
  campaignId,
  entityId,
  event,
}: {
  campaignId: string;
  entityId: string;
  event: { id: string; title: string };
}) {
  return (
    <Link
      href={`/campaigns/${campaignId}/entities/${entityId}?event=${event.id}`}
      className="text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]"
    >
      {event.title}
    </Link>
  );
}

function LogButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
    >
      <Plus aria-hidden size={12} />
      {pending ? "Logging..." : "Log event"}
    </button>
  );
}

function CauseLinkForm({
  campaignId,
  entityId,
  effectId,
  effectTitle,
  candidates,
}: {
  campaignId: string;
  entityId: string;
  effectId: string;
  effectTitle: string;
  candidates: EntityEvent[];
}) {
  const [state, formAction] = useActionState<
    EventCausalityActionState,
    FormData
  >(
    linkEventCauseAction.bind(null, campaignId, entityId, effectId),
    undefined,
  );

  return (
    <form action={formAction} className="mt-[8px] flex flex-wrap gap-[6px]">
      <select
        name="causeId"
        aria-label={`Cause event for ${effectTitle}`}
        defaultValue=""
        className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-2 py-[5px] text-[11px] text-[var(--ink-dim)]"
      >
        <option value="">Link a cause...</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.title}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
      >
        Add cause
      </button>
      {state?.error && (
        <p role="alert" className="basis-full text-[10.5px] text-[var(--no)]">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function TimelinePanel({
  campaignId,
  entityId,
  events,
  candidates,
}: {
  campaignId: string;
  entityId: string;
  events: EntityEvent[];
  candidates: TimelineCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const res = await createEventAction(campaignId, entityId, undefined, formData);
    if (res?.error) {
      setError(res.error);
    } else {
      setOpen(false);
    }
  };

  return (
    <div>
      <Kicker dim noLead className="mb-3">
        Timeline · {events.length}
      </Kicker>

      {events.length === 0 && (
        <p className="text-[12.5px] text-[var(--ink-faint)]">
          No events logged for this entity yet.
        </p>
      )}

      <div className="flex flex-col gap-[6px]">
        {events.map((e) => {
          const when = formatTime(e.time);
          const unavailableCauseIds = new Set([
            e.id,
            ...e.causedBy.map((cause) => cause.id),
            ...e.causes.map((effect) => effect.id),
          ]);
          const causeCandidates = events.filter(
            (candidate) => !unavailableCauseIds.has(candidate.id),
          );
          return (
            <div
              key={e.id}
              className="group flex items-start gap-2 border border-[var(--line)] px-[12px] py-[10px]"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-[5px] flex flex-wrap items-center gap-[8px]">
                  <span
                    className="font-mono text-[9.5px] uppercase tracking-[.06em]"
                    style={{ color: "var(--accent)" }}
                  >
                    {e.role}
                  </span>
                  {when && (
                    <span className="font-mono text-[9.5px] tracking-[.04em] text-[var(--ink-faint)]">
                      {when}
                    </span>
                  )}
                  {e.secret && (
                    <span
                      className="font-mono text-[9.5px] uppercase tracking-[.06em]"
                      style={{ color: "var(--hot)" }}
                    >
                      secret
                    </span>
                  )}
                </div>
                <div className="text-[13px] font-semibold text-[var(--ink)]">
                  {e.title}
                </div>
                {e.summary && (
                  <p className="mt-[3px] text-[11.5px] leading-[1.45] text-[var(--ink-dim)]">
                    {e.summary}
                  </p>
                )}
                {e.others.length > 0 && (
                  <div className="mt-[7px] flex flex-wrap gap-x-[10px] gap-y-[4px]">
                    {e.others.map((o) => (
                      <Link
                        key={`${o.id}-${o.role}`}
                        href={`/campaigns/${campaignId}/entities/${o.id}`}
                        className="flex items-center gap-[6px] text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                      >
                        <TypeDot type={o.type} size={6} />
                        <span className="truncate">{o.name}</span>
                        <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                          {o.role}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {(e.causedBy.length > 0 || e.causes.length > 0) && (
                  <div className="mt-[8px] flex flex-col gap-[4px] border-l border-[var(--line)] pl-[9px]">
                    {e.causedBy.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
                        <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                          Caused by
                        </span>
                        {e.causedBy.map((cause) => (
                          <span
                            key={cause.linkId}
                            className="inline-flex items-center gap-[4px]"
                          >
                            <EventLink
                              campaignId={campaignId}
                              entityId={entityId}
                              event={cause}
                            />
                            <form
                              action={archiveEventCausalityAction.bind(
                                null,
                                campaignId,
                                entityId,
                                cause.linkId,
                              )}
                            >
                              <button
                                type="submit"
                                title="Remove cause link"
                                className="inline-flex p-[2px] text-[var(--ink-faint)] hover:text-[var(--no)]"
                              >
                                <X aria-hidden size={10} />
                              </button>
                            </form>
                          </span>
                        ))}
                      </div>
                    )}
                    {e.causes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
                        <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                          Causes
                        </span>
                        {e.causes.map((effect) => (
                          <span
                            key={effect.linkId}
                            className="inline-flex items-center gap-[4px]"
                          >
                            <EventLink
                              campaignId={campaignId}
                              entityId={entityId}
                              event={effect}
                            />
                            <form
                              action={archiveEventCausalityAction.bind(
                                null,
                                campaignId,
                                entityId,
                                effect.linkId,
                              )}
                            >
                              <button
                                type="submit"
                                title="Remove cause link"
                                className="inline-flex p-[2px] text-[var(--ink-faint)] hover:text-[var(--no)]"
                              >
                                <X aria-hidden size={10} />
                              </button>
                            </form>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {causeCandidates.length > 0 && (
                  <CauseLinkForm
                    campaignId={campaignId}
                    entityId={entityId}
                    effectId={e.id}
                    effectTitle={e.title}
                    candidates={causeCandidates}
                  />
                )}
              </div>
              <form
                action={archiveEventAction.bind(null, campaignId, entityId, e.id)}
              >
                <button
                  type="submit"
                  title="Remove event"
                  className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
                >
                  <X aria-hidden size={12} />
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {open ? (
        <form action={handleSubmit} className="mt-3 flex flex-col gap-2">
          <input
            name="title"
            required
            maxLength={200}
            placeholder="What happened?"
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12.5px] text-[var(--ink)]"
          />
          <textarea
            name="summary"
            rows={2}
            maxLength={2000}
            placeholder="Summary (optional)"
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
          />
          <div className="flex gap-2">
            <input
              name="floor"
              type="number"
              min={1}
              max={18}
              placeholder="Floor"
              className="w-[80px] border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
            />
            <input
              name="timeLabel"
              maxLength={120}
              placeholder="Time label (e.g. Day 3)"
              className="min-w-0 flex-1 border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
            />
          </div>
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
            This entity&rsquo;s role
            <select
              name="sourceRole"
              defaultValue="ACTOR"
              className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[5px] font-mono text-[11px] text-[var(--ink)]"
            >
              {eventParticipantRoleValues.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {candidates.length > 0 && (
            <div className="flex gap-2">
              <select
                name="otherId"
                defaultValue=""
                className="min-w-0 flex-1 border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[11.5px] text-[var(--ink)]"
              >
                <option value="">Add participant… (optional)</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                name="otherRole"
                defaultValue="TARGET"
                className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] font-mono text-[11px] text-[var(--ink)]"
              >
                {eventParticipantRoleValues.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
            <input type="checkbox" name="secret" value="true" />
            DM-only (secret)
          </label>
          {error && (
            <p role="alert" className="text-[11px] text-[var(--no)]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <LogButton />
            <button
              type="button"
              onClick={() => {
                setError(null);
                setOpen(false);
              }}
              className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="mt-3 inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <Plus aria-hidden size={12} />
          Log event
        </button>
      )}
    </div>
  );
}
