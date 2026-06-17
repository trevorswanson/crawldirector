import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Search, Share2 } from "lucide-react";

import { JobKind, Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { resolveCampaignEmbedder } from "@/server/ai";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getActiveCampaignJob } from "@/server/services/jobs";
import { searchCanon, type SearchHit } from "@/server/services/search";
import { PageContainer } from "@/components/console/page-container";
import { SearchBar } from "@/components/search/search-bar";
import { BuildSemanticIndexButton } from "@/components/search/build-semantic-index-button";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { formatEntityType } from "@/lib/entities";
import { relationshipTypeMeta } from "@/lib/relationship-types";

const cardClass =
  "panel flex flex-col gap-[9px] p-[14px] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-2)]";
const kickerClass =
  "font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]";

function ResultCard({ campaignId, hit }: { campaignId: string; hit: SearchHit }) {
  if (hit.targetType === "RELATIONSHIP") {
    const { relationship: rel } = hit;
    return (
      <Link href={`/campaigns/${campaignId}/graph`} className={cardClass}>
        <div className="flex items-center gap-2">
          <Share2 aria-hidden size={12} className="text-[var(--ink-faint)]" />
          <span className={kickerClass}>Relationship</span>
          <span className="ml-auto">
            <SourceBadge source={rel.source} small />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <TypeDot type={rel.sourceEntity.type} />
          <span className="font-display text-[15px] font-semibold">{rel.sourceEntity.name}</span>
          <span className="font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            {relationshipTypeMeta[rel.type].forward}
          </span>
          <TypeDot type={rel.targetEntity.type} />
          <span className="font-display text-[15px] font-semibold">{rel.targetEntity.name}</span>
        </div>
        <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
          {rel.notes || "No notes."}
        </p>
        <StatusPill status={rel.status} />
      </Link>
    );
  }

  if (hit.targetType === "EVENT") {
    const { event } = hit;
    return (
      <Link href={`/campaigns/${campaignId}/timeline?event=${event.id}`} className={cardClass}>
        <div className="flex items-center gap-2">
          <CalendarClock aria-hidden size={12} className="text-[var(--ink-faint)]" />
          <span className={kickerClass}>Event</span>
          <span className="ml-auto">
            <SourceBadge source={event.source} small />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-display text-[16px] font-semibold">{event.title}</span>
        </div>
        <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
          {event.summary || "No summary yet."}
        </p>
        <StatusPill status={event.status} />
      </Link>
    );
  }

  const { entity } = hit;
  return (
    <Link href={`/campaigns/${campaignId}/entities/${entity.id}`} className={cardClass}>
      <div className="flex items-center gap-2">
        <TypeDot type={entity.type} />
        <span className={kickerClass}>{formatEntityType(entity.type)}</span>
        <span className="ml-auto">
          <SourceBadge source={entity.source} small />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-display text-[16px] font-semibold">{entity.name}</span>
        {entity.isStub && (
          <span className="hud-tag px-[5px] py-px text-[8.5px] text-[var(--ink-faint)]">
            Stub
          </span>
        )}
      </div>
      <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
        {entity.summary || "No summary yet."}
      </p>
      <StatusPill status={entity.status} />
    </Link>
  );
}

export default async function CampaignSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const rawQuery = q ?? "";
  const { query, hits } = await searchCanon(user.id, id, rawQuery);

  // The "Build semantic index" control is DM-only and only meaningful when an
  // embedding-capable provider is configured (semantic search degrades to
  // full-text otherwise — doc 07). Resolve it only for DMs to avoid a needless
  // key lookup on player requests.
  const role = campaign.members[0]?.role;
  const isDm = role === Role.OWNER || role === Role.CO_DM;
  const canBuildSemanticIndex = isDm && (await resolveCampaignEmbedder(id)) !== null;
  const activeSemanticJobRow = canBuildSemanticIndex
    ? await getActiveCampaignJob(user.id, id, JobKind.EMBED_SEARCH_DOCS)
    : null;
  const activeSemanticJob =
    activeSemanticJobRow &&
    (activeSemanticJobRow.status === "QUEUED" || activeSemanticJobRow.status === "RUNNING")
      ? {
          id: activeSemanticJobRow.id,
          status: activeSemanticJobRow.status,
          createdAt: activeSemanticJobRow.createdAt,
          startedAt: activeSemanticJobRow.startedAt,
        }
      : null;

  return (
    <PageContainer>
      <Kicker dim noLead className="mb-2">
        Search · {campaign.name}
      </Kicker>
      <h1 className="font-display mb-1 text-[26px] font-bold tracking-[.01em]">
        Search the campaign
      </h1>
      <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
        Hybrid search across every entity, relationship, and event you can see —
        full-text over names, summaries, descriptions, tags, and connections,
        blended with semantic meaning when a semantic index is built. With no
        embedding provider configured it stays keyword-only.
      </p>

      {canBuildSemanticIndex && (
        <div className="mb-5">
          <BuildSemanticIndexButton campaignId={id} activeJob={activeSemanticJob} />
        </div>
      )}

      <SearchBar campaignId={id} initialQuery={rawQuery} autoFocus />

      <div className="mt-6">
        {!query ? (
          <div className="grid h-48 place-items-center text-center text-[var(--ink-faint)]">
            <div>
              <Search aria-hidden size={34} className="mx-auto opacity-40" />
              <p className="mt-3 text-sm">Type to search the campaign&apos;s canon.</p>
            </div>
          </div>
        ) : hits.length === 0 ? (
          <div className="grid h-48 place-items-center text-center text-[var(--ink-faint)]">
            <div>
              <Search aria-hidden size={34} className="mx-auto opacity-40" />
              <p className="mt-3 text-sm">
                No matches for <span className="text-[var(--ink-dim)]">“{query}”</span>.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 font-mono text-[11px] text-[var(--ink-faint)]">
              {hits.length} {hits.length === 1 ? "result" : "results"}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {hits.map((hit) => (
                <ResultCard key={`${hit.targetType}:${hit.targetId}`} campaignId={id} hit={hit} />
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
