import { notFound } from "next/navigation";

import { JobKind } from "@/generated/prisma/client";
import { resolveEmbeddingModel } from "@/lib/ai/providers";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listAiKeys } from "@/server/services/ai-keys";
import { getCampaignAiUsage } from "@/server/services/ai-usage";
import { getActiveCampaignJob } from "@/server/services/jobs";
import {
  listAssignableCrawlers,
  listPlayerMemberships,
} from "@/server/services/crawlers";
import { AiKeysPanel } from "@/components/settings/ai-keys-panel";
import { CrawlerAssignmentPanel } from "@/components/settings/crawler-assignment-panel";
import { SettingsNav } from "@/components/settings/settings-nav";
import { UsagePanel } from "@/components/settings/usage-panel";
import { BuildSemanticIndexButton } from "@/components/search/build-semantic-index-button";
import { ConsoleScreen, ScreenHeader, ScreenRail } from "@/components/console/screen";
import { Panel, PanelHeader } from "@/components/ui/panel";

// Campaign settings — a two-pane layout: a section sub-nav (the middle pane of
// the planned three-pane settings, docs/11-roadmap.md M9) beside the active
// section's content. Only the AI Provider section is built today (BYO provider
// keys, M4); General and Crawlers are shown disabled in the nav. DM/co-DM only —
// players never reach this route (the World Browser is their surface), and the
// service double-checks the role.
export default async function CampaignSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section } = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);
  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== "OWNER" && role !== "CO_DM") notFound();

  // ── Crawlers section: DM-only player↔crawler assignment (M7) ──
  if (section === "crawlers") {
    const [players, crawlers] = await Promise.all([
      listPlayerMemberships(user.id, id),
      listAssignableCrawlers(user.id, id),
    ]);
    return (
      <ConsoleScreen
        rail={
          <ScreenRail kicker="Settings" caption={campaign.name} bodyClassName="py-2">
            <SettingsNav activeId="crawlers" campaignId={id} />
          </ScreenRail>
        }
      >
        <ScreenHeader kicker="Settings · Crawlers" title="Crawlers" />
        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
          <div className="max-w-[760px]">
            <CrawlerAssignmentPanel
              campaignId={id}
              players={players}
              crawlers={crawlers}
            />
          </div>
        </div>
      </ConsoleScreen>
    );
  }

  const [configured, usage] = await Promise.all([
    listAiKeys(user.id, id),
    getCampaignAiUsage(user.id, id),
  ]);

  // Semantic index rebuild is only meaningful when an embedding-capable provider
  // is configured (search degrades to full-text otherwise — doc 07). This check
  // intentionally uses the safe settings projection instead of decrypting the key:
  // DMs must still be able to open this page and replace a key after secret
  // rotation or ciphertext corruption.
  const canBuildSemanticIndex = configured.some(
    (key) => resolveEmbeddingModel(key.providerId, key.embeddingModel) !== null,
  );
  // The manual rebuild is disabled while one is already QUEUED/RUNNING.
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
    <ConsoleScreen
      rail={
        // Mirrors the timeline descent rail / DM console nav: --bg-1 surface,
        // hairline right border, bordered header block.
        <ScreenRail kicker="Settings" caption={campaign.name} bodyClassName="py-2">
          <SettingsNav activeId="ai" campaignId={id} />
        </ScreenRail>
      }
    >
      {/* ── Active section: AI Provider ── */}
      <ScreenHeader kicker="Settings · AI Provider" title="AI provider" />

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">
          <p className="mb-6 max-w-[560px] text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
            Configure how this crawl uses AI. Generation always produces
            reviewable proposals — never silent canon.
          </p>
          <AiKeysPanel campaignId={id} configured={configured} />
          <Panel className="mt-6">
            <PanelHeader
              kicker="Semantic search"
              title="Build the semantic index"
              sub="Embeds your canon so search ranks by meaning, not just keywords. It runs in the background as a job and powers hybrid search. Requires an embedding-capable provider key above — without one, search stays keyword-only."
            />
            <div className="px-[18px] py-4">
              {canBuildSemanticIndex ? (
                <BuildSemanticIndexButton campaignId={id} activeJob={activeSemanticJob} />
              ) : (
                <p className="text-[12px] text-[var(--ink-faint)]">
                  Add an embedding-capable provider key above to enable semantic
                  search.
                </p>
              )}
            </div>
          </Panel>
          <UsagePanel campaignId={id} usage={usage} />
        </div>
      </div>
    </ConsoleScreen>
  );
}
