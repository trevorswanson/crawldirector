import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArchiveEntityForm,
  EditEntityForm,
} from "@/components/entities/entity-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { HudTag } from "@/components/ui/hud-tag";
import { TypeDot } from "@/components/ui/type-dot";
import { StatusPill } from "@/components/ui/status-pill";
import { SourceBadge } from "@/components/ui/source-badge";
import { LockChip } from "@/components/ui/lock-chip";
import { formatEntityType, formatVisibility } from "@/lib/entities";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getEntityForUser } from "@/server/services/entities";

export default async function EntityPage({
  params,
}: {
  params: Promise<{ id: string; entityId: string }>;
}) {
  const { id, entityId } = await params;
  const user = await requireUser();
  const [campaign, entity] = await Promise.all([
    getCampaignForUser(user.id, id),
    getEntityForUser(user.id, id, entityId),
  ]);

  if (!campaign || !entity) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/campaigns/${id}`}
          className="text-sm text-[var(--muted-foreground)] hover:underline"
        >
          Back to {campaign.name}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Kicker className="mb-2">
              <TypeDot type={entity.type} />
              {formatEntityType(entity.type)}
            </Kicker>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {entity.name}
            </h1>
            {entity.summary && (
              <p className="text-sm text-[var(--muted-foreground)]">
                {entity.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusPill status={entity.status} />
              <LockChip locked={entity.locked} />
              <SourceBadge source="DM" />
              <HudTag>{formatVisibility(entity.visibility)}</HudTag>
              <HudTag>v{entity.version}</HudTag>
            </div>
          </div>
          <ArchiveEntityForm campaignId={id} entityId={entity.id} />
        </div>
      </div>

      {entity.type === "CRAWLER" && entity.crawler && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Level" value={entity.crawler.level.toString()} />
          <Stat
            label="Floor"
            value={entity.crawler.currentFloor?.toString() ?? "Unknown"}
          />
          <Stat label="Views" value={entity.crawler.viewCount.toString()} />
          <Stat
            label="Followers"
            value={entity.crawler.followerCount.toString()}
          />
          <Stat
            label="Favorites"
            value={entity.crawler.favoriteCount.toString()}
          />
          <Stat
            label="Status"
            value={entity.crawler.isAlive ? "Alive" : "Dead"}
          />
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Edit entity</CardTitle>
          <CardDescription>
            Direct DM edits apply immediately as auto-approved change sets with
            provenance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditEntityForm campaignId={id} entity={entity} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-[.12em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold text-[var(--ink)]">
        {value}
      </div>
    </div>
  );
}
