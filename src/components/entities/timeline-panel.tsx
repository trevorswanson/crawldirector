"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ChevronRight, Lock, Pencil, Plus, Trash2, Unlock, X } from "lucide-react";

import {
  applyEventEffectsAction,
  archiveEventCausalityAction,
  archiveEventAction,
  createEventAction,
  linkEventCauseAction,
  restoreEventAction,
  restoreEventCausalityAction,
  searchEntityCandidatesAction,
  toggleEventLockAction,
  updateEventAction,
  type EventCausalityActionState,
} from "@/app/(dm)/actions";
import { invalidateCampaignStatus } from "@/lib/campaign-events";
import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import {
  EffectRows,
  effectViewToRow,
  type EffectRowValue,
} from "@/components/entities/effect-rows";
import { EventEffectsSection } from "@/components/entities/event-effects-section";
import { EventTimeFields } from "@/components/entities/event-time-fields";
import {
  ParticipantRows,
  withoutFloorCandidates,
  type ParticipantRowValue,
} from "@/components/entities/participant-rows";
import { Kicker } from "@/components/ui/kicker";
import { SourceBadge } from "@/components/ui/source-badge";
import { TypeDot } from "@/components/ui/type-dot";
import { provenanceMeta } from "@/lib/entities";
import { eventParticipantRoleValues } from "@/lib/validation";
import type { EntityEvent } from "@/server/services/events";

export type TimelineCandidate = EntityCandidate;

function formatTime(time: EntityEvent["time"]) {
  // The phrase is generated server-side from the typed timeRef (ADR 0004).
  return time.phrase;
}

function EventLink({
  campaignId,
  entityId,
  event,
  inEntityTimeline,
}: {
  campaignId: string;
  entityId: string;
  event: { id: string; title: string };
  // Whether the linked event is in *this* entity's timeline. If so, deep-link to
  // it here (expands inline); otherwise the event lives elsewhere, so send the DM
  // to the campaign timeline scrolled to it instead of uselessly reloading.
  inEntityTimeline: boolean;
}) {
  const href = inEntityTimeline
    ? `/campaigns/${campaignId}/entities/${entityId}?event=${event.id}`
    : `/campaigns/${campaignId}/timeline?event=${event.id}`;
  return (
    <Link
      href={href}
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

function EditEventForm({
  event,
  self,
  candidates,
  crawlerCandidates,
  personaCandidates,
  achievementCandidates,
  anchorCandidates,
  resolveName,
  onSubmit,
  onCancel,
  error,
  campaignId,
  entityId,
  causeCandidates,
  entityEventIds,
  onRemoveCausality,
  searchParticipants,
  searchCrawlers,
  searchPersona,
  searchAchievement,
}: {
  event: EntityEvent;
  self: EntityCandidate;
  candidates: EntityCandidate[];
  crawlerCandidates: EntityCandidate[];
  personaCandidates: EntityCandidate[];
  achievementCandidates: EntityCandidate[];
  anchorCandidates: { id: string; title: string }[];
  resolveName: (targetId: string) => string;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  error: string | null;
  campaignId: string;
  entityId: string;
  causeCandidates: EntityEvent[];
  entityEventIds: Set<string>;
  onRemoveCausality: (linkId: string) => void;
  searchParticipants?: (query: string) => Promise<EntityCandidate[]>;
  searchCrawlers?: (query: string) => Promise<EntityCandidate[]>;
  searchPersona?: (query: string) => Promise<EntityCandidate[]>;
  searchAchievement?: (query: string) => Promise<EntityCandidate[]>;
}) {
  // Prefill the participant editor with the full current set: a row for every
  // role the viewed entity holds (it can have more than one) followed by the
  // co-participants — so editing never silently drops an extra self role.
  const initialParticipants: ParticipantRowValue[] = [
    ...event.selfRoles.map((role) => ({ entity: self, role })),
    ...event.others.map((other) => ({
      entity: { id: other.id, name: other.name, type: other.type },
      role: other.role,
    })),
  ];
  // The effect editor manages only *unapplied* effects; applied effects are
  // immutable history (preserved by the service).
  const initialEffects: EffectRowValue[] = event.effects
    .filter((effect) => !effect.applied)
    .map((effect) =>
      effectViewToRow(effect, {
        crawlerCandidates,
        personaCandidates,
        achievementCandidates,
        resolveName,
      }),
    );
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await onSubmit(formData);
    });
  };

  return (
    <div className="flex flex-col gap-2 border border-[var(--line)] bg-[var(--bg-3)] px-[10px] py-[9px]">
      <form id={`edit-event-form-${event.id}`} action={handleSubmit} className="flex flex-col gap-2">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={event.title}
          aria-label="Event title"
          placeholder="What happened?"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12.5px] text-[var(--ink)]"
        />
        <textarea
          name="summary"
          rows={2}
          maxLength={2000}
          defaultValue={event.summary ?? ""}
          aria-label="Event summary"
          placeholder="Summary (optional)"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
        />
        <EventTimeFields
          initial={event.time}
          anchorCandidates={anchorCandidates}
          excludeEventId={event.id}
        />
        <ParticipantRows
          candidates={candidates}
          initial={initialParticipants}
          searchCandidates={searchParticipants}
        />
        <EffectRows
          candidates={crawlerCandidates}
          personaCandidates={personaCandidates}
          achievementCandidates={achievementCandidates}
          initial={initialEffects}
          searchCandidates={searchCrawlers}
          searchPersonaCandidates={searchPersona}
          searchAchievementCandidates={searchAchievement}
        />
        <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
          <input type="checkbox" name="secret" value="true" defaultChecked={event.secret} />
          DM-only (secret)
        </label>
      </form>

      {(event.causedBy.length > 0 || event.causes.length > 0 || causeCandidates.length > 0) && (
        <div className="mt-2 border-t border-[var(--line)] pt-2 flex flex-col gap-[4px]">
          {event.causedBy.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
              <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                Caused by
              </span>
              {event.causedBy.map((cause) => (
                <span
                  key={cause.linkId}
                  className="inline-flex items-center gap-[4px]"
                >
                  <EventLink
                    campaignId={campaignId}
                    entityId={entityId}
                    event={cause}
                    inEntityTimeline={entityEventIds.has(cause.id)}
                  />
                  {!event.locked && (
                    <form
                      action={async () => {
                        await archiveEventCausalityAction(
                          campaignId,
                          entityId,
                          cause.linkId,
                        );
                        onRemoveCausality(cause.linkId);
                      }}
                    >
                      <button
                        type="submit"
                        title="Remove cause link"
                        className="inline-flex p-[2px] text-[var(--ink-faint)] hover:text-[var(--no)]"
                      >
                        <X aria-hidden size={10} />
                      </button>
                    </form>
                  )}
                </span>
              ))}
            </div>
          )}
          {event.causes.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
              <span className="font-mono text-[8.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                Causes
              </span>
              {event.causes.map((effect) => (
                <span
                  key={effect.linkId}
                  className="inline-flex items-center gap-[4px]"
                >
                  <EventLink
                    campaignId={campaignId}
                    entityId={entityId}
                    event={effect}
                    inEntityTimeline={entityEventIds.has(effect.id)}
                  />
                  {!event.locked && (
                    <form
                      action={async () => {
                        await archiveEventCausalityAction(
                          campaignId,
                          entityId,
                          effect.linkId,
                        );
                        onRemoveCausality(effect.linkId);
                      }}
                    >
                      <button
                        type="submit"
                        title="Remove cause link"
                        className="inline-flex p-[2px] text-[var(--ink-faint)] hover:text-[var(--no)]"
                      >
                        <X aria-hidden size={10} />
                      </button>
                    </form>
                  )}
                </span>
              ))}
            </div>
          )}
          {!event.locked && causeCandidates.length > 0 && (
            <CauseLinkForm
              campaignId={campaignId}
              entityId={entityId}
              effectId={event.id}
              effectTitle={event.title}
              candidates={causeCandidates}
            />
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          form={`edit-event-form-${event.id}`}
          disabled={pending}
          className="inline-flex items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
        >
          <Pencil aria-hidden size={12} />
          {pending ? "Saving..." : "Save event"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TimelinePanel({
  campaignId,
  entityId,
  entityName,
  entityType,
  events,
  candidates,
  initialEventId,
}: {
  campaignId: string;
  entityId: string;
  entityName: string;
  entityType: string;
  events: EntityEvent[];
  candidates: TimelineCandidate[];
  // When set (e.g. via a ?event= deep link), that event starts expanded.
  initialEventId?: string;
}) {
  const self: EntityCandidate = { id: entityId, name: entityName, type: entityType };
  // Effect targets are crawlers; resolve target names from the candidate list
  // (the viewed entity included, since it can be its own effect target).
  const crawlerCandidates = [self, ...candidates].filter(
    (candidate) => candidate.type === "CRAWLER",
  );
  // PERSONA_SHIFT effects target the campaign's SYSTEM_AI entities.
  const personaCandidates = [self, ...candidates].filter(
    (candidate) => candidate.type === "SYSTEM_AI",
  );
  // GRANT_ACHIEVEMENT effects grant the campaign's ACHIEVEMENT entities.
  const achievementCandidates = [self, ...candidates].filter(
    (candidate) => candidate.type === "ACHIEVEMENT",
  );
  // Floors are set via the time picker, not as participants (ADR 0008 §3).
  const participantCandidates = withoutFloorCandidates(candidates);
  const nameById = new Map(
    [self, ...candidates].map((candidate) => [candidate.id, candidate.name] as const),
  );
  const resolveName = (targetId: string) =>
    nameById.get(targetId) ?? "Unknown crawler";
  // EVENT-basis anchors pick from the entity's other logged events.
  const anchorCandidates = events.map((e) => ({ id: e.id, title: e.title }));
  // Cause/effect events in this entity's own timeline can deep-link inline; ones
  // that aren't route to the campaign timeline instead (see EventLink).
  const entityEventIds = new Set(events.map((e) => e.id));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<TimelineCandidate | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [sourceRole, setSourceRole] =
    useState<(typeof eventParticipantRoleValues)[number]>("ACTOR");
  const [otherRole, setOtherRole] =
    useState<(typeof eventParticipantRoleValues)[number]>("TARGET");
  // Which event is being edited inline, with its own error slot.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [removedEventId, setRemovedEventId] = useState<string | null>(null);
  const [removedCausalityId, setRemovedCausalityId] = useState<string | null>(null);
  const visibleEvents = removedEventId
    ? events.filter((event) => event.id !== removedEventId)
    : events;
  // Which event's details (summary, participants, causality, controls) are
  // revealed. The compact rail mirrors the mockup; the rest opens on click.
  const [expandedId, setExpandedId] = useState<string | null>(
    initialEventId ?? null,
  );

  // Honor deep-link changes from soft navigation (e.g. clicking a cause link)
  // by adjusting state during render — see the React docs pattern for syncing
  // state to a changed prop without an effect.
  const [prevInitialEventId, setPrevInitialEventId] = useState(initialEventId);
  if (initialEventId !== prevInitialEventId) {
    setPrevInitialEventId(initialEventId);
    if (initialEventId) setExpandedId(initialEventId);
  }

  const closeForm = () => {
    setError(null);
    setParticipant(null);
    setNewTitle("");
    setNewSummary("");
    setNewSecret(false);
    setSourceRole("ACTOR");
    setOtherRole("TARGET");
    setOpen(false);
  };

  const searchParticipants = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, {
      excludeIds: [entityId],
    });
  const searchCrawlers = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, {
      types: ["CRAWLER"],
    });
  const searchPersona = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, {
      types: ["SYSTEM_AI"],
    });
  const searchAchievement = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, {
      types: ["ACHIEVEMENT"],
    });

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const res = await createEventAction(campaignId, entityId, undefined, formData);
    if (res?.error) {
      setError(res.error);
    } else {
      closeForm();
      invalidateCampaignStatus();
    }
  };

  const handleEdit = (eventId: string) => async (formData: FormData) => {
    setEditError(null);
    const res = await updateEventAction(
      campaignId,
      entityId,
      eventId,
      undefined,
      formData,
    );
    if (res?.error) {
      setEditError(res.error);
    } else {
      setEditingId(null);
      invalidateCampaignStatus();
    }
  };

  return (
    <div>
      <Kicker dim noLead className="mb-3">
        Timeline · {visibleEvents.length} events
      </Kicker>

      {(removedEventId || removedCausalityId) && (
        <div className="mb-3 flex flex-col gap-2">
          {removedEventId && (
            <div className="flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--ink-dim)]">
              <span>Event removed.</span>
              <form
                action={async () => {
                  await restoreEventAction(campaignId, entityId, removedEventId);
                  setRemovedEventId(null);
                }}
              >
                <button
                  type="submit"
                  className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--accent)] hover:text-[var(--ink)]"
                >
                  Undo
                </button>
              </form>
            </div>
          )}
          {removedCausalityId && (
            <div className="flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-xs text-[var(--ink-dim)]">
              <span>Causality link removed.</span>
              <form
                action={async () => {
                  await restoreEventCausalityAction(
                    campaignId,
                    entityId,
                    removedCausalityId,
                  );
                  setRemovedCausalityId(null);
                }}
              >
                <button
                  type="submit"
                  className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--accent)] hover:text-[var(--ink)]"
                >
                  Undo
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {visibleEvents.length === 0 && (
        <p className="text-[12.5px] text-[var(--ink-faint)]">
          No events logged for this entity yet.
        </p>
      )}

      {visibleEvents.length > 0 && (
        <div className="relative pl-[22px]">
          {/* the spine connecting every node, like the mockup */}
          <div className="absolute bottom-1 left-[5px] top-1 w-px bg-[var(--line-strong)]" />
          <div className="flex flex-col gap-[14px]">
            {visibleEvents.map((e) => {
              const when = formatTime(e.time);
              const prov = provenanceMeta(e.source);
              const expanded = expandedId === e.id;
              const unavailableCauseIds = new Set([
                e.id,
                ...e.causedBy.map((cause) => cause.id),
                ...e.causes.map((effect) => effect.id),
              ]);
              const causeCandidates = events.filter(
                (candidate) => !unavailableCauseIds.has(candidate.id),
              );
              return (
                <div key={e.id} className="relative">
                  {/* provenance-colored node on the spine */}
                  <span
                    aria-hidden
                    className="absolute left-[-22px] top-1 h-[11px] w-[11px] rounded-full bg-[var(--bg)]"
                    style={{ border: `2px solid ${prov.color}` }}
                  />
                  <div className="flex flex-wrap items-center gap-[9px]">
                    {when && (
                      <span className="font-mono text-[10px] tracking-[.04em] text-[var(--ink-faint)]">
                        {when}
                      </span>
                    )}
                    <span className="border border-[var(--line-strong)] px-[5px] py-px font-mono text-[8.5px] uppercase tracking-[.08em] text-[var(--ink-dim)]">
                      {e.role}
                    </span>
                    <SourceBadge source={e.source} small />
                    {e.secret && (
                      <span
                        className="font-mono text-[8.5px] uppercase tracking-[.08em]"
                        style={{ color: "var(--hot)" }}
                      >
                        secret
                      </span>
                    )}

                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : e.id)}
                    aria-expanded={expanded}
                    className="mt-[3px] flex w-full items-start gap-[5px] text-left text-[13.5px] text-[var(--ink)] hover:text-[var(--accent)]"
                  >
                    <ChevronRight
                      aria-hidden
                      size={13}
                      className={`mt-[3px] shrink-0 text-[var(--ink-faint)] transition-transform ${
                        expanded ? "rotate-90" : ""
                      }`}
                    />
                    <span className="min-w-0">{e.title}</span>
                  </button>

                  {expanded && (
                    <div className="ml-[18px] mt-[8px] flex flex-col gap-[10px] border-l border-[var(--line)] pl-[12px]">
                      {editingId !== e.id && e.summary && (
                        <p className="text-[12px] leading-[1.5] text-[var(--ink-dim)]">
                          {e.summary}
                        </p>
                      )}
                      {editingId !== e.id && e.others.length > 0 && (
                        <div className="flex flex-col gap-[5px]">
                          <span className="font-mono text-[8.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                            Participants
                          </span>
                          <div className="flex flex-wrap gap-x-[12px] gap-y-[5px]">
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
                        </div>
                      )}
                      {editingId !== e.id && (e.causedBy.length > 0 || e.causes.length > 0) && (
                        <div className="flex flex-col gap-[4px]">
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
                                    inEntityTimeline={entityEventIds.has(cause.id)}
                                  />
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
                                    inEntityTimeline={entityEventIds.has(effect.id)}
                                  />
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <EventEffectsSection
                        campaignId={campaignId}
                        effects={e.effects}
                        resolveName={resolveName}
                        onApply={() =>
                          applyEventEffectsAction(campaignId, entityId, e.id)
                        }
                      />
                      {editingId === e.id ? (
                        <EditEventForm
                          event={e}
                          self={self}
                          candidates={candidates}
                          crawlerCandidates={crawlerCandidates}
                          personaCandidates={personaCandidates}
                          achievementCandidates={achievementCandidates}
                          anchorCandidates={anchorCandidates}
                          resolveName={resolveName}
                          onSubmit={handleEdit(e.id)}
                          onCancel={() => {
                            setEditError(null);
                            setEditingId(null);
                          }}
                          error={editError}
                          campaignId={campaignId}
                          entityId={entityId}
                          causeCandidates={causeCandidates}
                          entityEventIds={entityEventIds}
                          onRemoveCausality={setRemovedCausalityId}
                          searchParticipants={searchParticipants}
                          searchCrawlers={searchCrawlers}
                          searchPersona={searchPersona}
                          searchAchievement={searchAchievement}
                        />
                      ) : null}
                      <div className="flex flex-wrap gap-[6px]">
                        {!e.locked && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditError(null);
                              setEditingId(editingId === e.id ? null : e.id);
                            }}
                            aria-label="Edit event"
                            aria-expanded={editingId === e.id}
                            className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <Pencil aria-hidden size={11} />
                            Edit event
                          </button>
                        )}
                        <form
                          action={toggleEventLockAction.bind(
                            null,
                            campaignId,
                            entityId,
                            e.id,
                            e.locked,
                          )}
                        >
                          <button
                            type="submit"
                            aria-label={e.locked ? "Unlock event" : "Lock event"}
                            title={e.locked ? "Unlock event" : "Lock event"}
                            className="inline-flex items-center gap-[6px] border px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] transition-colors cursor-pointer"
                            style={{
                              borderColor: e.locked ? "var(--sys)" : "var(--line)",
                              color: e.locked ? "var(--sys)" : "var(--ink-faint)",
                            }}
                          >
                            {e.locked ? (
                              <Lock aria-hidden size={11} />
                            ) : (
                              <Unlock aria-hidden size={11} />
                            )}
                            {e.locked ? "Unlock event" : "Lock event"}
                          </button>
                        </form>
                        {!e.locked && (
                          <form
                            action={async () => {
                              await archiveEventAction(campaignId, entityId, e.id);
                              setRemovedEventId(e.id);
                            }}
                          >
                        <button
                          type="submit"
                          aria-label="Remove event"
                          className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:border-[var(--no)] hover:text-[var(--no)]"
                        >
                          <Trash2 aria-hidden size={11} />
                          Remove event
                        </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open ? (
        <form action={handleSubmit} className="mt-3 flex flex-col gap-2">
          <input
            name="title"
            required
            maxLength={200}
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="What happened?"
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12.5px] text-[var(--ink)]"
          />
          <textarea
            name="summary"
            rows={2}
            maxLength={2000}
            value={newSummary}
            onChange={(event) => setNewSummary(event.target.value)}
            placeholder="Summary (optional)"
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
          />
          <EventTimeFields anchorCandidates={anchorCandidates} />
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
            This entity&rsquo;s role
            <select
              name="sourceRole"
              value={sourceRole}
              onChange={(event) =>
                setSourceRole(event.target.value as (typeof eventParticipantRoleValues)[number])
              }
              className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[5px] font-mono text-[11px] text-[var(--ink)]"
            >
              {eventParticipantRoleValues.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {participantCandidates.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                Add participant (optional)
              </span>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <EntityTypeahead
                    name="otherId"
                    candidates={participantCandidates}
                    searchCandidates={searchParticipants}
                    value={participant}
                    onChange={setParticipant}
                    placeholder="Search entity to add…"
                  />
                </div>
                <select
                  name="otherRole"
                  value={otherRole}
                  onChange={(event) =>
                    setOtherRole(event.target.value as (typeof eventParticipantRoleValues)[number])
                  }
                  disabled={!participant}
                  className="self-start border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] font-mono text-[11px] text-[var(--ink)] disabled:opacity-50"
                >
                  {eventParticipantRoleValues.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <EffectRows
            candidates={crawlerCandidates}
            personaCandidates={personaCandidates}
            achievementCandidates={achievementCandidates}
            searchCandidates={searchCrawlers}
            searchPersonaCandidates={searchPersona}
            searchAchievementCandidates={searchAchievement}
          />
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
            <input
              type="checkbox"
              name="secret"
              value="true"
              checked={newSecret}
              onChange={(event) => setNewSecret(event.target.checked)}
            />
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
              onClick={closeForm}
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
