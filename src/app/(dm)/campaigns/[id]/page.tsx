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
        <h1 className="text-2xl font-semibold tracking-tight">
          {campaign.name}
        </h1>
        {campaign.summary && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {campaign.summary}
          </p>
        )}
        <div className="mt-1 flex gap-3 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          <span>Role: {role}</span>
          <span>
            {campaign._count.members} member
            {campaign._count.members === 1 ? "" : "s"}
          </span>
          <span>
            {campaign._count.entities} entit
            {campaign._count.entities === 1 ? "y" : "ies"}
          </span>
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
        <div>
          <h2 className="text-xl font-semibold tracking-tight">World browser</h2>
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
          <ul className="grid gap-3">
            {entities.map((entity) => (
              <li key={entity.id}>
                <Link href={`/campaigns/${id}/entities/${entity.id}`}>
                  <Card className="transition-colors hover:border-[var(--primary)]">
                    <CardHeader className="gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                        <span>{formatEntityType(entity.type)}</span>
                        <span>{formatVisibility(entity.visibility)}</span>
                        {entity.crawler && (
                          <span>
                            Level {entity.crawler.level}
                            {entity.crawler.currentFloor
                              ? `, floor ${entity.crawler.currentFloor}`
                              : ""}
                          </span>
                        )}
                      </div>
                      <CardTitle>{entity.name}</CardTitle>
                      <CardDescription>
                        {entity.summary || "No summary yet."}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
