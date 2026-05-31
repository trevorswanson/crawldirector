"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Plus, X } from "lucide-react";

import {
  archiveEventAction,
  createEventAction,
  type EventActionState,
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
  const [state, formAction] = useActionState<EventActionState, FormData>(
    createEventAction.bind(null, campaignId, entityId),
    undefined,
  );

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
        <form action={formAction} className="mt-3 flex flex-col gap-2">
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
          {state?.error && (
            <p role="alert" className="text-[11px] text-[var(--no)]">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <LogButton />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <Plus aria-hidden size={12} />
          Log event
        </button>
      )}
    </div>
  );
}
