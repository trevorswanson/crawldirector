import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe2 } from "lucide-react";
import type { EntityType } from "@/generated/prisma/client";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listEntitiesForUser } from "@/server/services/entities";
import { ConsoleScreen, ScreenRail } from "@/components/console/screen";
import { PlayerSystemBanner } from "@/components/console/player-system-banner";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";
import { cn } from "@/lib/utils";
import { entityTypeValues } from "@/lib/validation";

export default async function KnownWorldPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const filters = (await searchParams) ?? {};
  const user = await requireUser();
  // The whole player surface is the visibility projection (invariant #5): only
  // PLAYER_VISIBLE entities (enforced by the service for the PLAYER role) and
  // only CANON (pending proposals never reach a player). The "known world" is
  // a player's small, bounded slice of canon, so it loads unpaginated.
  const [campaign, { entities }] = await Promise.all([
    getCampaignForUser(user.id, id),
    listEntitiesForUser(user.id, id, { status: "CANON", type: "ALL" }),
  ]);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const activeType =
    filters.type && (entityTypeValues as readonly string[]).includes(filters.type)
      ? (filters.type as EntityType)
      : undefined;

  const counts = new Map<EntityType, number>();
  for (const entity of entities) {
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
  }

  const visible = activeType
    ? entities.filter((entity) => entity.type === activeType)
    : entities;

  const hrefForType = (type?: EntityType) =>
    type ? `/play/campaigns/${id}?type=${type}` : `/play/campaigns/${id}`;

  const emptyNoun = activeType
    ? formatEntityType(activeType).toLowerCase()
    : "world";

  return (
    <ConsoleScreen
      rail={
        <ScreenRail bodyClassName="px-4 pb-10 pt-4">
          <Kicker dim noLead className="mb-[10px]">
            Entity type
          </Kicker>
          <div className="flex flex-col">
            <Link
              href={hrefForType(undefined)}
              className={cn(
                "flex w-full items-center gap-[9px] px-2 py-[6px] text-left transition-colors hover:bg-[var(--bg-3)]",
                !activeType && "bg-[var(--bg-3)]",
              )}
            >
              <Globe2
                aria-hidden
                size={12}
                className="text-[var(--ink-faint)]"
              />
              <span
                className="flex-1 text-[12.5px] uppercase"
                style={{ color: !activeType ? "var(--ink)" : "var(--ink-dim)" }}
              >
                All
              </span>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                {entities.length}
              </span>
            </Link>
            {entityTypeValues.map((type) => {
              const count = counts.get(type) ?? 0;
              if (!count) return null;
              const active = activeType === type;
              return (
                <Link
                  key={type}
                  href={hrefForType(active ? undefined : type)}
                  className={cn(
                    "flex w-full items-center gap-[9px] px-2 py-[6px] text-left transition-colors hover:bg-[var(--bg-3)]",
                    active && "bg-[var(--bg-3)]",
                  )}
                >
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
                </Link>
              );
            })}
          </div>
        </ScreenRail>
      }
    >
      <PlayerSystemBanner caption="known world · what your crawler has seen" />

      <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[18px]">
        {visible.length === 0 ? (
          <div className="grid h-60 place-items-center text-center text-[var(--ink-faint)]">
            <div>
              <Globe2 aria-hidden size={36} className="mx-auto opacity-40" />
              <p className="mt-3 text-sm">
                Nothing here yet. Your DM hasn&apos;t revealed any {emptyNoun}{" "}
                details to your crawler.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {visible.map((entity) => (
              <Link
                key={entity.id}
                href={`/play/campaigns/${id}/entities/${entity.id}`}
                className="panel flex flex-col gap-[9px] p-[14px] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-2)]"
              >
                <div className="flex items-center gap-2">
                  <TypeDot type={entity.type} />
                  <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                    {formatEntityType(entity.type)}
                  </span>
                </div>
                <span className="font-display text-[16px] font-semibold">
                  {entity.name}
                </span>
                <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
                  {entity.summary || "No details yet."}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ConsoleScreen>
  );
}
