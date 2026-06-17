import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { resolveCampaignProvider } from "@/server/ai";
import { getCampaignForUser } from "@/server/services/campaigns";
import { PageContainer } from "@/components/console/page-container";
import { AskPanel } from "@/components/ask/ask-panel";
import { Kicker } from "@/components/ui/kicker";

// "Ask the Campaign" page (M5 slice 5 — docs/07-search-retrieval.md). A
// read-only, retrieval-augmented Q&A over scoped canon with citations. Unlike
// keyword search, an answer needs a chat model — so the panel is gated on a
// configured AI provider, and the page degrades to a "configure a key" notice
// otherwise (full-text search still works with no key).

export default async function CampaignAskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams)?.q ?? "";
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const providerConfigured = (await resolveCampaignProvider(id)) !== null;

  return (
    <PageContainer>
      <Kicker dim noLead className="mb-2">
        Ask · {campaign.name}
      </Kicker>
      <h1 className="font-display mb-1 text-[26px] font-bold tracking-[.01em]">
        Ask the Campaign
      </h1>
      <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
        Ask a natural-language question and get an answer synthesized from the
        canon you can see, with citations that link back to the source entities,
        relationships, and events. Answers are read-only — they are never saved as
        canon. Retrieval is scoped to your visibility, so an answer can never
        surface anything you couldn&apos;t already find by searching.
      </p>

      {providerConfigured ? (
        <AskPanel campaignId={id} initialQuestion={query} />
      ) : (
        <div className="panel flex flex-col items-start gap-3 p-[18px]">
          <div className="flex items-center gap-[9px]">
            <Sparkles aria-hidden size={16} className="text-[var(--ai)]" />
            <p className="font-display text-[15px] font-semibold">No AI provider configured</p>
          </div>
          <p className="max-w-xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
            Ask the Campaign synthesizes answers with a bring-your-own-key model.
            Add a provider key in Settings to enable it — keyword and semantic
            search keep working without one.
          </p>
          <Link
            href={`/campaigns/${id}/settings`}
            className="inline-flex items-center gap-[7px] border border-[var(--line-strong)] bg-[var(--bg)] px-[12px] py-[7px] text-[12.5px] text-[var(--ink-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
          >
            Configure AI in Settings
          </Link>
        </div>
      )}
    </PageContainer>
  );
}
