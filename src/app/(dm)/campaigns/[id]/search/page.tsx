import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { searchCanon } from "@/server/services/search";
import { PageContainer } from "@/components/console/page-container";
import { SearchBar } from "@/components/search/search-bar";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { formatEntityType } from "@/lib/entities";

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

  return (
    <PageContainer>
      <Kicker dim noLead className="mb-2">
        Search · {campaign.name}
      </Kicker>
      <h1 className="font-display mb-1 text-[26px] font-bold tracking-[.01em]">
        Search the campaign
      </h1>
      <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
        Full-text search across every entity you can see — names, summaries,
        descriptions, and tags. Semantic search and Ask the Campaign arrive in a
        later M5 slice.
      </p>

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
                <Link
                  key={hit.targetId}
                  href={`/campaigns/${id}/entities/${hit.targetId}`}
                  className="panel flex flex-col gap-[9px] p-[14px] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-2)]"
                >
                  <div className="flex items-center gap-2">
                    <TypeDot type={hit.entity.type} />
                    <span className="font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
                      {formatEntityType(hit.entity.type)}
                    </span>
                    <span className="ml-auto">
                      <SourceBadge source={hit.entity.source} small />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[16px] font-semibold">
                      {hit.entity.name}
                    </span>
                    {hit.entity.isStub && (
                      <span className="hud-tag px-[5px] py-px text-[8.5px] text-[var(--ink-faint)]">
                        Stub
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-[12.5px] leading-[1.5] text-[var(--ink-dim)]">
                    {hit.entity.summary || "No summary yet."}
                  </p>
                  <StatusPill status={hit.entity.status} />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
