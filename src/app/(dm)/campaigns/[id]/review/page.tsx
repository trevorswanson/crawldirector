import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  Check,
  Lock,
  Save,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  approveChangeSetAction,
  approveChangeSetRunAction,
  editChangeOperationPatchAction,
  editEventEffectsOperationAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
  setChangeOperationDecisionAction,
  supersedeChangeSetAction,
} from "@/app/(dm)/actions";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";
import {
  EffectOperationEditor,
  type ReviewEffectSeed,
} from "@/components/review/effect-operation-editor";
import { Button } from "@/components/ui/button";
import { HudTag } from "@/components/ui/hud-tag";
import { Input } from "@/components/ui/input";
import { Kicker } from "@/components/ui/kicker";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listEntitiesForUser } from "@/server/services/entities";
import {
  listPendingChangeSetsForUser,
  type ReviewPatch,
  type ReviewQueueItem,
  type ReviewQueueOperation,
} from "@/server/services/review";
import { eventEffectStatValues, type EventEffectStat } from "@/lib/validation";
import { cn } from "@/lib/utils";

const effectStatSet = new Set<string>(eventEffectStatValues);

const SOURCE_FILTERS = ["ALL", "AI", "PLAYER", "IMPORT"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const OP_VERB: Record<string, string> = {
  CREATE_ENTITY: "Create",
  UPDATE_ENTITY: "Update",
  DELETE_ENTITY: "Delete",
  CREATE_RELATIONSHIP: "Relate",
  UPDATE_RELATIONSHIP: "Update edge",
  DELETE_RELATIONSHIP: "Remove edge",
  CREATE_EVENT: "Log event",
  UPDATE_EVENT: "Update event",
  APPLY_EVENT_EFFECTS: "Apply effects",
};

export default async function ReviewQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ selected?: string; source?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  const changeSets = await listPendingChangeSetsForUser(user.id, id);
  // Only the structured effect-row editor needs the campaign's crawlers; skip
  // the query entirely when no pending proposal applies event effects.
  const hasEffectOps = changeSets.some((changeSet) =>
    changeSet.operations.some((operation) => operation.op === "APPLY_EVENT_EFFECTS"),
  );
  const crawlerCandidates: EntityCandidate[] = hasEffectOps
    ? (await listEntitiesForUser(user.id, id)).entities
        .filter((entity) => entity.type === "CRAWLER")
        .map((entity) => ({ id: entity.id, name: entity.name, type: entity.type }))
    : [];
  const activeSource = sourceFilter(query.source);
  const filteredChangeSets = changeSets.filter((changeSet) =>
    sourceMatches(changeSet.source, activeSource),
  );
  const selected =
    filteredChangeSets.find((changeSet) => changeSet.id === query.selected) ??
    filteredChangeSets[0] ??
    null;
  const runGroups = groupPendingRuns(changeSets);

  const hrefWith = (overrides: { selected?: string; source?: SourceFilter }) => {
    const next = new URLSearchParams();
    const source = overrides.source ?? activeSource;
    const selectedId =
      "selected" in overrides ? overrides.selected : selected?.id;
    if (source !== "ALL") next.set("source", source);
    if (selectedId) next.set("selected", selectedId);
    const qs = next.toString();
    return qs ? `/campaigns/${id}/review?${qs}` : `/campaigns/${id}/review`;
  };

  if (changeSets.length === 0) {
    return (
      <div className="grid h-full place-items-center bg-[var(--bg)] px-6">
        <div className="panel bracket max-w-xl p-6">
          <Kicker noLead>Review Queue</Kicker>
          <h1 className="mt-3 font-display text-[22px] font-semibold">
            No pending proposals
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-dim)]">
            Direct DM edits are auto-approved with provenance. AI, import, and
            player-suggestion proposals will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden bg-[var(--bg)] lg:grid-cols-[324px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-[var(--line)] bg-[var(--bg-1)] lg:flex">
        <div className="border-b border-[var(--line)] px-4 py-[13px]">
          <Kicker noLead className="mb-[10px]">
            Review Queue · {changeSets.length} sets
          </Kicker>
          <div className="flex flex-wrap gap-[5px]">
            {SOURCE_FILTERS.map((source) => (
              <Link
                key={source}
                href={hrefWith({ source, selected: undefined })}
                className={cn(
                  "border px-[9px] py-1 font-mono text-[10px] uppercase tracking-[.08em]",
                  activeSource === source
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--line-strong)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
                )}
              >
                {source}
              </Link>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredChangeSets.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--ink-faint)]">
              No pending {activeSource.toLowerCase()} proposals.
            </div>
          ) : (
            filteredChangeSets.map((changeSet) => {
              const selectedRow = selected?.id === changeSet.id;
              const status = reviewStatus(changeSet);
              return (
                <Link
                  key={changeSet.id}
                  href={hrefWith({ selected: changeSet.id })}
                  className={cn(
                    "block border-b border-[var(--line)] border-l-2 px-4 py-[13px] text-left transition-colors hover:bg-[var(--bg-3)]",
                    selectedRow
                      ? "border-l-[var(--accent)] bg-[var(--bg-3)]"
                      : "border-l-transparent",
                  )}
                >
                  <div className="mb-[7px] flex items-center gap-2">
                    <SourceBadge source={changeSet.source} small />
                    <StatusPill status={status} />
                    <span className="ml-auto font-mono text-[9.5px] text-[var(--ink-faint)]">
                      {formatRelativeTime(changeSet.createdAt)}
                    </span>
                  </div>
                  <div className="mb-[5px] text-[13px] font-semibold leading-[1.35] text-[var(--ink)]">
                    {changeSet.title}
                  </div>
                  <div className="flex gap-3 font-mono text-[10px] text-[var(--ink-faint)]">
                    <span>{changeSet.operations.length} ops</span>
                    {changeSet.runId && <span>run {shortRunId(changeSet.runId)}</span>}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="border-b border-[var(--line)] bg-[var(--bg-1)] px-4 py-3 lg:hidden">
          <Kicker noLead className="mb-[10px]">
            Review Queue · {changeSets.length} sets
          </Kicker>
          <div className="mb-3 flex flex-wrap gap-[5px]">
            {SOURCE_FILTERS.map((source) => (
              <Link
                key={source}
                href={hrefWith({ source, selected: undefined })}
                className={cn(
                  "border px-[9px] py-1 font-mono text-[10px] uppercase tracking-[.08em]",
                  activeSource === source
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--line-strong)] text-[var(--ink-dim)]",
                )}
              >
                {source}
              </Link>
            ))}
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {filteredChangeSets.length === 0 ? (
              <div className="min-w-full text-sm text-[var(--ink-faint)]">
                No pending {activeSource.toLowerCase()} proposals.
              </div>
            ) : (
              filteredChangeSets.map((changeSet) => {
                const selectedRow = selected?.id === changeSet.id;
                return (
                  <Link
                    key={changeSet.id}
                    href={hrefWith({ selected: changeSet.id })}
                    className={cn(
                      "min-w-[220px] border border-[var(--line)] px-3 py-2",
                      selectedRow && "border-[var(--accent)] bg-[var(--bg-3)]",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <SourceBadge source={changeSet.source} small />
                      <StatusPill status={reviewStatus(changeSet)} />
                    </div>
                    <div className="line-clamp-2 text-[12px] font-semibold leading-[1.35]">
                      {changeSet.title}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
        {selected ? (
          <ReviewDetail
            campaignId={id}
            changeSet={selected}
            crawlerCandidates={crawlerCandidates}
            run={selected.runId ? runGroups.find((run) => run.runId === selected.runId) : undefined}
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-sm text-[var(--ink-faint)]">
            Select a proposal to review.
          </div>
        )}
      </main>
    </div>
  );
}

function ReviewDetail({
  campaignId,
  changeSet,
  crawlerCandidates,
  run,
}: {
  campaignId: string;
  changeSet: ReviewQueueItem;
  crawlerCandidates: EntityCandidate[];
  run?: PendingRunGroup;
}) {
  const status = reviewStatus(changeSet);
  const acceptedCount = acceptedFieldCount(changeSet);
  const stale = changeSet.operations.some((operation) => operation.isStale);

  return (
    <>
      <div className="border-b border-[var(--line)] bg-[var(--bg-1)] px-[22px] py-4">
        <div className="flex flex-wrap items-start justify-between gap-[18px]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-[10px]">
              <SourceBadge source={changeSet.source} />
              <StatusPill status={status} />
            </div>
            <h1 className="m-0 font-display text-[21px] font-semibold leading-tight">
              {changeSet.title}
            </h1>
            {changeSet.summary && (
              <p className="mt-[7px] max-w-[720px] text-[13px] leading-6 text-[var(--ink-dim)]">
                {changeSet.summary}
              </p>
            )}
          </div>
        </div>

        <div className="mt-[14px] flex flex-wrap items-center gap-2">
          {changeSet.runId && <HudTag>Generator run · {shortRunId(changeSet.runId)}</HudTag>}
          {changeSet.providerId && <HudTag>{changeSet.providerId}</HudTag>}
          {changeSet.model && <HudTag>{changeSet.model}</HudTag>}
          {changeSet.promptId && (
            <HudTag>
              <Sparkles aria-hidden size={12} />
              {changeSet.promptId}
              {changeSet.promptVersion ? `@${changeSet.promptVersion}` : ""}
            </HudTag>
          )}
          <HudTag>base {baseVersionLabel(changeSet.baseVersions)}</HudTag>
          {run && (
            <HudTag>
              {run.proposalCount} pending proposal
              {run.proposalCount === 1 ? "" : "s"}
            </HudTag>
          )}
          {run && (
            <HudTag>
              {run.operationCount} operation
              {run.operationCount === 1 ? "" : "s"}
            </HudTag>
          )}
        </div>

        <div className="mt-[14px] flex flex-wrap items-center gap-2">
          <form action={approveChangeSetAction.bind(null, campaignId, changeSet.id)}>
            <Button type="submit" variant="ok">
              <Check aria-hidden size={14} />
              Approve {acceptedCount} accepted
            </Button>
          </form>
          <Button disabled title="Planned with relationship/event locks" variant="primary">
            <Lock aria-hidden size={14} />
            Approve &amp; lock · Planned
          </Button>
          {changeSet.runId && (
            <form action={approveChangeSetRunAction.bind(null, campaignId, changeSet.runId)}>
              <Button type="submit" variant="outline">
                Accept all non-conflicting
              </Button>
            </form>
          )}
          {stale && (
            <form action={supersedeChangeSetAction.bind(null, campaignId, changeSet.id)}>
              <Button type="submit" variant="outline">
                <Archive aria-hidden size={14} />
                Supersede
              </Button>
            </form>
          )}
          {changeSet.runId ? (
            <form action={rejectChangeSetRunAction.bind(null, campaignId, changeSet.runId)}>
              <Button type="submit" variant="destructive">
                <X aria-hidden size={14} />
                Reject run
              </Button>
            </form>
          ) : (
            <form action={rejectChangeSetAction.bind(null, campaignId, changeSet.id)}>
              <Button type="submit" variant="destructive">
                <X aria-hidden size={14} />
                Reject set
              </Button>
            </form>
          )}
          <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
            {changeSet.operations.length} operation
            {changeSet.operations.length === 1 ? "" : "s"}
            {run ? ` · ${run.proposalCount} proposals in run` : ""}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-4">
        {changeSet.operations.map((operation) => (
          <OperationBlock
            key={operation.id}
            campaignId={campaignId}
            changeSetId={changeSet.id}
            crawlerCandidates={crawlerCandidates}
            operation={operation}
          />
        ))}
      </div>
    </>
  );
}

function OperationBlock({
  campaignId,
  changeSetId,
  crawlerCandidates,
  operation,
}: {
  campaignId: string;
  changeSetId: string;
  crawlerCandidates: EntityCandidate[];
  operation: ReviewQueueOperation;
}) {
  const rejected = operation.decision === "REJECTED";
  const accepted = operation.decision === "ACCEPTED" || operation.decision === "EDITED";
  const isEffectOp = operation.op === "APPLY_EVENT_EFFECTS";

  return (
    <div
      className={cn(
        "panel fade-in mb-3",
        rejected && "opacity-55",
        !rejected && "border-[var(--line-strong)]",
      )}
    >
      <div className="flex items-center justify-between gap-3 bg-[var(--bg-2)] px-3 py-[10px]">
        <div className="flex min-w-0 items-center gap-[10px]">
          <HudTag className="border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]">
            {OP_VERB[operation.op] ?? operation.op.replaceAll("_", " ")}
          </HudTag>
          <HudTag>{operation.decision.replaceAll("_", " ")}</HudTag>
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            {operation.targetEntityType ?? operation.targetType}
          </span>
          <span className="truncate text-[13.5px] font-semibold">
            {operation.targetLabel ?? operation.targetId ?? "New target"}
          </span>
          {(operation.targetLocked || operation.blockedByLock) && (
            <Lock
              aria-label="Target has locked fields"
              className="shrink-0 text-[var(--sys)]"
              size={13}
            />
          )}
          {operation.isStale && (
            <TriangleAlert
              aria-label="Target has stale fields"
              className="shrink-0 text-[var(--hot)]"
              size={13}
            />
          )}
        </div>
        <div className="flex shrink-0 gap-[6px]">
          <form
            action={setChangeOperationDecisionAction.bind(
              null,
              campaignId,
              changeSetId,
              operation.id,
              "ACCEPTED",
            )}
          >
            <Button
              disabled={operation.decision === "EDITED"}
              size="sm"
              type="submit"
              variant={accepted ? "ok" : "outline"}
            >
              <Check aria-hidden size={13} />
              {operation.decision === "EDITED" ? "Edited" : "Accept all"}
            </Button>
          </form>
          <form
            action={setChangeOperationDecisionAction.bind(
              null,
              campaignId,
              changeSetId,
              operation.id,
              "REJECTED",
            )}
          >
            <Button
              size="sm"
              type="submit"
              variant={rejected ? "destructive" : "outline"}
            >
              <X aria-hidden size={13} />
              Reject op
            </Button>
          </form>
        </div>
      </div>

      {isEffectOp ? (
        <EffectOperationEditor
          action={editEventEffectsOperationAction.bind(
            null,
            campaignId,
            changeSetId,
            operation.id,
          )}
          candidates={crawlerCandidates}
          effects={readEffectSeeds(
            operation.patch as ReviewPatch,
            operation.editedPatch as ReviewPatch | null,
          )}
          rejected={rejected}
        />
      ) : (
        <EditableDiffForm
          action={editChangeOperationPatchAction.bind(
            null,
            campaignId,
            changeSetId,
            operation.id,
          )}
          editedPatch={operation.editedPatch as ReviewPatch | null}
          operation={operation}
          patch={operation.patch as ReviewPatch}
          rejected={rejected}
        />
      )}
      {operation.isStale && <ThreeWay operation={operation} />}
    </div>
  );
}

function EditableDiffForm({
  action,
  editedPatch,
  operation,
  patch,
  rejected,
}: {
  action: (formData: FormData) => void | Promise<void>;
  editedPatch: ReviewPatch | null;
  operation: ReviewQueueOperation;
  patch: ReviewPatch;
  rejected: boolean;
}) {
  const entries = Object.entries(patch).filter(([field]) => field !== "_baseVersion");
  return (
    <form action={action}>
      {entries.map(([field, value]) => {
        const editedValue = editedPatch?.[field]?.to;
        const hasEditedField = Boolean(editedPatch && field in editedPatch);
        const inputValue = hasEditedField ? editedValue : value.to;
        const kind = reviewInputKind(inputValue);
        const blocked = fieldBlocked(operation, field);
        const stale = fieldStale(operation, field, value.from);

        return (
          <div
            key={field}
            className={cn(
              "grid grid-cols-[92px_minmax(0,1fr)_auto] items-start gap-3 border-t border-[var(--line)] px-3 py-[9px]",
              blocked && "bg-[color-mix(in_srgb,var(--sys)_7%,transparent)]",
              rejected && "opacity-45",
            )}
          >
            <FieldKey>{field}</FieldKey>
            <div className="min-w-0 text-[12.5px] leading-[1.5]">
              {value.from !== undefined && (
                <div className="mb-[3px] break-words text-[var(--del)] line-through opacity-80">
                  <span className="mono mr-[6px] text-[10px] opacity-70">-</span>
                  {formatReviewValue(value.from)}
                </div>
              )}
              <div className="break-words text-[var(--add)]">
                <span className="mono mr-[6px] text-[10px] opacity-70">+</span>
                <span
                  className={cn(
                    blocked ? "text-[var(--ink-faint)]" : "text-[var(--ink)]",
                    rejected && "line-through",
                  )}
                >
                  {formatReviewValue(value.to)}
                </span>
              </div>
              {blocked && (
                <div className="mt-[5px] inline-flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--sys)]">
                  <Lock aria-hidden size={11} />
                  BLOCKED BY LOCK — UNLOCK TARGET TO APPLY
                </div>
              )}
              {stale && !blocked && (
                <div className="mt-[5px] inline-flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--hot)]">
                  <TriangleAlert aria-hidden size={11} />
                  CANON CHANGED UNDER THIS — RESOLVE BELOW
                </div>
              )}
              <div className="mt-2 max-w-xl">
                <input type="hidden" name="field" value={field} />
                <input type="hidden" name={`kind:${field}`} value={kind} />
                <ReviewValueInput field={field} kind={kind} value={inputValue} />
              </div>
            </div>
            {!blocked ? (
              <div className="flex gap-1">
                <label
                  className={cn(
                    "grid size-[26px] place-items-center border",
                    !editedPatch || hasEditedField
                      ? "border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]"
                      : "border-[var(--line-strong)] text-[var(--ink-faint)]",
                  )}
                  title="Apply field"
                >
                  <input
                    aria-label={`Apply ${field}`}
                    className="sr-only"
                    defaultChecked={!editedPatch || hasEditedField}
                    name={`apply:${field}`}
                    type="checkbox"
                  />
                  <Check aria-hidden size={13} />
                </label>
              </div>
            ) : (
              <div className="w-[26px]" />
            )}
          </div>
        );
      })}
      <div className="border-t border-[var(--line)] px-3 py-3">
        <Button type="submit" size="sm" variant="outline">
          <Save aria-hidden size={14} />
          Save edits
        </Button>
      </div>
    </form>
  );
}

function ThreeWay({ operation }: { operation: ReviewQueueOperation }) {
  const patch = operation.patch as ReviewPatch;
  const field = conflictField(operation) ?? Object.keys(patch).find((key) => key !== "_baseVersion");
  if (!field) return null;
  const proposed = patch[field]?.to;
  const base = patch[field]?.from;
  const canon = operation.currentValues?.[field];

  return (
    <div className="m-3 border border-[color-mix(in_srgb,var(--hot)_40%,var(--line))] bg-[color-mix(in_srgb,var(--hot)_5%,transparent)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--hot)]">
        <TriangleAlert aria-hidden size={13} />
        Conflict on {field} — choose a resolution
      </div>
      <div className="grid gap-px bg-[var(--line)] md:grid-cols-3">
        <ConflictChoice
          color="var(--ink-faint)"
          label={`Base ${baseVersionFromPatch(patch)}`}
          selected={false}
          value={base}
        />
        <ConflictChoice
          color="var(--ok)"
          label="Current canon"
          selected
          value={canon ?? "Current canon changed since this proposal was created."}
        />
        <ConflictChoice
          color="var(--ai)"
          label="Proposed"
          selected={false}
          value={proposed}
        />
      </div>
    </div>
  );
}

function ConflictChoice({
  color,
  label,
  selected,
  value,
}: {
  color: string;
  label: string;
  selected: boolean;
  value: unknown;
}) {
  return (
    <div
      className="min-w-0 bg-[var(--bg-1)] px-3 py-[11px]"
      style={{ borderTop: `2px solid ${selected ? color : "transparent"}` }}
    >
      <div
        className="mb-[6px] font-mono text-[9.5px] uppercase tracking-[.08em]"
        style={{ color }}
      >
        {selected ? "●" : "○"} {label}
      </div>
      <div className="break-words text-xs leading-[1.5] text-[var(--ink-dim)]">
        {formatReviewValue(value)}
      </div>
    </div>
  );
}

function ReviewValueInput({
  field,
  kind,
  value,
}: {
  field: string;
  kind: ReviewInputKind;
  value: unknown;
}) {
  const name = `value:${field}`;
  if (kind === "boolean") {
    return (
      <select
        className="h-8 w-full border border-[var(--line-strong)] bg-[var(--bg)] px-2 font-mono text-[11px] text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        defaultValue={value === false ? "false" : "true"}
        name={name}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (kind === "json") {
    return (
      <Textarea
        className="min-h-16 font-mono text-[11px]"
        defaultValue={JSON.stringify(value, null, 2)}
        name={name}
      />
    );
  }

  if (kind === "string" && String(value ?? "").length > 80) {
    return (
      <Textarea
        className="min-h-16 text-xs"
        defaultValue={formatInputValue(value, kind)}
        name={name}
      />
    );
  }

  return (
    <Input
      className="h-8 font-mono text-[11px]"
      defaultValue={formatInputValue(value, kind)}
      name={name}
      type={kind === "number" ? "number" : "text"}
    />
  );
}

// Read the effect array off an APPLY_EVENT_EFFECTS operation's patch (preferring
// a prior EDITED patch) into serializable seeds for the effect-row editor.
// Bookkeeping fields (review pointers, applied flags) are intentionally dropped —
// the editor only touches the user-editable shape; approval re-reconciles by id.
function readEffectSeeds(
  patch: ReviewPatch,
  editedPatch: ReviewPatch | null,
): ReviewEffectSeed[] {
  const raw =
    editedPatch && "effects" in editedPatch
      ? editedPatch.effects?.to
      : patch.effects?.to;
  if (!Array.isArray(raw)) return [];

  const seeds: ReviewEffectSeed[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== "ADJUST_STAT" && kind !== "SET_STAT" && kind !== "SET_ALIVE") {
      continue;
    }
    if (typeof record.targetEntityId !== "string") continue;

    seeds.push({
      id: typeof record.id === "string" ? record.id : "",
      kind,
      targetEntityId: record.targetEntityId,
      stat:
        typeof record.stat === "string" && effectStatSet.has(record.stat)
          ? (record.stat as EventEffectStat)
          : null,
      delta: typeof record.delta === "number" ? record.delta : null,
      valueNumber:
        typeof record.valueNumber === "number" ? record.valueNumber : null,
      value: typeof record.value === "boolean" ? record.value : null,
      note: typeof record.note === "string" ? record.note : null,
    });
  }
  return seeds;
}

function FieldKey({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
      {children}
    </div>
  );
}

function shortRunId(runId: string) {
  return runId.length > 8 ? runId.slice(0, 8) : runId;
}

type PendingRunGroup = {
  runId: string;
  proposalCount: number;
  operationCount: number;
};

function groupPendingRuns(changeSets: ReviewQueueItem[]): PendingRunGroup[] {
  const groups = new Map<string, PendingRunGroup>();

  for (const changeSet of changeSets) {
    if (!changeSet.runId) continue;
    const group =
      groups.get(changeSet.runId) ??
      {
        runId: changeSet.runId,
        proposalCount: 0,
        operationCount: 0,
      };
    group.proposalCount += 1;
    group.operationCount += changeSet.operations.length;
    groups.set(changeSet.runId, group);
  }

  return Array.from(groups.values());
}

function sourceFilter(source: string | undefined): SourceFilter {
  return SOURCE_FILTERS.includes(source as SourceFilter)
    ? (source as SourceFilter)
    : "ALL";
}

function sourceMatches(source: string, active: SourceFilter) {
  if (active === "ALL") return true;
  return sourceLabel(source) === active;
}

function sourceLabel(source: string): Exclude<SourceFilter, "ALL"> | "DM" {
  if (source === "PLAYER_SUGGESTION") return "PLAYER";
  if (source === "AI" || source === "IMPORT") return source;
  return "DM";
}

function reviewStatus(changeSet: ReviewQueueItem) {
  if (changeSet.operations.some((operation) => operation.isStale)) return "STALE";
  return changeSet.status;
}

function acceptedFieldCount(changeSet: ReviewQueueItem) {
  return changeSet.operations.reduce((count, operation) => {
    if (operation.decision === "REJECTED") return count;
    const patch = operation.patch as ReviewPatch;
    if (operation.decision === "ACCEPTED" || operation.decision === "EDITED") {
      return (
        count +
        Object.keys(patch).filter(
          (field) => field !== "_baseVersion" && !fieldBlocked(operation, field),
        ).length
      );
    }
    return count;
  }, 0);
}

function fieldBlocked(operation: ReviewQueueOperation, field: string) {
  if (!operation.blockedByLock) return false;
  if (operation.targetLocked) return true;
  if (operation.lockedFields.length === 0) return true;
  return operation.lockedFields.includes(field);
}

function fieldStale(
  operation: ReviewQueueOperation,
  field: string,
  baseValue: unknown,
) {
  if (!operation.isStale) return false;
  const current = operation.currentValues?.[field];
  if (current === undefined) return true;
  return formatReviewValue(current) !== formatReviewValue(baseValue);
}

function conflictField(operation: ReviewQueueOperation) {
  const patch = operation.patch as ReviewPatch;
  return Object.entries(patch)
    .filter(([field]) => field !== "_baseVersion")
    .find(([field, value]) => fieldStale(operation, field, value.from))?.[0];
}

function baseVersionFromPatch(patch: ReviewPatch) {
  const version = patch._baseVersion?.to;
  return typeof version === "number" ? `(v${version})` : "";
}

function baseVersionLabel(baseVersions: unknown) {
  if (
    !baseVersions ||
    typeof baseVersions !== "object" ||
    Array.isArray(baseVersions)
  ) {
    return "none";
  }
  const versions = Object.values(baseVersions).filter(
    (version) => typeof version === "number",
  );
  if (versions.length === 0) return "none";
  const unique = Array.from(new Set(versions));
  return unique.length === 1 ? `v${unique[0]}` : `${unique.length} refs`;
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "now";
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function formatReviewValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "Empty";
  if (Array.isArray(value)) return value.join(", ") || "Empty";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type ReviewInputKind = "array" | "boolean" | "json" | "number" | "string";

function reviewInputKind(value: unknown): ReviewInputKind {
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value && typeof value === "object") return "json";
  return "string";
}

function formatInputValue(value: unknown, kind: ReviewInputKind) {
  if (kind === "array" && Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null) return "";
  return String(value);
}
