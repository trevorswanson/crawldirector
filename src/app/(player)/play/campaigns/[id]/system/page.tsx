import { notFound } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getSystemMessageFeed } from "@/server/services/system-feed";
import { ConsoleScreen } from "@/components/console/screen";
import { PlayerSystemBanner } from "@/components/console/player-system-banner";
import { SystemFeed } from "@/components/crawler/system-feed";

export default async function SystemFeedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  // The feed is the visibility projection (invariant #5): getSystemMessageFeed
  // returns only PLAYER_VISIBLE, live-CANON System messages for a player.
  const [campaign, messages] = await Promise.all([
    getCampaignForUser(user.id, id),
    getSystemMessageFeed(user.id, id),
  ]);
  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  return (
    <ConsoleScreen>
      <PlayerSystemBanner caption="crawler interface · live broadcast feed" />

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-[22px]">
        <SystemFeed messages={messages} />
      </div>
    </ConsoleScreen>
  );
}
