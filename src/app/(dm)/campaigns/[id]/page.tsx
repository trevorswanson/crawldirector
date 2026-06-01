import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Search, Sparkles } from "lucide-react";
import type { EntityType, ChangeSource } from "@/generated/prisma/client";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  getEntityTypeCounts,
  listEntitiesForUser,
  type EntityStatusFilter,
} from "@/server/services/entities";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { QuickCreateStub } from "@/components/entities/entity-forms";
import { CampaignSearch } from "@/components/entities/campaign-search";
import { formatEntityType } from "@/lib/entities";
import { cn } from "@/lib/utils";
import { entityTypeValues } from "@/lib/validation";

const STATUS_FILTERS: EntityStatusFilter[] = [
  "ALL",
  "CANON",
  "PENDING",
];

const SOURCE_FILTERS = [
  "ALL",
  "DM",
  "AI",
  "PLAYER",
  "IMPORT",
];

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    q?: string;
    tag?: string;
    type?: string;
    status?: string;
    source?: string;
    locked?: string;
  }>;
}) {
  const { id } = await params;
  const filters = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const activeTag = filters.tag?.trim();
  const activeType =
    filters.type && (entityTypeValues as readonly string[]).includes(filters.type)
      ? (filters.type as EntityType)
      : undefined;
  const activeStatus = (STATUS_FILTERS as readonly string[]).includes(
    filters.status ?? "",
  )
    ? (filters.status as EntityStatusFilter)
    : "ALL";
  const activeSource = SOURCE_FILTERS.includes(filters.source ?? "")
    ? filters.source!
    : "ALL";
  const lockedOnly = filters.locked === "1";

  const sourceFilter =
    activeSource === "PLAYER"
      ? "PLAYER_SUGGESTION"
      : activeSource === "ALL"
        ? "ALL"
        : (activeSource as ChangeSource);

  const [{ entities }, counts] = await Promise.all([
    listEntitiesForUser(user.id, id, {
      query: filters.q,
      tag: activeTag,
      type: activeType ?? "ALL",
      status: activeStatus,
      source: sourceFilter === "ALL" ? undefined : sourceFilter,
      lockedOnly,
    }),
    getEntityTypeCounts(user.id, id),
  ]);
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  // Build a query string from the current facets with overrides applied.
  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: filters.q,
      tag: activeTag,
      type: activeType,
      status: activeStatus === "ALL" ? undefined : activeStatus,
      source: activeSource === "ALL" ? undefined : activeSource,
      locked: lockedOnly ? "1" : undefined,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/campaigns/${id}?${qs}` : `/campaigns/${id}`;
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* FACETS */}
      <div className="order-2 hidden overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-1)] px-4 pb-10 pt-4 lg:order-1 lg:block">

        <Kicker dim noLead className="mb-[10px]">
          Entity type
        </Kicker>
        <div className="flex flex-col">
          {entityTypeValues.map((type) => {
            const count = counts[type] ?? 0;
            if (!count) return null;
            const active = activeType === type;
            const row = (
              <span className="flex w-full items-center gap-[9px] px-2 py-[6px] text-left">
                <TypeDot type={type} />
                <span
                  className="flex-1 text-[12.5px] uppercase"
                  style={{ color: active ? "var(--ink)" : "var(--ink-dim)" }}
                >
                  {formatEntityType(type)}
                </span>
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  {count}
                </span>
              </span>
            );
            return (
              <Link
                key={type}
                href={hrefWith({ type: active ? undefined : type })}
                className={cn(
                  "transition-colors hover:bg-[var(--bg-3)]",
                  active && "bg-[var(--bg-3)]",
                )}
              >
                {row}
              </Link>
            );
          })}
        </div>

        <Kicker dim noLead className="mb-[9px] mt-5">
          Source
        </Kicker>
        <div className="flex flex-wrap gap-[5px]">
          {SOURCE_FILTERS.map((s) => {
            const active = activeSource === s;
            return (
              <Link
                key={s}
                href={hrefWith({ source: s === "ALL" ? undefined : s })}
                className={cn(
                  "border px-[9px] py-1 font-mono text-[10px] uppercase tracking-[.06em]",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--line-strong)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
                )}
              >
                {s}
              </Link>
            );
          })}
        </div>

        <Kicker dim noLead className="mb-[9px] mt-5">
          Status
        </Kicker>
        <div className="flex flex-wrap gap-[5px]">
          {STATUS_FILTERS.map((s) => {
            const active = activeStatus === s;
            return (
              <Link
                key={s}
                href={hrefWith({ status: s === "ALL" ? undefined : s })}
                className={cn(
                  "border px-[9px] py-1 font-mono text-[10px] uppercase tracking-[.06em]",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--line-strong)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
                )}
              >
                {s}
              </Link>
            );
          })}
        </div>

        <Kicker dim noLead className="mb-[9px] mt-5">
          Provenance filters
        </Kicker>
        <Link
          href={hrefWith({ locked: lockedOnly ? undefined : "1" })}
          className="flex w-full items-center gap-2 border px-[10px] py-[9px] font-mono text-[11px]"
          style={{
            borderColor: lockedOnly ? "var(--sys)" : "var(--line-strong)",
            color: lockedOnly ? "var(--sys)" : "var(--ink-dim)",
            background: lockedOnly
              ? "color-mix(in srgb, var(--sys) 12%, transparent)"
              : "transparent",
          }}
        >
          <Lock aria-hidden size={13} />
          Locked only
        </Link>
        <div
          title="AI / import / player provenance arrives with AI generation (M4)."
          aria-disabled
          className="mt-[7px] flex w-full cursor-not-allowed items-center gap-2 border border-dashed border-[var(--line-strong)] px-[10px] py-[9px] font-mono text-[11px] text-[var(--ink-faint)]"
        >
          <Sparkles aria-hidden size={13} />
          AI-origin &amp; never edited
          <span className="ml-auto text-[9px] uppercase tracking-[.08em]">
            M4
          </span>
        </div>
      </div>

      {/* RESULTS */}
      <div className="order-1 flex min-h-0 min-w-0 flex-col lg:order-2">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-1)] px-[22px] py-[14px]">
          <CampaignSearch
            initialQuery={filters.q ?? ""}
            activeTag={activeTag}
            activeType={activeType}
            activeStatus={activeStatus}
            activeSource={activeSource}
            lockedOnly={lockedOnly}
          />
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">
            {entities.length} / {total}
          </span>
          <QuickCreateStub campaignId={id} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[18px]">
          {entities.length === 0 ? (
            <div className="grid h-60 place-items-center text-center text-[var(--ink-faint)]">
              <div>
                <Search aria-hidden size={36} className="mx-auto opacity-40" />
                <p className="mt-3 text-sm">
                  No entities match. Adjust filters or quick-create a stub.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {entities.map((entity) => (
                <Link
                  key={entity.id}
                  href={`/campaigns/${id}/entities/${entity.id}`}
                  className="panel flex flex-col gap-[9px] p-[14px] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-2)]"
                >
                  <div className="flex items-center gap-2">
                    <TypeDot type={entity.type} />
                    <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                      {formatEntityType(entity.type)}
                    </span>
                    <span className="ml-auto flex items-center gap-[6px]">
                      {entity.locked && (
                        <Lock
                          aria-hidden
                          size={12}
                          style={{ color: "var(--sys)" }}
                        />
                      )}
                      <SourceBadge source={entity.source} small />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[16px] font-semibold">
                      {entity.name}
                    </span>
                    {entity.isStub && (
                      <span className="hud-tag px-[5px] py-px text-[8.5px] text-[var(--ink-faint)]">
                        Stub
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
                    {entity.summary || "No summary yet."}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusPill status={entity.status} />
                    {entity.crawler?.currentFloor != null && (
                      <span className="ml-auto font-mono text-[9.5px] text-[var(--ink-faint)]">
                        Floor {entity.crawler.currentFloor}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
