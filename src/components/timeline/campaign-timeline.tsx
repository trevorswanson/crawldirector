"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
  X,
  Zap,
} from "lucide-react";

import {
  applyCampaignEventEffectsAction,
  archiveCampaignEventAction,
  archiveCampaignEventCausalityAction,
  createCampaignEventAction,
  createCampaignFloorEntityAction,
  linkCampaignEventCauseAction,
  orderEventsFromCausalityAction,
  reorderEventAction,
  restoreCampaignEventAction,
  restoreCampaignEventCausalityAction,
  searchEntityCandidatesAction,
  setCampaignCurrentFloorAction,
  setCampaignEventLockAction,
  updateCampaignEventAction,
  type EventActionState,
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
import { EventTimeFields } from "@/components/entities/event-time-fields";
import {
  ParticipantRows,
  withoutFloorCandidates,
  type ParticipantRowValue,
} from "@/components/entities/participant-rows";
import { ConsoleScreen, ScreenHeader, ScreenRail } from "@/components/console/screen";
import { HudTag } from "@/components/ui/hud-tag";
import { SourceBadge } from "@/components/ui/source-badge";
import { TypeDot } from "@/components/ui/type-dot";
import { findCausalityWarnings } from "@/lib/causality";
import { orderFromCausality } from "@/lib/causality-order";
import { provenanceMeta } from "@/lib/entities";
import { describeEffect } from "@/lib/event-effects";
import { floorRelativeSortKey } from "@/lib/time-ref";
import {
  computeFloorDayRanges,
  resolveAbsoluteDay,
  type FloorAnchors,
} from "@/lib/time-resolve";
import { eventParticipantRoleValues } from "@/lib/validation";
import type {
  CampaignFloorMeta,
  CampaignTimelineEvent,
  EventEffectView,
} from "@/server/services/events";

type ParticipantDraft = {
  key: number;
  entity: EntityCandidate | null;
  role: (typeof eventParticipantRoleValues)[number];
};

function formatTime(time: CampaignTimelineEvent["time"]) {
  // Generated phrase from the typed timeRef (ADR 0004); falls back when blank.
  return time.phrase ?? "Unplaced";
}

// Resolve the neighbours a dragged event would land between, given the displayed
// (rank-descending) order. Intra-floor only — dropping onto an event on another
// floor is a no-op (returns null). Dropping moves the dragged event past the
// target on the side it came from, so every slot within a floor is reachable.
// The returned ids are the events directly above/below the drop slot (null at a
// floor boundary), which `reorderEvent` slots a fresh rank between (ADR 0004).
export function computeReorderNeighbors(
  events: Pick<CampaignTimelineEvent, "id" | "orderKey">[],
  draggedId: string,
  targetId: string,
): { aboveId: string | null; belowId: string | null } | null {
  if (draggedId === targetId) return null;
  const dragged = events.find((event) => event.id === draggedId);
  const target = events.find((event) => event.id === targetId);
  if (!dragged || !target) return null;
  if (dragged.orderKey !== target.orderKey) return null;

  const origIndex = events.findIndex((event) => event.id === draggedId);
  const targetIndex = events.findIndex((event) => event.id === targetId);
  const rest = events.filter((event) => event.id !== draggedId);
  const targetInRest = rest.findIndex((event) => event.id === targetId);

  // Moving down (the drag started above the target) drops below the target;
  // moving up drops above it.
  const above = origIndex < targetIndex ? rest[targetInRest] : rest[targetInRest - 1];
  const below = origIndex < targetIndex ? rest[targetInRest + 1] : rest[targetInRest];

  const sameFloorId = (event: { id: string; orderKey: number } | undefined) =>
    event && event.orderKey === dragged.orderKey ? event.id : null;
  return { aboveId: sameFloorId(above), belowId: sameFloorId(below) };
}

// ── Provenance filter (the rail's "filter by origin", mirrors the Review Queue) ──
const TIMELINE_FILTERS = ["ALL", "DM", "AI", "PLAYER", "IMPORT"] as const;
type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

// The model's source is PLAYER_SUGGESTION; the rail shows PLAYER (same aliasing
// as the Review Queue's sourceLabel).
function sourceFilterKey(source: string): Exclude<TimelineFilter, "ALL"> {
  if (source === "PLAYER_SUGGESTION") return "PLAYER";
  if (source === "AI" || source === "IMPORT") return source;
  return "DM";
}

function filterColor(filter: TimelineFilter): string {
  switch (filter) {
    case "AI":
      return "var(--ai)";
    case "PLAYER":
      return "var(--player)";
    case "IMPORT":
      return "var(--import)";
    case "DM":
      return "var(--ink-dim)";
    default:
      return "var(--accent)";
  }
}

function filterLabel(filter: TimelineFilter): string {
  if (filter === "PLAYER") return "PLR";
  if (filter === "IMPORT") return "IMP";
  return filter;
}

function formatDayRange(range: { min: number; max: number }): string {
  return range.min === range.max
    ? `Day ${range.min}`
    : `Day ${range.min} – ${range.max}`;
}

// Floor-ladder dot color by state: the current floor accents; otherwise it dims
// the further a floor is from "logged" (has events) → "reached" → unreached.
function floorDotColor(floor: { current: boolean; logged: boolean; reached: boolean }): string {
  if (floor.current) return "var(--accent)";
  if (floor.logged) return "var(--ink-dim)";
  if (floor.reached) return "var(--ink-faint)";
  return "var(--line-strong)";
}

// Floor-ladder label color: the current floor accents, reached floors read
// normally, unreached floors fade.
function floorLabelColor(floor: { current: boolean; reached: boolean }): string {
  if (floor.current) return "var(--accent)";
  if (floor.reached) return "var(--ink-dim)";
  return "var(--ink-faint)";
}

// An effect rendered as a signed stat diff (broadcast HUD: glanceable deltas).
function effectDiff(effect: EventEffectView): { text: string; color: string } {
  if (typeof effect.delta === "number" && effect.delta !== 0) {
    const sign = effect.delta > 0 ? "+" : "";
    const value =
      effect.stat === "gold" ? effect.delta.toLocaleString() : String(effect.delta);
    return {
      text: `${sign}${value}`,
      color: effect.delta > 0 ? "var(--add)" : "var(--del)",
    };
  }
  if (effect.note) return { text: effect.note, color: "var(--ink-dim)" };
  return { text: describeEffect(effect), color: "var(--ink-dim)" };
}

function effectStatusLabel(effect: EventEffectView) {
  if (effect.applied || effect.reviewStatus === "APPLIED") return "applied";
  if (effect.reviewStatus === "PENDING") return "pending review";
  if (effect.reviewStatus === "REJECTED") return "rejected";
  if (effect.reviewStatus === "SUPERSEDED") return "superseded";
  return "unapplied";
}

function NewEventForm({
  campaignId,
  candidates,
  crawlerCandidates,
  personaCandidates,
  anchorCandidates,
  searchParticipants,
  searchCrawlers,
  searchPersona,
  onClose,
}: {
  campaignId: string;
  candidates: EntityCandidate[];
  crawlerCandidates: EntityCandidate[];
  personaCandidates: EntityCandidate[];
  anchorCandidates: { id: string; title: string }[];
  searchParticipants?: (query: string) => Promise<EntityCandidate[]>;
  searchCrawlers?: (query: string) => Promise<EntityCandidate[]>;
  searchPersona?: (query: string) => Promise<EntityCandidate[]>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [secret, setSecret] = useState(false);
  const [rows, setRows] = useState<ParticipantDraft[]>([
    { key: 0, entity: null, role: "ACTOR" },
  ]);
  const [nextKey, setNextKey] = useState(1);
  // Floors are set via the time picker, not as participants (ADR 0008 §3).
  const pickable = withoutFloorCandidates(candidates);

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
    invalidateCampaignStatus();
    onClose();
  };

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 border border-[var(--line)] bg-[var(--bg-1)] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <input
          name="title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What happened?"
          className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--ink)]"
        />
        <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
          <input
            type="checkbox"
            name="secret"
            value="true"
            checked={secret}
            onChange={(event) => setSecret(event.target.checked)}
          />
          DM-only
        </label>
      </div>
      <textarea
        name="summary"
        rows={3}
        maxLength={2000}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="Summary (optional)"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--ink)]"
      />
      <EventTimeFields anchorCandidates={anchorCandidates} />

      <input type="hidden" name="participantCount" value={rows.length} />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
            Participants
          </span>
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= 20 || pickable.length === 0}
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
              candidates={pickable}
              searchCandidates={
                searchParticipants
                  ? async (query) => withoutFloorCandidates(await searchParticipants(query))
                  : undefined
              }
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
              className="inline-flex h-[34px] items-center justify-center border border-[var(--line)] px-[8px] text-[var(--ink-faint)] hover:text-[var(--no)]"
            >
              <Trash2 aria-hidden size={12} />
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-[10.5px] text-[var(--ink-faint)]">
            Participants are optional. Add a row when an entity is involved.
          </p>
        )}
      </div>

      <EffectRows
        candidates={crawlerCandidates}
        personaCandidates={personaCandidates}
        searchCandidates={searchCrawlers}
        searchPersonaCandidates={searchPersona}
      />

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
  crawlerCandidates,
  personaCandidates,
  anchorCandidates,
  resolveName,
  causeCandidates,
  searchParticipants,
  searchCrawlers,
  searchPersona,
  onFocusEvent,
  onRemoveCausality,
  onClose,
}: {
  campaignId: string;
  event: CampaignTimelineEvent;
  candidates: EntityCandidate[];
  crawlerCandidates: EntityCandidate[];
  personaCandidates: EntityCandidate[];
  anchorCandidates: { id: string; title: string }[];
  resolveName: (targetId: string) => string;
  causeCandidates: { id: string; title: string }[];
  searchParticipants?: (query: string) => Promise<EntityCandidate[]>;
  searchCrawlers?: (query: string) => Promise<EntityCandidate[]>;
  searchPersona?: (query: string) => Promise<EntityCandidate[]>;
  onFocusEvent: (eventId: string) => void;
  onRemoveCausality: (linkId: string) => void;
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
  const initialEffects: EffectRowValue[] = event.effects
    .filter((effect) => !effect.applied)
    .map((effect) =>
      effectViewToRow(effect, { crawlerCandidates, personaCandidates, resolveName }),
    );

  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
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
      invalidateCampaignStatus();
      onClose();
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border border-[var(--line)] bg-[var(--bg-3)] p-3">
      <form id={`edit-event-form-${event.id}`} action={handleSubmit} className="flex flex-col gap-3">
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
          initial={initialEffects}
          searchCandidates={searchCrawlers}
          searchPersonaCandidates={searchPersona}
        />
      </form>

      {(event.causedBy.length > 0 ||
        event.causes.length > 0 ||
        causeCandidates.length > 0) && (
        <div className="border-t border-[var(--line)] pt-3">
          {event.causedBy.length > 0 && (
            <Thread
              dir="in"
              items={event.causedBy}
              campaignId={campaignId}
              canEdit={!event.locked}
              onFocusEvent={onFocusEvent}
              onRemove={onRemoveCausality}
            />
          )}
          {event.causes.length > 0 && (
            <Thread
              dir="out"
              items={event.causes}
              campaignId={campaignId}
              canEdit={!event.locked}
              onFocusEvent={onFocusEvent}
              onRemove={onRemoveCausality}
            />
          )}
          {!event.locked && causeCandidates.length > 0 && (
            <CauseLinkForm
              campaignId={campaignId}
              effectId={event.id}
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
          className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          <Pencil aria-hidden size={12} />
          {pending ? "Saving..." : "Save event"}
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
    </div>
  );
}

// Effects as signed stat diffs + Apply. Same direct DM apply path as
// EventEffectsSection, restyled to the broadcast-HUD diff chips the timeline
// calls for.
function TimelineEffects({
  campaignId,
  effects,
  resolveName,
  onApply,
  canEdit,
}: {
  campaignId: string;
  effects: EventEffectView[];
  resolveName: (targetId: string) => string;
  onApply: () => Promise<EventActionState>;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (effects.length === 0) return null;
  const unapplied = effects.filter(
    (effect) => !effect.applied && effect.reviewStatus === null,
  );

  const apply = async () => {
    setError(null);
    setPending(true);
    const result = await onApply();
    setPending(false);
    if (result?.error) {
      setError(result.error);
    } else {
      invalidateCampaignStatus();
    }
  };

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-[10px]">
      <div className="mb-[7px] flex items-center gap-[7px] font-mono text-[9px] uppercase tracking-[.12em] text-[var(--ink-faint)]">
        <Zap aria-hidden size={11} style={{ color: "var(--accent)" }} />
        Effects on canon
      </div>
      <div className="flex flex-wrap items-center gap-[7px]">
        {effects.map((effect) => {
          const diff = effectDiff(effect);
          const status = effectStatusLabel(effect);
          const statusClassName = "text-[8.5px] uppercase tracking-[.06em]";
          const statusStyle = {
            color: effect.applied ? "var(--ok)" : "var(--ink-faint)",
          };
          return (
            <span
              key={effect.id}
              title={status}
              className="inline-flex items-center gap-[7px] border border-[var(--line)] bg-[var(--bg-2)] px-[8px] py-[3px] font-mono text-[11px] whitespace-nowrap"
            >
              {effect.targetId && (
                <span className="text-[var(--ink-dim)]">{resolveName(effect.targetId)}</span>
              )}
              {effect.stat && <span className="text-[var(--ink-faint)]">{effect.stat}</span>}
              <span style={{ color: diff.color, fontWeight: 600 }}>{diff.text}</span>
              {effect.reviewStatus === "PENDING" && effect.pendingChangeSetId ? (
                <Link
                  href={`/campaigns/${campaignId}/review?selected=${effect.pendingChangeSetId}`}
                  className={statusClassName}
                  style={statusStyle}
                >
                  {status}
                </Link>
              ) : (
                <span className={statusClassName} style={statusStyle}>
                  {status}
                </span>
              )}
            </span>
          );
        })}
        {canEdit && unapplied.length > 0 && (
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="inline-flex items-center gap-[6px] border px-[9px] py-[4px] font-mono text-[9.5px] uppercase tracking-[.08em] disabled:opacity-50"
            style={{
              color: "var(--ok)",
              borderColor: "color-mix(in srgb, var(--ok) 45%, transparent)",
            }}
          >
            <Check aria-hidden size={12} />
            {pending ? "Sending..." : "Apply"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-[6px] text-[10.5px] text-[var(--no)]">
          {error}
        </p>
      )}
    </div>
  );
}

// Causality thread — the connective tissue between events. Each linked event is
// a button that scrolls the timeline to (and highlights) that event; when the DM
// can edit, each link also gets a remove control.
function Thread({
  dir,
  items,
  campaignId,
  canEdit,
  warnings,
  onFocusEvent,
  onRemove,
}: {
  dir: "in" | "out";
  items: { id: string; title: string; linkId: string }[];
  campaignId: string;
  canEdit: boolean;
  // Causality `linkId`s flagged as inconsistent (effect ordered before cause).
  warnings?: Set<string>;
  onFocusEvent: (eventId: string) => void;
  onRemove: (linkId: string) => void;
}) {
  const inbound = dir === "in";
  return (
    <div className="mt-[6px] flex items-start gap-2">
      <span
        className="inline-flex shrink-0 items-center gap-[5px] pt-[1px] font-mono text-[9.5px] uppercase tracking-[.1em]"
        style={{ color: inbound ? "var(--ink-faint)" : "var(--accent)" }}
      >
        <span className="text-[13px] leading-none">↳</span>
        {inbound ? "Caused by" : "Causes"}
      </span>
      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px]">
        {items.map((item) => (
          <span key={item.linkId} className="inline-flex items-center gap-[4px]">
            {warnings?.has(item.linkId) && (
              <AlertTriangle
                aria-label="Out of order: this effect is placed before its cause"
                size={11}
                className="shrink-0"
                style={{ color: "var(--hot)" }}
              />
            )}
            <button
              type="button"
              onClick={() => onFocusEvent(item.id)}
              className="border-b border-dotted border-[var(--line-strong)] text-[12px] text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--accent)]"
            >
              {item.title}
            </button>
            {canEdit && (
              <form
                action={async () => {
                  await archiveCampaignEventCausalityAction(campaignId, item.linkId);
                  onRemove(item.linkId);
                }}
              >
                <button
                  type="submit"
                  title="Remove causality link"
                  className="inline-flex p-[2px] text-[var(--ink-faint)] hover:text-[var(--no)]"
                >
                  <X aria-hidden size={10} />
                </button>
              </form>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// Add-a-cause form for an event (matches the entity Timeline panel): links a
// chosen event as a cause of this one through the review pipeline.
function CauseLinkForm({
  campaignId,
  effectId,
  candidates,
}: {
  campaignId: string;
  effectId: string;
  candidates: { id: string; title: string }[];
}) {
  const [state, formAction] = useActionState<EventCausalityActionState, FormData>(
    linkCampaignEventCauseAction.bind(null, campaignId, effectId),
    undefined,
  );
  return (
    <form action={formAction} className="mt-[8px] flex flex-wrap gap-[6px]">
      <select
        name="causeId"
        aria-label="Cause event"
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

export function CampaignTimeline({
  campaignId,
  events,
  floors,
  candidates,
  canEdit,
  initialEventId,
  truncated,
  loadOlderHref,
  totalEvents,
}: {
  campaignId: string;
  events: CampaignTimelineEvent[];
  floors: CampaignFloorMeta;
  candidates: EntityCandidate[];
  canEdit: boolean;
  // Deep-link target (e.g. from a causality link on another page): scroll to and
  // highlight this event on mount.
  initialEventId?: string;
  // When the timeline is windowed, truncated=true signals that older events exist.
  truncated?: boolean;
  // href to a larger window; rendered as "Show older events" when truncated=true.
  loadOlderHref?: string;
  // Total event count (used in the "Show older" label).
  totalEvents?: number;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>("ALL");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [removedEventId, setRemovedEventId] = useState<string | null>(null);
  const [removedCausalityId, setRemovedCausalityId] = useState<string | null>(null);
  const [reordering, startReorder] = useTransition();
  const [ordering, startOrdering] = useTransition();
  const [, startFloorChange] = useTransition();
  const [creatingFloor, startFloorCreate] = useTransition();
  const router = useRouter();

  // Scroll to + briefly highlight an event; clears any provenance filter that
  // would hide it so causality navigation always lands.
  const scrollToEvent = (eventId: string) => {
    document
      .getElementById(`event-${eventId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const focusEvent = (eventId: string) => {
    if (!events.some((event) => event.id === eventId)) return;
    setFilter("ALL");
    setHighlightedId(eventId);
    scrollToEvent(eventId);
  };

  // Honor a deep-link target on mount / when it changes. The extra timed scroll
  // re-runs after the floor bands have laid out, since on first paint the target
  // node's position is still shifting as content above it renders.
  useEffect(() => {
    if (!initialEventId) return;
    // Deep-link landing genuinely needs to set filter/highlight from a prop on
    // mount; this is the documented "sync to an external param" effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    focusEvent(initialEventId);
    const t = setTimeout(() => scrollToEvent(initialEventId), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId]);

  // Fade the highlight out a couple seconds after it lands (managed by React so
  // it survives re-renders rather than a raw event-handler timer).
  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), 2200);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  const draggingEvent = events.find((event) => event.id === draggingId) ?? null;

  const handleDrop = (targetId: string) => {
    const sourceId = draggingId;
    setDraggingId(null);
    setDropTargetId(null);
    if (!sourceId) return;
    const neighbors = computeReorderNeighbors(events, sourceId, targetId);
    if (!neighbors) return;
    setReorderError(null);
    startReorder(async () => {
      const result = await reorderEventAction(campaignId, sourceId, neighbors);
      if (result?.error) {
        setReorderError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const crawlerCandidates = candidates.filter(
    (candidate) => candidate.type === "CRAWLER",
  );
  // PERSONA_SHIFT effects target the campaign's SYSTEM_AI entities.
  const personaCandidates = candidates.filter(
    (candidate) => candidate.type === "SYSTEM_AI",
  );
  const searchParticipants = (query: string) =>
    searchEntityCandidatesAction(campaignId, query);
  const searchCrawlers = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, {
      types: ["CRAWLER"],
    });
  const searchPersona = (query: string) =>
    searchEntityCandidatesAction(campaignId, query, {
      types: ["SYSTEM_AI"],
    });
  const nameById = new Map(
    candidates.map((candidate) => [candidate.id, candidate.name] as const),
  );
  const resolveName = (targetId: string) =>
    nameById.get(targetId) ?? "Unknown crawler";
  // EVENT-basis anchors pick from the campaign's other logged events.
  const anchorCandidates = events.map((event) => ({
    id: event.id,
    title: event.title,
  }));

  // Inferred absolute day-range per floor (ADR 0008): resolve each event to a
  // day-since-collapse — walking EVENT anchors and per-floor open/collapse
  // anchors — and union per floor, bounding each floor's close at the next
  // floor's open day. Computed over the full set, not the filtered view.
  const floorAnchorsByNumber = new Map<number, FloorAnchors>();
  for (const descriptor of Object.values(floors.byNumber)) {
    floorAnchorsByNumber.set(descriptor.number, {
      startDay: descriptor.startDay,
      collapseDay: descriptor.collapseDay,
    });
  }
  const dayRangeByFloor = computeFloorDayRanges(
    events.map((event) => ({
      id: event.id,
      floor: event.orderKey,
      time: event.time,
    })),
    floorAnchorsByNumber,
  );
  const timeByEventId = new Map(events.map((event) => [event.id, event.time] as const));
  const absoluteDayByEventId = new Map<string, number>();
  for (const event of events) {
    const day = resolveAbsoluteDay(event.time, {
      eventTimeById: (eventId) => timeByEventId.get(eventId),
      floorAnchors: (floor) => floorAnchorsByNumber.get(floor),
    });
    if (day !== null) absoluteDayByEventId.set(event.id, day);
  }

  const liveEvents = removedEventId
    ? events.filter((event) => event.id !== removedEventId)
    : events;

  // Causality-consistency warnings (ADR 0004 slice 3): causal links whose effect
  // is ordered earlier in fiction than its own cause. Computed over the live set
  // so it stays accurate after a local remove/drag; the just-removed link (held
  // for undo) is dropped so it stops warning. Non-blocking — surfaced inline.
  const causalityWarnings = useMemo(() => {
    const set = findCausalityWarnings(liveEvents);
    if (removedCausalityId) set.delete(removedCausalityId);
    return set;
  }, [liveEvents, removedCausalityId]);

  // Whether "order from causality" (ADR 0004 slice 3) would actually move
  // anything: topologically sort each floor's movable (unlocked, non-derived)
  // events from the DAG and see if any rank changes. Recomputed server-side from
  // canon when applied — this only gates the affordance. Movable mirrors the
  // drag gate (`floorRelativeSortKey === null` and not locked).
  const canOrderFromCausality = useMemo(
    () =>
      orderFromCausality(
        liveEvents.map((event) => ({
          id: event.id,
          orderKey: event.orderKey,
          rank: event.rank,
          movable:
            !event.locked &&
            floorRelativeSortKey({
              basis: event.time.basis,
              floor: event.time.floor ?? undefined,
              offset: event.time.offset ?? undefined,
              unit: event.time.unit ?? undefined,
            }) === null,
          causes: event.causes.map((cause) => ({ id: cause.id })),
        })),
      ).length > 0,
    [liveEvents],
  );

  const handleOrderFromCausality = () => {
    setReorderError(null);
    startOrdering(async () => {
      const result = await orderEventsFromCausalityAction(campaignId);
      if (result?.error) {
        setReorderError(result.error);
        return;
      }
      router.refresh();
    });
  };
  const shownEvents =
    filter === "ALL"
      ? liveEvents
      : liveEvents.filter((event) => sourceFilterKey(event.source) === filter);

  // Group the shown events by floor (orderKey). `events` arrive sorted
  // (orderKey desc, rank desc), so each floor's events are already in display
  // order and floor numbers come out newest-first.
  const floorOrder: number[] = [];
  const eventsByFloor = new Map<number, CampaignTimelineEvent[]>();
  for (const event of shownEvents) {
    const list = eventsByFloor.get(event.orderKey);
    if (list) {
      list.push(event);
    } else {
      eventsByFloor.set(event.orderKey, [event]);
      floorOrder.push(event.orderKey);
    }
  }

  const jumpToFloor = (n: number) => {
    document
      .getElementById(`floor-${n}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleFloorChange = (floorEntityId: string) => {
    startFloorChange(async () => {
      await setCampaignCurrentFloorAction(campaignId, floorEntityId || null);
      invalidateCampaignStatus();
      router.refresh();
    });
  };

  // Spin up the FLOOR entity for a floor that has events but no backing entity,
  // then drop the DM on its detail page to name/theme it.
  const handleCreateFloor = (floorNumber: number) => {
    startFloorCreate(async () => {
      const result = await createCampaignFloorEntityAction(campaignId, floorNumber);
      if ("entityId" in result) {
        invalidateCampaignStatus();
        router.push(`/campaigns/${campaignId}/entities/${result.entityId}`);
      }
    });
  };

  const ladderMax = floors.ladder.length;

  const renderEvent = (event: CampaignTimelineEvent) => {
    // Events whose intra-floor order the system can infer (a floor-relative
    // anchor with a concrete offset, ADR 0004) are sorted automatically, so
    // manual drag-reorder is disabled — drag is only the mechanism when the
    // order isn't derived (unscheduled, or a bare floor with no offset).
    const orderDerived = floorRelativeSortKey({
      basis: event.time.basis,
      floor: event.time.floor ?? undefined,
      offset: event.time.offset ?? undefined,
      unit: event.time.unit ?? undefined,
    }) !== null;
    const canDrag =
      canEdit && !event.locked && !orderDerived && editingId !== event.id && !reordering;
    const canDrop =
      draggingId !== null &&
      draggingId !== event.id &&
      draggingEvent?.orderKey === event.orderKey;
    const live = event.id === floors.liveEventId;
    const highlighted = highlightedId === event.id;
    const nodeColor = provenanceMeta(event.source).color;
    // Events selectable as a new cause of this one: any other event not already
    // linked to it in either direction.
    const linkedIds = new Set([
      event.id,
      ...event.causedBy.map((cause) => cause.id),
      ...event.causes.map((effect) => effect.id),
    ]);
    const causeCandidates = events
      .filter((candidate) => !linkedIds.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, title: candidate.title }));
    const participantHref = (participantId: string) => {
      const params = new URLSearchParams({ event: event.id });
      const day = absoluteDayByEventId.get(event.id);
      if (day !== undefined) params.set("rosterDay", String(day));
      return `/campaigns/${campaignId}/entities/${participantId}?${params.toString()}`;
    };

    return (
      <article
        key={event.id}
        id={`event-${event.id}`}
        data-event-id={event.id}
        draggable={canDrag}
        onDragStart={() => setDraggingId(event.id)}
        onDragEnd={() => {
          setDraggingId(null);
          setDropTargetId(null);
        }}
        onDragOver={(domEvent) => {
          if (!canDrop) return;
          domEvent.preventDefault();
          setDropTargetId(event.id);
        }}
        onDragLeave={() =>
          setDropTargetId((current) => (current === event.id ? null : current))
        }
        onDrop={(domEvent) => {
          domEvent.preventDefault();
          handleDrop(event.id);
        }}
        className={[
          "relative pb-[22px] pl-10 transition-opacity",
          draggingId === event.id ? "opacity-40" : "",
          canDrop && dropTargetId === event.id
            ? "before:absolute before:left-[6px] before:top-[-4px] before:h-px before:w-[calc(100%-6px)] before:bg-[var(--accent)]"
            : "",
        ].join(" ")}
      >
        {/* spine node, coloured by provenance */}
        <span
          aria-hidden
          className="absolute left-[7px] top-[4px] h-[13px] w-[13px] rounded-full"
          style={{
            background: "var(--bg)",
            border: `2px solid ${nodeColor}`,
            boxShadow: live
              ? "0 0 0 4px color-mix(in srgb, var(--hot) 22%, transparent)"
              : "none",
          }}
        >
          {event.secret && (
            <span
              className="absolute rounded-full"
              style={{ inset: 2, border: "1px solid var(--bg-1)" }}
            />
          )}
        </span>

        <div
          className="panel bracket px-[15px] pb-[13px] pt-3 transition-shadow"
          style={{
            background: live
              ? "color-mix(in srgb, var(--hot) 4%, var(--bg-1))"
              : "var(--bg-1)",
            boxShadow: highlighted
              ? "0 0 0 1px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent)"
              : undefined,
          }}
        >
          {/* meta row */}
          <div className="mb-2 flex flex-wrap items-center gap-[9px]">
            {canDrag && (
              <GripVertical
                aria-hidden
                size={13}
                className="cursor-grab text-[var(--ink-faint)]"
              />
            )}
            {live && (
              <span className="inline-flex items-center gap-[6px] font-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--hot)]">
                <span className="live-dot" />
                Now
              </span>
            )}
            <span className="font-mono text-[10.5px] tracking-[.04em] text-[var(--ink-dim)]">
              {formatTime(event.time)}
            </span>
            <SourceBadge source={event.source} small />
            {event.secret && (
              <span
                className="font-mono text-[8.5px] uppercase tracking-[.08em]"
                style={{ color: "var(--hot)" }}
              >
                DM-only
              </span>
            )}

            <span className="font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              {event.participants.length} participants
            </span>
            {canEdit && (
              <div className="ml-auto flex shrink-0 items-center gap-[6px]">
                {!event.locked && editingId !== event.id && (
                  <button
                    type="button"
                    onClick={() => setEditingId(event.id)}
                    aria-label="Edit event"
                    className="inline-flex items-center gap-[6px] border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Pencil aria-hidden size={11} />
                    Edit
                  </button>
                )}
                <form action={setCampaignEventLockAction.bind(null, campaignId, event.id, event.locked)}>
                  <button
                    type="submit"
                    aria-label={event.locked ? "Unlock event" : "Lock event"}
                    title={event.locked ? "Unlock event" : "Lock event"}
                    className="inline-flex items-center border px-[7px] py-[5px] transition-colors cursor-pointer"
                    style={{
                      borderColor: event.locked ? "var(--sys)" : "var(--line)",
                      color: event.locked ? "var(--sys)" : "var(--ink-faint)",
                    }}
                  >
                    {event.locked ? <Lock aria-hidden size={11} /> : <Unlock aria-hidden size={11} />}
                  </button>
                </form>
                {!event.locked && (
                  <form
                    action={async () => {
                      await archiveCampaignEventAction(campaignId, event.id);
                      setRemovedEventId(event.id);
                    }}
                  >
                    <button
                      type="submit"
                      aria-label="Remove event"
                      title="Remove event"
                      className="inline-flex items-center border border-[var(--line)] px-[7px] py-[5px] text-[var(--ink-faint)] hover:border-[var(--no)] hover:text-[var(--no)]"
                    >
                      <Trash2 aria-hidden size={11} />
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          <h3 className="font-display text-[16.5px] font-semibold leading-[1.25] text-[var(--ink)]">
            {event.title}
          </h3>

          {editingId === event.id && (
            <EditEventForm
              campaignId={campaignId}
              event={event}
              candidates={candidates}
              crawlerCandidates={crawlerCandidates}
              personaCandidates={personaCandidates}
              anchorCandidates={anchorCandidates}
              resolveName={resolveName}
              causeCandidates={causeCandidates}
              searchParticipants={searchParticipants}
              searchCrawlers={searchCrawlers}
              searchPersona={searchPersona}
              onFocusEvent={focusEvent}
              onRemoveCausality={setRemovedCausalityId}
              onClose={() => setEditingId(null)}
            />
          )}

          {editingId !== event.id && event.summary && (
            <p className="mt-[6px] max-w-[660px] text-[12.5px] leading-[1.55] text-[var(--ink-dim)]">
              {event.summary}
            </p>
          )}

          {editingId !== event.id && event.participants.length > 0 && (
            <div className="mt-[11px] flex flex-wrap gap-[6px_7px]">
              {event.participants.map((participant) => (
                <Link
                  key={`${event.id}-${participant.id}-${participant.role}`}
                  href={participantHref(participant.id)}
                  className="inline-flex items-center gap-[6px] border border-[var(--line)] bg-[var(--bg-2)] px-[7px] py-[3px] text-[11.5px] text-[var(--ink-dim)] hover:border-[var(--line-strong)]"
                >
                  <TypeDot type={participant.type} size={7} />
                  <span className="text-[var(--ink)]">{participant.name}</span>
                  <span className="font-mono text-[8.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                    {participant.role}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {editingId !== event.id && (event.causedBy.length > 0 || event.causes.length > 0) && (
            <div className="mt-[11px] border-t border-[var(--line)] pt-[10px]">
              {event.causedBy.length > 0 && (
                <Thread
                  dir="in"
                  items={event.causedBy}
                  campaignId={campaignId}
                  canEdit={false}
                  warnings={causalityWarnings}
                  onFocusEvent={focusEvent}
                  onRemove={setRemovedCausalityId}
                />
              )}
              {event.causes.length > 0 && (
                <Thread
                  dir="out"
                  items={event.causes}
                  campaignId={campaignId}
                  canEdit={false}
                  warnings={causalityWarnings}
                  onFocusEvent={focusEvent}
                  onRemove={setRemovedCausalityId}
                />
              )}
            </div>
          )}

          {event.effects.length > 0 && (
            <TimelineEffects
              campaignId={campaignId}
              effects={event.effects}
              resolveName={resolveName}
              canEdit={canEdit}
              onApply={() => applyCampaignEventEffectsAction(campaignId, event.id)}
            />
          )}
        </div>
      </article>
    );
  };

  return (
    <ConsoleScreen
      rail={
        // ── The descent rail ──
        <ScreenRail
          kicker="The Descent"
          caption={`${events.length} ${events.length === 1 ? "event" : "events"} logged`}
          bodyClassName="p-[10px_10px_16px]"
          footer={
            <>
              {canEdit && floors.floorEntities.length > 0 && (
                <div className="border-t border-[var(--line)] px-[14px] py-[13px]">
                  <label
                    htmlFor="current-floor"
                    className="mb-[9px] block font-mono text-[9px] uppercase tracking-[.18em] text-[var(--ink-faint)]"
                  >
                    Current floor
                  </label>
                  <select
                    id="current-floor"
                    value={floors.currentFloorId ?? ""}
                    onChange={(domEvent) => handleFloorChange(domEvent.target.value)}
                    className="w-full border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px] font-mono text-[11px] text-[var(--ink)]"
                  >
                    <option value="">— None —</option>
                    {floors.floorEntities.map((floor) => (
                      <option key={floor.id} value={floor.id}>
                        {floor.floorNumber != null ? `F${String(floor.floorNumber).padStart(2, "0")} · ` : ""}
                        {floor.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t border-[var(--line)] px-[14px] py-[15px]">
                <div className="mb-[9px] font-mono text-[9px] uppercase tracking-[.18em] text-[var(--ink-faint)]">
                  Filter by origin
                </div>
                <div className="flex flex-wrap gap-[5px]">
                  {TIMELINE_FILTERS.map((option) => {
                    const on = filter === option;
                    const color = filterColor(option);
                    let background = "transparent";
                    let textColor = "var(--ink-dim)";
                    if (on) {
                      background =
                        option === "ALL"
                          ? "var(--accent)"
                          : `color-mix(in srgb, ${color} 16%, transparent)`;
                      textColor = option === "ALL" ? "var(--accent-ink)" : color;
                    }
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setFilter(option)}
                        className="border px-[9px] py-1 font-mono text-[10px] uppercase tracking-[.08em]"
                        style={{
                          background,
                          color: textColor,
                          borderColor: on ? color : "var(--line-strong)",
                        }}
                      >
                        {filterLabel(option)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          }
        >
          <div className="px-[6px] pb-2 pt-1 font-mono text-[9px] uppercase tracking-[.18em] text-[var(--ink-faint)]">
            Floors 01 — {String(ladderMax).padStart(2, "0")}
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="absolute bottom-2 left-[17px] top-2 w-px bg-[var(--line)]"
            />
            {floors.ladder.map((floor) => {
              const accent = floor.current;
              const dotColor = floorDotColor(floor);
              return (
                <button
                  key={floor.number}
                  type="button"
                  onClick={() => floor.logged && jumpToFloor(floor.number)}
                  title={
                    floor.name
                      ? `Floor ${floor.number} — ${floor.name}`
                      : `Floor ${floor.number}${floor.reached ? "" : " · not yet reached"}`
                  }
                  className="relative grid w-full grid-cols-[24px_1fr_auto] items-center gap-[9px] px-2 py-[6px] text-left"
                  style={{
                    background: accent ? "var(--bg-3)" : "transparent",
                    borderLeft: `2px solid ${accent ? "var(--accent)" : "transparent"}`,
                    opacity: floor.reached ? 1 : 0.4,
                  }}
                >
                  <span className="grid place-items-center">
                    <span
                      className="z-[1] h-[9px] w-[9px] rounded-full"
                      style={{ background: "var(--bg-1)", border: `2px solid ${dotColor}` }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: floorLabelColor(floor) }}
                    >
                      F{String(floor.number).padStart(2, "0")}
                    </span>
                    {floor.name && (
                      <span
                        className="ml-2 truncate text-[11.5px]"
                        style={{ color: accent ? "var(--ink)" : "var(--ink-dim)" }}
                      >
                        {floor.name}
                      </span>
                    )}
                  </span>
                  {floor.logged && (
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      {floor.count}
                    </span>
                  )}
                  {!floor.logged && !floor.reached && (
                    <Lock aria-hidden size={10} className="text-[var(--line-strong)]" />
                  )}
                </button>
              );
            })}
          </div>
        </ScreenRail>
      }
    >
        <ScreenHeader
          kicker="Timeline · most recent first"
          title="Crawl Timeline"
          actions={
            <>
              <HudTag>
                {shownEvents.length} / {events.length} shown
              </HudTag>
              {causalityWarnings.size > 0 && (
                <span
                  title="Causal links where an effect is placed before its cause on the timeline. Re-anchor or drag the events to resolve."
                  className="inline-flex items-center gap-[6px] border px-[9px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em]"
                  style={{ borderColor: "var(--hot)", color: "var(--hot)" }}
                >
                  <AlertTriangle aria-hidden size={12} />
                  {causalityWarnings.size} out of order
                </span>
              )}
              {canEdit && canOrderFromCausality && (
                <button
                  type="button"
                  onClick={handleOrderFromCausality}
                  disabled={ordering}
                  title="Reorder unscheduled events within each floor so every cause sits before its effect. Locked and time-anchored events stay put."
                  className="inline-flex items-center gap-[6px] border px-[9px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] disabled:opacity-50"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  <ArrowDownUp aria-hidden size={12} />
                  {ordering ? "Ordering..." : "Order from causality"}
                </button>
              )}
              {canEdit && !open && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-[7px] border border-[var(--accent)] bg-[var(--accent)] px-[13px] py-2 font-mono text-[11px] uppercase tracking-[.06em] text-[var(--accent-ink)]"
                >
                  <Plus aria-hidden size={14} />
                  Log event
                </button>
              )}
            </>
          }
        />

        {(removedEventId || removedCausalityId) && (
          <div className="border-b border-[var(--line)] bg-[var(--bg-2)] px-[26px] py-3">
            {removedEventId && (
              <div className="flex max-w-[760px] items-center justify-between gap-3 text-xs text-[var(--ink-dim)]">
                <span>Event removed.</span>
                <form
                  action={async () => {
                    await restoreCampaignEventAction(campaignId, removedEventId);
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
              <div className="flex max-w-[760px] items-center justify-between gap-3 text-xs text-[var(--ink-dim)]">
                <span>Causality link removed.</span>
                <form
                  action={async () => {
                    await restoreCampaignEventCausalityAction(
                      campaignId,
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

        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-6">
          <div className="max-w-[760px]">
            {open && (
              <div className="mb-6">
                <NewEventForm
                  campaignId={campaignId}
                  candidates={candidates}
                  crawlerCandidates={crawlerCandidates}
                  personaCandidates={personaCandidates}
                  anchorCandidates={anchorCandidates}
                  searchParticipants={searchParticipants}
                  searchCrawlers={searchCrawlers}
                  searchPersona={searchPersona}
                  onClose={() => setOpen(false)}
                />
              </div>
            )}

            {reorderError && (
              <p role="alert" className="mb-3 text-[11px] text-[var(--no)]">
                {reorderError}
              </p>
            )}

            {events.length > 1 && canEdit && (
              <p className="mb-4 font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                Drag events to reorder them within a floor.
              </p>
            )}

            {floorOrder.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center border border-dashed border-[var(--line)] p-[30px] text-center text-[var(--ink-faint)]">
                <div>
                  <Search aria-hidden size={26} className="mx-auto mb-3 opacity-60" />
                  <p className="text-[13px]">
                    {events.length === 0
                      ? "No events logged yet. Use Log event to start the campaign timeline."
                      : `No ${filter.toLowerCase()} events in the log yet.`}
                  </p>
                </div>
              </div>
            ) : (
              floorOrder.map((floorNumber, index) => {
                const descriptor = floors.byNumber[floorNumber];
                const isCurrent = floors.currentFloorNumber === floorNumber;
                const floorEvents = eventsByFloor.get(floorNumber) ?? [];
                return (
                  <section
                    key={floorNumber}
                    id={`floor-${floorNumber}`}
                    className={index === floorOrder.length - 1 ? "" : "mb-[30px]"}
                  >
                    <div className="relative">
                      <div
                        aria-hidden
                        className="absolute bottom-0 left-[13px] top-[26px] w-px"
                        style={{
                          background: isCurrent
                            ? "color-mix(in srgb, var(--accent) 35%, var(--line-strong))"
                            : "var(--line-strong)",
                        }}
                      />
                      {/* floor header */}
                      <header className="relative mb-4 pl-10">
                        <span
                          aria-hidden
                          className="absolute left-[6px] top-[5px] grid h-[17px] w-[17px] place-items-center"
                          style={{
                            border: `1.5px solid ${isCurrent ? "var(--accent)" : "var(--ink-faint)"}`,
                            background: "var(--bg)",
                          }}
                        >
                          <span
                            className="h-[5px] w-[5px]"
                            style={{ background: isCurrent ? "var(--accent)" : "var(--ink-faint)" }}
                          />
                        </span>
                        <div className="flex flex-wrap items-baseline gap-[14px]">
                          <span
                            className="whitespace-nowrap font-mono text-[11px] tracking-[.22em]"
                            style={{ color: isCurrent ? "var(--accent)" : "var(--ink-faint)" }}
                          >
                            FLOOR {String(floorNumber).padStart(2, "0")}
                          </span>
                          {descriptor?.name && (
                            <h2 className="font-display text-[21px] font-bold uppercase tracking-[.01em] text-[var(--ink)]">
                              {descriptor.entityId ? (
                                <Link
                                  href={`/campaigns/${campaignId}/entities/${descriptor.entityId}`}
                                  className="transition-colors hover:text-[var(--accent)]"
                                >
                                  {descriptor.name}
                                </Link>
                              ) : (
                                descriptor.name
                              )}
                            </h2>
                          )}
                          {isCurrent && (
                            <span className="inline-flex items-center gap-[6px] whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--hot)]">
                              <span className="live-dot" />
                              On air
                            </span>
                          )}
                          {canEdit && !descriptor?.entityId && (
                            <button
                              type="button"
                              onClick={() => handleCreateFloor(floorNumber)}
                              disabled={creatingFloor}
                              title={`Create a FLOOR entity for floor ${floorNumber}`}
                              className="inline-flex items-center gap-[5px] whitespace-nowrap border border-[var(--line-strong)] px-[8px] py-[3px] font-mono text-[9px] uppercase tracking-[.1em] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                            >
                              <Plus aria-hidden size={11} />
                              Create floor
                            </button>
                          )}
                        </div>
                        <div className="mt-[5px] flex flex-wrap gap-[14px] font-mono text-[10.5px] text-[var(--ink-faint)]">
                          {descriptor?.theme && (
                            <span className="text-[var(--ink-dim)]">{descriptor.theme}</span>
                          )}
                          {dayRangeByFloor.get(floorNumber) && (
                            <span>{formatDayRange(dayRangeByFloor.get(floorNumber)!)}</span>
                          )}
                          <span>
                            {floorEvents.length} {floorEvents.length === 1 ? "event" : "events"}
                          </span>
                        </div>
                      </header>

                      <div>{floorEvents.map((event) => renderEvent(event))}</div>
                    </div>
                  </section>
                );
              })
            )}

            {/* the floor that hasn't happened yet */}
            {filter === "ALL" &&
              floors.currentFloorNumber != null &&
              floors.currentFloorNumber < ladderMax &&
              (() => {
                const next = floors.ladder.find(
                  (floor) => floor.number === floors.currentFloorNumber! + 1,
                );
                if (!next) return null;
                return (
                  <div className="relative mt-2 pl-10 opacity-50">
                    <span
                      aria-hidden
                      className="absolute left-[7px] top-[3px] h-[13px] w-[13px] rounded-full"
                      style={{ border: "2px dashed var(--line-strong)", background: "var(--bg)" }}
                    />
                    <div className="font-mono text-[10.5px] uppercase tracking-[.14em] text-[var(--ink-faint)]">
                      Floor {next.number}
                      {next.name ? ` — ${next.name}` : ""} · not yet reached
                    </div>
                  </div>
                );
              })()}

            {/* "Show older" growth-window link */}
            {truncated && loadOlderHref && (
              <div className="mt-4 flex justify-center">
                <Link
                  href={loadOlderHref}
                  className="rounded border border-[var(--line-muted)] px-4 py-2 text-sm text-[var(--ink-faint)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors"
                >
                  Show older events
                  {totalEvents != null ? ` (${totalEvents} total)` : ""}
                </Link>
              </div>
            )}
          </div>
        </div>
    </ConsoleScreen>
  );
}
