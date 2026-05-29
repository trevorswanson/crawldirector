import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import type { EntityType } from "@/generated/prisma/client";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listEntitiesForUser } from "@/server/services/entities";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kicker } from "@/components/ui/kicker";
import { HudTag } from "@/components/ui/hud-tag";
import { TypeDot } from "@/components/ui/type-dot";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import {
  CreateCrawlerForm,
  CreateGenericEntityForm,
} from "@/components/entities/entity-forms";
import { formatEntityType, formatVisibility } from "@/lib/entities";
import { entityTypeValues } from "@/lib/validation";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string; type?: string }>;
}) {
  const { id } = await params;
  const filters = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const role = campaign.members[0]?.role ?? "MEMBER";
  const type: EntityType | "ALL" =
    filters.type && (entityTypeValues as readonly string[]).includes(filters.type)
      ? (filters.type as EntityType)
      : "ALL";
  const { entities } = await listEntitiesForUser(user.id, id, {
    query: filters.q,
    type,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-[var(--muted-foreground)] hover:underline"
        >
          ← All campaigns
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {campaign.name}
        </h1>
        {campaign.summary && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {campaign.summary}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <HudTag>Role · {role}</HudTag>
          <HudTag>
            {campaign._count.members} member
            {campaign._count.members === 1 ? "" : "s"}
          </HudTag>
          <HudTag>
            {campaign._count.entities} entit
            {campaign._count.entities === 1 ? "y" : "ies"}
          </HudTag>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create crawler</CardTitle>
            <CardDescription>
              Add a PC or NPC crawler with the first structured M1 fields.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCrawlerForm campaignId={id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create entity</CardTitle>
            <CardDescription>
              Add any non-crawler canon node to the campaign graph.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateGenericEntityForm campaignId={id} />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Canon · Entities</Kicker>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            World browser
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Browse and keyword-search campaign entities. Relationships and
            events arrive after the review pipeline.
          </p>
        </div>

        <form className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <Input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search names, summaries, descriptions"
              className="pl-9"
            />
          </div>
          <select
            name="type"
            defaultValue={type}
            className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm"
          >
            <option value="ALL">All types</option>
            {entityTypeValues.map((entityType) => (
              <option key={entityType} value={entityType}>
                {formatEntityType(entityType)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            <Search aria-hidden size={16} />
            Search
          </Button>
        </form>

        {entities.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No matching entities yet.
          </p>
        ) : (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              {entities.length} result{entities.length === 1 ? "" : "s"}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {entities.map((entity) => (
                <li key={entity.id}>
                  <Link href={`/campaigns/${id}/entities/${entity.id}`}>
                    <Card className="h-full transition-colors hover:border-[var(--accent)]">
                      <CardHeader className="gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypeDot type={entity.type} />
                          <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                            {formatEntityType(entity.type)}
                          </span>
                          <span className="ml-auto flex items-center gap-2">
                            <StatusPill status={entity.status} />
                            <SourceBadge source="DM" small />
                          </span>
                        </div>
                        <CardTitle>{entity.name}</CardTitle>
                        <CardDescription>
                          {entity.summary || "No summary yet."}
                        </CardDescription>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <HudTag>{formatVisibility(entity.visibility)}</HudTag>
                          {entity.crawler && (
                            <HudTag>
                              Lv {entity.crawler.level}
                              {entity.crawler.currentFloor
                                ? ` · Floor ${entity.crawler.currentFloor}`
                                : ""}
                            </HudTag>
                          )}
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
