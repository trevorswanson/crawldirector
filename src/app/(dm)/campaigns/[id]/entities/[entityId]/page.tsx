import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Eye, EyeOff, Lock, Pencil, Unlock } from "lucide-react";

import {
  toggleEntityFieldLockAction,
  toggleEntityLockAction,
} from "@/app/(dm)/actions";
import {
  ArchiveEntityForm,
  EditEntityForm,
} from "@/components/entities/entity-forms";
import { buttonVariants } from "@/components/ui/button";
import { HudTag } from "@/components/ui/hud-tag";
import { Kicker } from "@/components/ui/kicker";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType, formatVisibility } from "@/lib/entities";
import { cn } from "@/lib/utils";
import { visibilityValues } from "@/lib/validation";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getEntityForUser, type EntityDetail } from "@/server/services/entities";
import { getEntityProvenance } from "@/server/services/review";

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; entityId: string }>;
  searchParams?: Promise<{ edit?: string }>;
}) {
  const { id, entityId } = await params;
  const editing = Boolean((await searchParams)?.edit);
  const user = await requireUser();
  const [campaign, entity] = await Promise.all([
    getCampaignForUser(user.id, id),
    getEntityForUser(user.id, id, entityId),
  ]);

  if (!campaign || !entity) notFound();

  const provenance = await getEntityProvenance(user.id, id, entityId);
  const fields = entityFields(entity);
  const detailHref = `/campaigns/${id}/entities/${entityId}`;

  return (
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
            World Browser
          </Link>
          <span className="truncate font-mono text-[10.5px] text-[var(--ink-faint)]">
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
          <h1 className="font-display text-[30px] font-bold leading-[1.05] tracking-[.01em]">
            {entity.name}
          </h1>
          {entity.summary && (
            <p className="mt-[10px] text-[15px] leading-[1.4] text-[var(--ink-dim)]">
              {entity.summary}
            </p>
          )}

          {editing ? (
            <section className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <Kicker dim noLead>
                  Edit entity
                </Kicker>
                <Link
                  href={detailHref}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Done
                </Link>
              </div>
              <p className="mb-4 text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
                Direct DM edits apply immediately as auto-approved change sets
                with provenance.{" "}
                {(entity.locked || entity.lockedFields.length > 0) &&
                  "Locked fields are protected — unlock them in the rail first."}
              </p>
              <EditEntityForm campaignId={id} entity={entity} />
            </section>
          ) : (
            <>
              {entity.description && (
                <div className="mt-[22px]">
                  <Kicker dim noLead className="mb-[10px]">
                    Description
                  </Kicker>
                  <p className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-[var(--ink)] [text-wrap:pretty]">
                    {entity.description}
                  </p>
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
                          <span className="min-w-0 truncate text-[13.5px] text-[var(--ink)]">
                            {f.value}
                          </span>
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

              {/* timeline — events land in M3 */}
              <div className="mt-[26px]">
                <Kicker dim noLead className="mb-3">
                  Timeline
                </Kicker>
                <PlannedNote milestone="M3">
                  Events and cause→effect history attach here once the
                  relationships &amp; events graph lands.
                </PlannedNote>
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
            <form action={toggleEntityLockAction.bind(null, id, entityId)}>
              <button
                type="submit"
                title={
                  entity.locked
                    ? "Locked — click to unlock"
                    : "Unlocked — click to lock the whole entity"
                }
                className="inline-flex items-center gap-[5px] border px-[7px] py-[4px] font-mono text-[9px] uppercase tracking-[.1em] transition-colors"
                style={{
                  borderColor: entity.locked
                    ? "var(--sys)"
                    : "var(--line-strong)",
                  color: entity.locked ? "var(--sys)" : "var(--ink-faint)",
                }}
              >
                {entity.locked ? (
                  <Lock aria-hidden size={11} />
                ) : (
                  <Unlock aria-hidden size={11} />
                )}
                {entity.locked ? "Locked" : "Lock"}
              </button>
            </form>
            <Link
              href={editing ? detailHref : `${detailHref}?edit=1`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <Pencil aria-hidden size={13} />
              {editing ? "Done" : "Edit"}
            </Link>
          </div>
          {!entity.locked && entity.lockedFields.length > 0 && (
            <p className="font-mono text-[10px] text-[var(--ink-faint)]">
              {entity.lockedFields.length} field
              {entity.lockedFields.length === 1 ? "" : "s"} locked
            </p>
          )}

          <div className="mt-3 mb-[6px] font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            Visibility
          </div>
          <div className="flex flex-col gap-1">
            {visibilityValues.map((v) => {
              const active = entity.visibility === v;
              return (
                <div
                  key={v}
                  className="flex items-center gap-2 text-[11.5px]"
                  style={{ color: active ? "var(--ink)" : "var(--ink-faint)" }}
                >
                  {active ? (
                    <Eye
                      aria-hidden
                      size={13}
                      style={{ color: "var(--ok)" }}
                    />
                  ) : (
                    <EyeOff aria-hidden size={13} />
                  )}
                  {formatVisibility(v).toLowerCase()}
                </div>
              );
            })}
          </div>
        </div>

        {/* connections — relationships land in M3 */}
        <div className="border-b border-[var(--line)] px-[18px] py-4">
          <Kicker dim noLead className="mb-3">
            Connections
          </Kicker>
          <PlannedNote milestone="M3">
            Typed relationships to other entities (any-to-any) appear here once
            the graph lands.
          </PlannedNote>
        </div>

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
              <ProvRow k="Last change">{provenance.lastChangeTitle}</ProvRow>
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
            <ArchiveEntityForm campaignId={id} entityId={entity.id} />
          </div>
        </div>
      </aside>
    </div>
  );
}

type FieldRow = { key: string; label: string; value: string };

// Structured fields for the Fields table. Keys match the review service's patch
// field names so each row's lock toggle maps to the same `lockedFields` entry.
// Name/summary/description live in the header/description, not here (per mockup).
function entityFields(entity: EntityDetail): FieldRow[] {
  const rows: FieldRow[] = [];
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
        value: c.currentFloor == null ? "Unknown" : String(c.currentFloor),
      },
    );
  }
  rows.push(
    {
      key: "visibility",
      label: "Visibility",
      value: formatVisibility(entity.visibility),
    },
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

function PlannedNote({
  milestone,
  children,
}: {
  milestone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-[var(--line-strong)] bg-[var(--bg-2)] px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
        Planned · {milestone}
      </div>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ink-faint)]">
        {children}
      </p>
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
