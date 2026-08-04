import { notFound } from "next/navigation";
import { MonitorSmartphone } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getMyCrawlerSheet } from "@/server/services/crawlers";
import { listMySuggestions } from "@/server/services/review";
import { ConsoleScreen } from "@/components/console/screen";
import { PlayerSystemBanner } from "@/components/console/player-system-banner";
import { SuggestionForm } from "@/components/crawler/suggestion-form";
import { SuggestionList } from "@/components/crawler/suggestion-list";
import { submitSuggestionAction } from "@/app/(player)/actions";

// Suggestions (M7 slice 6 — docs/PROGRESS.md, closes the milestone's "done
// when" bar). A player proposes an edit to their own crawler's bio/notes; it
// enters the review pipeline as a PENDING `PLAYER_SUGGESTION` change set and
// never writes canon directly (invariant #1). Gated the same way as the
// Crawler Sheet: no crawler linked yet → an empty state, since a suggestion
// needs an own-crawler target to attach to.

export default async function SuggestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [campaign, sheet, suggestions] = await Promise.all([
    getCampaignForUser(user.id, id),
    getMyCrawlerSheet(user.id, id),
    listMySuggestions(user.id, id),
  ]);
  if (!campaign) notFound();

  return (
    <ConsoleScreen>
      <PlayerSystemBanner caption="crawler interface · suggestions" />

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-[22px]">
        {sheet ? (
          <div className="flex flex-col gap-[26px] lg:flex-row lg:items-start">
            <div className="panel max-w-[420px] flex-1 p-[22px]">
              <p className="mb-4 text-[13px] leading-[1.6] text-[var(--ink-dim)]">
                Propose an edit to {sheet.name}&apos;s bio or notes. Your DM
                reviews every suggestion before it becomes canon.
              </p>
              <SuggestionForm
                action={submitSuggestionAction.bind(null, id)}
                currentSummary={sheet.summary}
                currentDescription={sheet.description}
              />
            </div>

            <div className="max-w-[420px] flex-1">
              <p className="mb-3 font-mono text-[9.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
                Your suggestions
              </p>
              <SuggestionList suggestions={suggestions} />
            </div>
          </div>
        ) : (
          <div className="grid h-60 place-items-center text-center text-[var(--ink-faint)]">
            <div>
              <MonitorSmartphone aria-hidden size={36} className="mx-auto opacity-40" />
              <p className="mt-3 text-sm">
                Your DM hasn&apos;t linked a crawler to you yet. Once they do,
                you can suggest edits here.
              </p>
            </div>
          </div>
        )}
      </div>
    </ConsoleScreen>
  );
}
