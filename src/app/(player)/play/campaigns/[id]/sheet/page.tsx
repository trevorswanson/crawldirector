import { notFound } from "next/navigation";
import { Eye, MonitorSmartphone } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getMyCrawlerSheet } from "@/server/services/crawlers";
import { ConsoleScreen } from "@/components/console/screen";
import { CrawlerSheetPanel } from "@/components/crawler/crawler-sheet";

export default async function CrawlerSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  // Own-crawler data: getMyCrawlerSheet returns ONLY the crawler linked to the
  // caller's own membership (invariant #5 — the link is the projection).
  const [campaign, sheet] = await Promise.all([
    getCampaignForUser(user.id, id),
    getMyCrawlerSheet(user.id, id),
  ]);
  if (!campaign) notFound();

  return (
    <ConsoleScreen>
      {/* in-fiction System banner (mirrors the Known World + crawler mockup) */}
      <div
        className="flex items-center gap-[14px] border-b border-[var(--line)] px-[26px] py-[14px]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent)",
        }}
      >
        <span className="live-dot" />
        <span className="font-display text-[13px] font-bold tracking-[.18em] text-[var(--accent)]">
          THE SYSTEM
        </span>
        <span className="font-mono text-[11px] text-[var(--ink-faint)]">
          crawler interface · your character sheet
        </span>
        <span className="hud-tag ml-auto">
          <Eye aria-hidden size={12} />
          player view
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-[22px]">
        {sheet ? (
          <CrawlerSheetPanel sheet={sheet} />
        ) : (
          <div className="grid h-60 place-items-center text-center text-[var(--ink-faint)]">
            <div>
              <MonitorSmartphone aria-hidden size={36} className="mx-auto opacity-40" />
              <p className="mt-3 text-sm">
                Your DM hasn&apos;t linked a crawler to you yet. Once they do,
                your character sheet appears here.
              </p>
            </div>
          </div>
        )}
      </div>
    </ConsoleScreen>
  );
}
