import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock, Pencil, Unlock } from "lucide-react";

import {
  toggleEntityFieldLockAction,
  toggleEntityLockAction,
} from "@/app/(dm)/actions";
import {
  ConnectionsPanel,
  type ConnectionCandidate,
} from "@/components/entities/connections-panel";
import {
  TimelinePanel,
  type TimelineCandidate,
} from "@/components/entities/timeline-panel";
import { RosterPanel } from "@/components/entities/roster-panel";
import { KnowledgePanel } from "@/components/entities/knowledge-panel";
import { AiActionsDialog } from "@/components/entities/ai-actions-dialog";
import { FieldLockToggle } from "@/components/entities/field-lock-toggle";
import { KindDisplay } from "@/components/entities/kind-display";
import {
  ArchiveEntityForm,
  EditEntityForm,
  EditFormProvider,
  EditRailControls,
  VisibilitySidebarControl,
} from "@/components/entities/entity-forms";
import { HudTag } from "@/components/ui/hud-tag";
import { Kicker } from "@/components/ui/kicker";
import { Markdown } from "@/components/ui/markdown";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";
import { kindFor } from "@/lib/entity-kinds";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  getEntityForUser,
  listCampaignTags,
  listEntitiesForUser,
  type EntityDetail,
} from "@/server/services/entities";
import { listConnectionsForEntity } from "@/server/services/relationships";
import { listEventsForEntity, resolveFloorEntity } from "@/server/services/events";
import { getGroupRoster, isGroupEntityType } from "@/server/services/groups";
import {
  listKnowledgeHeldByEntity,
  listKnowledgeOfEntity,
} from "@/server/services/knowledge";
import { getEntityProvenance } from "@/server/services/review";
import { listAiKeys } from "@/server/services/ai-keys";
import {
  countReferrers,
  validateEntityReferences,
  type ReferenceCheck,
} from "@/server/services/references";

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; entityId: string }>;
  searchParams?: Promise<{ edit?: string; event?: string; rosterDay?: string }>;
}) {
  const { id, entityId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const editing = Boolean(resolvedSearchParams.edit);
  const openEventId = resolvedSearchParams.event;
  const rosterDay = parseRosterDay(resolvedSearchParams.rosterDay);
  const user = await requireUser();
  const [campaign, entity] = await Promise.all([
    getCampaignForUser(user.id, id),
    getEntityForUser(user.id, id, entityId),
  ]);

  if (!campaign || !entity) notFound();

  const isGroup = isGroupEntityType(entity.type);
  // Bespoke per-type read-view display + reference integrity come from the
  // entity-kind registry (ADR 0009/0011). Only types that declare reference
  // fields need the integrity reads — gate them so a plain NPC page skips the work.
  const kind = kindFor(entity.type);
  const hasReferenceFields = Boolean(kind?.referenceFields);
  const [
    provenance,
    connections,
    events,
    candidateList,
    roster,
    campaignTags,
    knownTo,
    knowsAbout,
    aiKeys,
    referenceChecks,
    referrerCount,
  ] = await Promise.all([
    getEntityProvenance(user.id, id, entityId),
    listConnectionsForEntity(user.id, id, entityId),
    listEventsForEntity(user.id, id, entityId),
    listEntitiesForUser(user.id, id),
    isGroup
      ? getGroupRoster(
          user.id,
          id,
          entityId,
          rosterDay === undefined ? {} : { asOfDay: rosterDay },
        )
      : Promise.resolve(null),
    // Only the edit form consumes the campaign tag list (autocomplete); the
    // read view's tag badges use entity.tags. Skip the scan in read mode.
    editing ? listCampaignTags(user.id, id) : Promise.resolve<string[]>([]),
    listKnowledgeOfEntity(user.id, id, entityId),
    listKnowledgeHeldByEntity(user.id, id, entityId),
    // Gate the AI generation panel on a configured provider key (DM-only read;
    // returns [] for players). AI is additive — no key, no panel.
    listAiKeys(user.id, id),
    // Reference integrity (ADR 0011 Part B): resolve this entity's reference
    // fields (broken-ref badge) and count entities that reference it back
    // (impact-aware archive). Both are scoped/DM-aware inside the service.
    hasReferenceFields
      ? validateEntityReferences(user.id, id, entityId)
      : Promise.resolve<ReferenceCheck[]>([]),
    countReferrers(user.id, id, entityId),
  ]);
  const aiConfigured = aiKeys.length > 0;
  const candidates: ConnectionCandidate[] = candidateList.entities
    .filter((candidate) => candidate.id !== entityId)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
    }));
  const timelineCandidates: TimelineCandidate[] = candidates;
  const rosterRelationshipIds = roster
    ? [...roster.leaders, ...roster.members].map((entry) => entry.relationshipId)
    : undefined;
  // Knowledge grants are a DM curation surface; players reaching a player-visible
  // entity page never see the reveal panel (and the reads return [] for them).
  const isDm = candidateList.role !== "PLAYER";
  // Resolve a crawler's current floor to its FLOOR entity so the Floor row links
  // to the floor instead of showing a bare number (ADR 0008 §1).
  const currentFloor =
    entity.type === "CRAWLER" && entity.crawler?.currentFloor != null
      ? await resolveFloorEntity(user.id, id, entity.crawler.currentFloor)
      : null;
  const fields = entityFields(entity, currentFloor);
  const detailHref = `/campaigns/${id}/entities/${entityId}`;

  const renderedDescription = entity.description || "";
  // Whether the narrative fields are protected from edits/AI. Drives the
  // read-view lock toggles so a DM can shield a summary/description (which the
  // entity-fleshing generator then skips).
  const summaryLocked = entity.locked || entity.lockedFields.includes("summary");
  const descriptionLocked =
    entity.locked || entity.lockedFields.includes("description");
  const imageLocked = entity.locked || entity.lockedFields.includes("imageUrl");

  // Bespoke per-type read-view display comes from the entity-kind registry
  // (ADR 0009) instead of inline `type === "ITEM"` branches. The panel is a
  // client component, so the page resolves any reference fields the descriptor
  // declares (ITEM's `itemTypeId` → its ITEM_TYPE entity name) to display strings
  // and flags broken references here via the integrity service (ADR 0011 Part B).
  const resolvedNames: Record<string, string | null> = {};
  const brokenReferences: string[] = [];
  for (const check of referenceChecks) {
    resolvedNames[check.patchKey] = check.resolvedName;
    // Only surface the badge to DMs: a player can't see DM-only targets, so a
    // hidden (out-of-scope) reference would otherwise read as broken (inv. #5).
    if (check.broken && isDm) brokenReferences.push(check.patchKey);
  }

  return (
    <EditFormProvider initialVisibility={entity.visibility} isEditing={editing}>
      <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_304px]">
      {/* MAIN COLUMN */}
      <div className="order-2 min-w-0 overflow-y-auto lg:order-1">
        {/* sticky breadcrumb back-bar */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg)] px-6 py-3">
          <Link
            href={`/campaigns/${id}`}
            className="hud-tag inline-flex items-center gap-1 hover:text-[var(--ink)]"
          >
            <ChevronLeft aria-hidden size={12} />
            WORLD BROWSER
          </Link>
          <span className="truncate font-mono text-[10.5px] text-[var(--ink-faint)] uppercase">
            / {formatEntityType(entity.type)} / {entity.name}
          </span>
        </div>

        <div className="max-w-[760px] px-6 py-6">
          {/* header */}
          <div className="mb-[10px] flex flex-wrap items-center gap-[10px]">
            <TypeDot type={entity.type} size={11} />
            <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
              {formatEntityType(entity.type)}
            </span>
            <StatusPill status={entity.status} />
            {entity.isStub && <HudTag>Stub</HudTag>}
          </div>
          {!editing && (
            <EntityImageBlock
              campaignId={id}
              entityId={entityId}
              entity={entity}
              imageLocked={imageLocked}
            />
          )}
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 font-display text-[30px] font-bold leading-[1.05] tracking-[.01em]">
              {entity.name}
            </h1>
            {isDm && aiConfigured && !editing && (
              <AiActionsDialog
                variant="entity"
                campaignId={id}
                entityId={entityId}
                locked={entity.locked}
              />
            )}
          </div>
          {editing && entity.summary && (
            <p className="mt-[10px] text-[15px] leading-[1.4] text-[var(--ink-dim)]">
              {entity.summary}
            </p>
          )}
          {!editing && (entity.summary || summaryLocked) && (
            <div className="mt-[10px] flex items-start justify-between gap-4">
              <p className="flex-1 text-[15px] leading-[1.4] text-[var(--ink-dim)]">
                {entity.summary || (
                  <span className="italic text-[var(--ink-faint)]">
                    No summary (locked)
                  </span>
                )}
              </p>
              <FieldLockToggle
                campaignId={id}
                entityId={entityId}
                field="summary"
                fieldLocked={summaryLocked}
                entityLocked={entity.locked}
              />
            </div>
          )}

          {/* Bespoke per-type read-view display from the entity-kind registry
              (ADR 0009); the client dispatcher renders the type's panel or
              nothing (a type with no descriptor falls back to generic display). */}
          {!editing && (
            <KindDisplay
              campaignId={id}
              entityId={entityId}
              entity={entity}
              resolvedNames={resolvedNames}
              brokenReferences={brokenReferences}
            />
          )}

          {editing ? (
            <section className="mt-7">
              <Kicker dim noLead className="mb-3">
                Edit entity
              </Kicker>
              <p className="mb-4 text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
                Direct DM edits apply immediately as auto-approved change sets
                with provenance.{" "}
                {(entity.locked || entity.lockedFields.length > 0) &&
                  "Locked fields are protected — unlock them in the rail first."}
              </p>
              <EditEntityForm
                campaignId={id}
                entity={entity}
                itemTypes={candidateList.entities.filter((e) => e.type === "ITEM_TYPE")}
                campaignTags={campaignTags}
              />
            </section>
          ) : (
            <>
              {(renderedDescription || descriptionLocked) && (
                <div className="mt-[22px]">
                  <div className="mb-[10px] flex items-center justify-between gap-4">
                    <Kicker dim noLead>
                      Description
                    </Kicker>
                    <FieldLockToggle
                      campaignId={id}
                      entityId={entityId}
                      field="description"
                      fieldLocked={descriptionLocked}
                      entityLocked={entity.locked}
                    />
                  </div>
                  {renderedDescription ? (
                    <Markdown content={renderedDescription} />
                  ) : (
                    <span className="italic text-[var(--ink-faint)]">
                      Empty description (locked)
                    </span>
                  )}
                </div>
              )}

              {/* structured fields with per-field lock toggles */}
              {fields.length > 0 && (
                <div className="mt-[26px]">
                  <Kicker dim noLead className="mb-3">
                    Fields
                  </Kicker>
                  <div className="panel">
                    {fields.map((f, i) => {
                      const fieldLocked =
                        entity.locked || entity.lockedFields.includes(f.key);
                      return (
                        <div
                          key={f.key}
                          className={cn(
                            "grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-[14px] px-[14px] py-[11px] sm:grid-cols-[140px_minmax(0,1fr)_auto]",
                            i && "border-t border-[var(--line)]",
                          )}
                        >
                          <span className="font-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                            {f.label}
                          </span>
                          {f.key === "tags" && entity.tags.length ? (
                            <span className="flex min-w-0 flex-wrap items-center gap-[5px]">
                              {entity.tags.map((tag) => (
                                <Link
                                  key={tag}
                                  href={`/campaigns/${id}?tag=${encodeURIComponent(tag)}`}
                                  className="hud-tag px-[6px] py-px text-[10px] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)] hover:border-[var(--accent)]"
                                  title={`Filter the World Browser by “${tag}”`}
                                >
                                  {tag}
                                </Link>
                              ))}
                            </span>
                          ) : f.href ? (
                            <Link
                              href={f.href}
                              className="min-w-0 truncate text-[13.5px] text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
                            >
                              {f.value}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate text-[13.5px] text-[var(--ink)]">
                              {f.value}
                            </span>
                          )}
                          <form
                            action={toggleEntityFieldLockAction.bind(
                              null,
                              id,
                              entityId,
                            )}
                          >
                            <input type="hidden" name="field" value={f.key} />
                            <button
                              type="submit"
                              disabled={entity.locked}
                              title={
                                entity.locked
                                  ? "Whole entity is locked"
                                  : fieldLocked
                                    ? "Locked field — click to unlock"
                                    : "Click to lock this field"
                              }
                              className="inline-flex items-center border px-[5px] py-[3px] transition-colors disabled:opacity-50"
                              style={{
                                borderColor: fieldLocked
                                  ? "var(--sys)"
                                  : "var(--line)",
                                color: fieldLocked
                                  ? "var(--sys)"
                                  : "var(--ink-faint)",
                              }}
                            >
                              {fieldLocked ? (
                                <Lock aria-hidden size={11} />
                              ) : (
                                <Unlock aria-hidden size={11} />
                              )}
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* roster — rolled-up membership for group-type entities */}
              {isGroup && roster && (
                <div className="mt-[26px]">
                  <RosterPanel
                    campaignId={id}
                    roster={roster}
                    asOfDay={rosterDay}
                    editable={isDm}
                    candidates={candidates}
                  />
                </div>
              )}

              {/* timeline — events this entity participates in */}
              <div className="mt-[26px]">
                <TimelinePanel
                  campaignId={id}
                  entityId={entityId}
                  entityName={entity.name}
                  entityType={entity.type}
                  events={events}
                  candidates={timelineCandidates}
                  initialEventId={openEventId}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* RIGHT RAIL */}
      <aside className="order-1 overflow-y-auto border-b border-[var(--line)] bg-[var(--bg-1)] lg:order-2 lg:border-b-0 lg:border-l">
        {/* controls */}
        <div className="border-b border-[var(--line)] px-[18px] py-4">
          <Kicker dim noLead className="mb-3">
            Controls
          </Kicker>
          <div className="mb-3 flex flex-wrap gap-2">
            {!editing && (
              <form action={toggleEntityLockAction.bind(null, id, entityId)}>
                <button
                  type="submit"
                  title={
                    entity.locked
                      ? "Locked — click to unlock"
                      : "Unlocked — click to lock the whole entity"
                  }
                  className="inline-flex items-center gap-[6px] border px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110"
                  style={{
                    borderColor: entity.locked
                      ? "var(--sys)"
                      : "var(--line-strong)",
                    background: entity.locked
                      ? "color-mix(in srgb, var(--sys) 12%, transparent)"
                      : "transparent",
                    color: entity.locked ? "var(--sys)" : "var(--ink-dim)",
                  }}
                >
                  {entity.locked ? (
                    <Lock aria-hidden size={12} />
                  ) : (
                    <Unlock aria-hidden size={12} />
                  )}
                  {entity.locked ? "Locked" : "Lock"}
                </button>
              </form>
            )}
            {editing ? (
              <EditRailControls detailHref={detailHref} />
            ) : entity.locked ? (
              <button
                disabled
                title="Entity is locked — unlock it to edit"
                className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] opacity-50 cursor-not-allowed"
              >
                <Pencil aria-hidden size={12} />
                Edit
              </button>
            ) : (
              <Link
                href={`${detailHref}?edit=1`}
                className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
              >
                <Pencil aria-hidden size={12} />
                Edit
              </Link>
            )}
          </div>
          {!entity.locked && entity.lockedFields.length > 0 && (
            <p className="font-mono text-[10px] text-[var(--ink-faint)]">
              {entity.lockedFields.length} field
              {entity.lockedFields.length === 1 ? "" : "s"} locked
            </p>
          )}

          <div className="mt-3 mb-[6px] flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
              Visibility
            </span>
            <form
              action={toggleEntityFieldLockAction.bind(
                null,
                id,
                entityId,
              )}
            >
              <input type="hidden" name="field" value="visibility" />
              <button
                type="submit"
                disabled={editing || entity.locked}
                title={
                  editing
                    ? "Finish or discard edits before changing the visibility lock"
                    : entity.locked
                    ? "Whole entity is locked"
                    : entity.lockedFields.includes("visibility")
                      ? "Visibility is locked — click to unlock"
                      : "Click to lock visibility"
                }
                className="inline-flex items-center border px-[5px] py-[3px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                style={{
                  borderColor: (entity.locked || entity.lockedFields.includes("visibility"))
                    ? "var(--sys)"
                    : "var(--line)",
                  color: (entity.locked || entity.lockedFields.includes("visibility"))
                    ? "var(--sys)"
                    : "var(--ink-faint)",
                }}
              >
                {(entity.locked || entity.lockedFields.includes("visibility")) ? (
                  <Lock aria-hidden size={11} />
                ) : (
                  <Unlock aria-hidden size={11} />
                )}
              </button>
            </form>
          </div>
          <VisibilitySidebarControl
            initialVisibility={entity.visibility}
            isEditing={editing}
            isLocked={entity.locked || entity.lockedFields.includes("visibility")}
          />
        </div>

        {/* connections — typed, any-to-any relationship edges */}
        <div className="border-b border-[var(--line)] px-[18px] py-4">
          <ConnectionsPanel
            campaignId={id}
            entityId={entityId}
            sourceType={entity.type}
            sourceName={entity.name}
            connections={connections}
            candidates={candidates}
            rosterRelationshipIds={rosterRelationshipIds}
          />
        </div>

        {/* knowledge — private reveals / fog of war (M3), DM-only curation */}
        {isDm && (
          <div className="border-b border-[var(--line)] px-[18px] py-4">
            <KnowledgePanel
              campaignId={id}
              entityId={entityId}
              entityName={entity.name}
              knownTo={knownTo}
              knowsAbout={knowsAbout}
              candidates={candidates}
            />
          </div>
        )}

        {/* provenance */}
        <div className="px-[18px] py-4">
          <Kicker dim noLead className="mb-3">
            Provenance
          </Kicker>
          {provenance ? (
            <div className="flex flex-col gap-[10px] text-xs">
              <ProvRow k="Origin">
                <SourceBadge source={provenance.source} small />
                <span className="text-[var(--ink-dim)]">
                  {provenance.authorLabel ?? "—"}
                </span>
              </ProvRow>
              <ProvRow k="Created">{fmtDate(provenance.createdAt)}</ProvRow>
              {provenance.model && (
                <ProvRow k="Model">
                  <span className="font-mono text-[var(--ai)]">
                    {provenance.model}
                  </span>
                </ProvRow>
              )}
              <ProvRow k="Approved by">
                {provenance.approvedByLabel ? (
                  `${provenance.approvedByLabel} · ${fmtDate(provenance.approvedAt)}`
                ) : (
                  <span className="text-[var(--accent)]">pending review</span>
                )}
              </ProvRow>
              <ProvRow k="Last change">
                <SourceBadge source={provenance.lastChangeSource} small />
                <span className="text-[var(--ink-dim)]">
                  {provenance.lastChangeTitle}
                </span>
                {provenance.lastChangeModel && (
                  <span className="font-mono text-[var(--ai)]">
                    · {provenance.lastChangeModel}
                  </span>
                )}
              </ProvRow>
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-faint)]">
              No provenance recorded yet.
            </p>
          )}
          <p className="mt-[14px] border-t border-[var(--line)] pt-3 font-mono text-[10px] leading-[1.6] text-[var(--ink-faint)]">
            Provenance is permanent — retained through approval. You can always
            answer where this came from and who approved it.
          </p>

          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <ArchiveEntityForm
              campaignId={id}
              entityId={entity.id}
              referrerCount={referrerCount}
            />
          </div>
        </div>
      </aside>
    </div>
    </EditFormProvider>
  );
}

// Character-ish kinds read best as a round avatar; places/things/honors as a
// wider illustration card. Mirrors the world-role grouping in entityTypeColor.
const AVATAR_IMAGE_TYPES = new Set([
  "CRAWLER",
  "NPC",
  "SYSTEM_AI",
  "BOSS",
  "MOB_TYPE",
  "DEITY",
]);

// The entity's main image (M1 follow-up): an avatar for characters, an
// illustration card for everything else. Read-view only — the edit form owns the
// imageUrl input. Linked by URL and rendered with a plain <img> (no server-side
// next/image proxy of arbitrary external URLs). The lock toggle sits beside it,
// matching the summary/description read-view affordances, and an empty-but-locked
// field still shows the toggle so a DM can unlock it.
function EntityImageBlock({
  campaignId,
  entityId,
  entity,
  imageLocked,
}: {
  campaignId: string;
  entityId: string;
  entity: EntityDetail;
  imageLocked: boolean;
}) {
  if (!entity.imageUrl && !imageLocked) return null;
  const avatar = AVATAR_IMAGE_TYPES.has(entity.type);
  return (
    <div className="mt-[14px] flex items-start gap-3">
      {entity.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entity.imageUrl}
          alt={`${entity.name}`}
          className={cn(
            "border border-[var(--line)] bg-[var(--bg-2)] object-cover",
            avatar
              ? "h-20 w-20 rounded-full"
              : "max-h-[280px] w-full max-w-[440px] rounded-md",
          )}
        />
      ) : (
        <span className="italic text-[13px] text-[var(--ink-faint)]">
          No image (locked)
        </span>
      )}
      <FieldLockToggle
        campaignId={campaignId}
        entityId={entityId}
        field="imageUrl"
        fieldLocked={imageLocked}
        entityLocked={entity.locked}
      />
    </div>
  );
}

type FieldRow = { key: string; label: string; value: string; href?: string };

function parseRosterDay(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

// Structured fields for the Fields table. Keys match the review service's patch
// field names so each row's lock toggle maps to the same `lockedFields` entry.
// Name/summary/description live in the header/description, not here (per mockup).
function entityFields(
  entity: EntityDetail,
  currentFloor: { id: string; name: string; floorNumber: number } | null,
): FieldRow[] {
  const rows: FieldRow[] = [];
  // ITEM's bespoke data.* rows render via the entity-kind DisplayPanel (ADR 0009);
  // CRAWLER stays here as its own satellite-table path (not a registry entry).
  if (entity.type === "CRAWLER" && entity.crawler) {
    const c = entity.crawler;
    rows.push(
      { key: "crawler.realName", label: "Real name", value: c.realName ?? "—" },
      { key: "crawler.crawlerNo", label: "Crawler ID", value: c.crawlerNo ?? "—" },
      { key: "crawler.level", label: "Level", value: String(c.level) },
      { key: "crawler.hp", label: "HP", value: c.hp == null ? "—" : String(c.hp) },
      { key: "crawler.mp", label: "MP", value: c.mp == null ? "—" : String(c.mp) },
      { key: "crawler.gold", label: "Gold", value: String(c.gold) },
      { key: "crawler.viewCount", label: "Views", value: c.viewCount.toString() },
      {
        key: "crawler.followerCount",
        label: "Followers",
        value: c.followerCount.toString(),
      },
      {
        key: "crawler.favoriteCount",
        label: "Favorites",
        value: c.favoriteCount.toString(),
      },
      { key: "crawler.killCount", label: "Kills", value: String(c.killCount) },
      {
        key: "crawler.isAlive",
        label: "Status",
        value: c.isAlive ? "Alive" : "Dead",
      },
      {
        key: "crawler.currentFloor",
        label: "Floor",
        value:
          c.currentFloor == null
            ? "Unknown"
            : currentFloor
              ? `Floor ${c.currentFloor} · ${currentFloor.name}`
              : `Floor ${c.currentFloor}`,
        ...(currentFloor
          ? { href: `/campaigns/${entity.campaignId}/entities/${currentFloor.id}` }
          : {}),
      },
    );
  }
  rows.push(
    {
      key: "tags",
      label: "Tags",
      value: entity.tags.length ? entity.tags.join(", ") : "—",
    },
  );
  return rows;
}

function ProvRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-[10px]">
      <span className="w-[88px] flex-shrink-0 font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
        {k}
      </span>
      <span className="flex flex-wrap items-center gap-[6px] text-[var(--ink-dim)]">
        {children}
      </span>
    </div>
  );
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
