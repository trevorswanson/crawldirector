"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import {
  createCampaignEventAction,
  updateCampaignEventAction,
  type EventActionState,
} from "@/app/(dm)/actions";
import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import {
  ParticipantRows,
  type ParticipantRowValue,
} from "@/components/entities/participant-rows";
import { Kicker } from "@/components/ui/kicker";
import { LockChip } from "@/components/ui/lock-chip";
import { SourceBadge } from "@/components/ui/source-badge";
import { TypeDot } from "@/components/ui/type-dot";
import { eventParticipantRoleValues } from "@/lib/validation";
import type { CampaignTimelineEvent } from "@/server/services/events";

type ParticipantDraft = {
  key: number;
  entity: EntityCandidate | null;
  role: (typeof eventParticipantRoleValues)[number];
};

function formatTime(time: CampaignTimelineEvent["time"]) {
  if (time.label) return time.label;
  if (time.floor != null) return `Floor ${time.floor}`;
  return "Unplaced";
}

function NewEventForm({
  campaignId,
  candidates,
  onClose,
}: {
  campaignId: string;
  candidates: EntityCandidate[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParticipantDraft[]>([
    { key: 0, entity: null, role: "ACTOR" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const addRow = () => {
    if (rows.length >= 20) return;
    setRows((current) => [...current, { key: nextKey, entity: null, role: "ACTOR" }]);
    setNextKey((current) => current + 1);
  };

  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result: EventActionState = await createCampaignEventAction(
      campaignId,
      undefined,
      formData,
    );
    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 border-b border-[var(--line)] py-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <input
          name="title"
          required
          maxLength={200}
          placeholder="What happened?"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--ink)]"
        />
        <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
          <input type="checkbox" name="secret" value="true" />
          DM-only
        </label>
      </div>
      <textarea
        name="summary"
        rows={3}
        maxLength={2000}
        placeholder="Summary (optional)"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--ink)]"
      />
      <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)]">
        <input
          name="floor"
          type="number"
          min={1}
          max={18}
          placeholder="Floor"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--ink)]"
        />
        <input
          name="timeLabel"
          maxLength={120}
          placeholder="Time label (e.g. Day 3)"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--ink)]"
        />
      </div>

      <input type="hidden" name="participantCount" value={rows.length} />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
            Participants
          </span>
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= 20 || candidates.length === 0}
            className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)] disabled:opacity-50"
          >
            <Plus aria-hidden size={11} />
            Add participant
          </button>
        </div>
        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
            <EntityTypeahead
              name={`participantId_${index}`}
              candidates={candidates}
              value={row.entity}
              onChange={(entity) =>
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key ? { ...item, entity } : item,
                  ),
                )
              }
              placeholder="Search participant..."
              autoFocus={index === 0}
            />
            <select
              name={`participantRole_${index}`}
              aria-label="Participant role"
              value={row.role}
              onChange={(event) =>
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? {
                          ...item,
                          role: event.target
                            .value as (typeof eventParticipantRoleValues)[number],
                        }
                      : item,
                  ),
                )
              }
              className="self-start border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
            >
              {eventParticipantRoleValues.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="button"
              title="Remove participant row"
              onClick={() => removeRow(row.key)}
              disabled={rows.length === 1}
              className="inline-flex h-[34px] items-center justify-center border border-[var(--line)] px-[8px] text-[var(--ink-faint)] hover:text-[var(--no)] disabled:opacity-40"
            >
              <Trash2 aria-hidden size={12} />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
        >
          <Plus aria-hidden size={12} />
          Log event
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          <X aria-hidden size={12} />
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditEventForm({
  campaignId,
  event,
  candidates,
  onClose,
}: {
  campaignId: string;
  event: CampaignTimelineEvent;
  candidates: EntityCandidate[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const initialParticipants: ParticipantRowValue[] = event.participants.map(
    (participant) => ({
      entity: {
        id: participant.id,
        name: participant.name,
        type: participant.type,
      },
      role: participant.role,
    }),
  );

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const result: EventActionState = await updateCampaignEventAction(
      campaignId,
      event.id,
      undefined,
      formData,
    );
    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <form action={handleSubmit} className="mt-3 flex flex-col gap-3 border border-[var(--line)] bg-[var(--bg-3)] p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={event.title}
          aria-label="Event title"
          placeholder="What happened?"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--ink)]"
        />
        <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
          <input type="checkbox" name="secret" value="true" defaultChecked={event.secret} />
          DM-only
        </label>
      </div>
      <textarea
        name="summary"
        rows={3}
        maxLength={2000}
        defaultValue={event.summary ?? ""}
        aria-label="Event summary"
        placeholder="Summary (optional)"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--ink)]"
      />
      <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)]">
        <input
          name="floor"
          type="number"
          min={1}
          max={18}
          defaultValue={event.time.floor ?? ""}
          aria-label="Floor"
          placeholder="Floor"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--ink)]"
        />
        <input
          name="timeLabel"
          maxLength={120}
          defaultValue={event.time.label ?? ""}
          aria-label="Time label"
          placeholder="Time label (e.g. Day 3)"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--ink)]"
        />
      </div>

      <ParticipantRows candidates={candidates} initial={initialParticipants} />

      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
        >
          <Pencil aria-hidden size={12} />
          Save event
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          <X aria-hidden size={12} />
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CampaignTimeline({
  campaignId,
  events,
  candidates,
}: {
  campaignId: string;
  events: CampaignTimelineEvent[];
  candidates: EntityCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[980px] flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div>
            <Kicker dim noLead className="mb-2">
              Timeline
            </Kicker>
            <h1 className="font-display text-[30px] font-bold leading-tight">
              Crawl Timeline
            </h1>
          </div>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
            >
              <Plus aria-hidden size={12} />
              Log event
            </button>
          )}
        </div>

        {open && (
          <NewEventForm
            campaignId={campaignId}
            candidates={candidates}
            onClose={() => setOpen(false)}
          />
        )}

        {events.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center border border-dashed border-[var(--line)] text-center text-[var(--ink-faint)]">
            <p className="text-sm">
              No events logged yet. Use Log event to start the campaign timeline.
            </p>
          </div>
        ) : (
          <div className="relative pl-[28px]">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--line-strong)]" />
            <div className="flex flex-col gap-5">
              {events.map((event) => (
                <article key={event.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute left-[-27px] top-[5px] h-[13px] w-[13px] rounded-full border-2 border-[var(--accent)] bg-[var(--bg)]"
                  />
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <span className="font-mono text-[10px] tracking-[.04em] text-[var(--ink-faint)]">
                      {formatTime(event.time)}
                    </span>
                    <SourceBadge source={event.source} small />
                    {event.secret && (
                      <span
                        className="font-mono text-[8.5px] uppercase tracking-[.08em]"
                        style={{ color: "var(--hot)" }}
                      >
                        secret
                      </span>
                    )}
                    {event.locked && <LockChip locked />}
                    <span className="font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                      {event.participants.length} participants
                    </span>
                  </div>
                  <div className="mt-[5px] flex items-start justify-between gap-3">
                    <h2 className="text-[17px] font-semibold text-[var(--ink)]">
                      {event.title}
                    </h2>
                    {!event.locked && editingId !== event.id && (
                      <button
                        type="button"
                        onClick={() => setEditingId(event.id)}
                        aria-label="Edit event"
                        className="inline-flex shrink-0 items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <Pencil aria-hidden size={11} />
                        Edit
                      </button>
                    )}
                  </div>
                  {editingId === event.id && (
                    <EditEventForm
                      campaignId={campaignId}
                      event={event}
                      candidates={candidates}
                      onClose={() => setEditingId(null)}
                    />
                  )}
                  {event.summary && (
                    <p className="mt-[5px] max-w-[720px] text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
                      {event.summary}
                    </p>
                  )}
                  {event.participants.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-[14px] gap-y-[7px]">
                      {event.participants.map((participant) => (
                        <Link
                          key={`${event.id}-${participant.id}-${participant.role}`}
                          href={`/campaigns/${campaignId}/entities/${participant.id}?event=${event.id}`}
                          className="inline-flex items-center gap-[6px] text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                        >
                          <TypeDot type={participant.type} size={6} />
                          <span>{participant.name}</span>
                          <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                            {participant.role}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  {(event.causedBy.length > 0 || event.causes.length > 0) && (
                    <div className="mt-3 flex flex-col gap-[4px] text-[11px] text-[var(--ink-faint)]">
                      {event.causedBy.length > 0 && (
                        <p>Caused by {event.causedBy.map((cause) => cause.title).join(", ")}</p>
                      )}
                      {event.causes.length > 0 && (
                        <p>Causes {event.causes.map((effect) => effect.title).join(", ")}</p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
