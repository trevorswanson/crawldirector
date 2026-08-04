import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { resolveCampaignProvider } from "@/server/ai";
import { getCampaignForUser } from "@/server/services/campaigns";
import { ConsoleScreen } from "@/components/console/screen";
import { PlayerSystemBanner } from "@/components/console/player-system-banner";
import { AskPanel } from "@/components/ask/ask-panel";
import { askCampaignAction } from "@/app/(player)/actions";

// "Ask the System" (M7 slice 5 — docs/PROGRESS.md). The player-scoped
// counterpart to the DM's "Ask the Campaign"
// (`(dm)/campaigns/[id]/ask/page.tsx`): same read-only, retrieval-augmented
// Q&A panel, wired to the player's own `askCampaignAction`. Retrieval is
// scoped to the caller's membership role inside `askCampaign` itself
// (invariant #5), so a player's answer can never surface DM-only or secret
// canon — no separate projection needed here. A player has no Settings
// access, so the no-provider state just explains the DM hasn't configured one
// yet (no "configure a key" link, unlike the DM page).

export default async function PlayerAskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const providerConfigured = (await resolveCampaignProvider(id)) !== null;

  return (
    <ConsoleScreen>
      <PlayerSystemBanner caption="crawler interface · ask the system" />

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-[22px]">
        <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
          Ask a natural-language question and get an answer synthesized from the
          canon you can see, with citations that link back to the source
          entities, relationships, and events. Answers are read-only — never
          saved as canon — and scoped to what your crawler knows.
        </p>

        {providerConfigured ? (
          <AskPanel action={askCampaignAction.bind(null, id)} />
        ) : (
          <div className="panel flex flex-col items-start gap-3 p-[18px]">
            <div className="flex items-center gap-[9px]">
              <Sparkles aria-hidden size={16} className="text-[var(--ai)]" />
              <p className="font-display text-[15px] font-semibold">
                The System is not listening yet
              </p>
            </div>
            <p className="max-w-xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
              Your DM hasn&apos;t configured an AI provider for this campaign,
              so the System can&apos;t synthesize an answer yet. Ask your DM to
              add a provider key in Settings.
            </p>
          </div>
        )}
      </div>
    </ConsoleScreen>
  );
}
