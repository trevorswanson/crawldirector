import { notFound } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  listAssignableCrawlers,
  listPlayerMemberships,
} from "@/server/services/crawlers";
import { CrawlerAssignmentPanel } from "@/components/settings/crawler-assignment-panel";
import { SettingsShell } from "@/components/settings/settings-shell";

// Settings · Crawlers — DM-only player↔crawler assignment (M7). Link each player
// to the CRAWLER entity they control; the player reads their own sheet at
// /play/campaigns/[id]/sheet. DM/co-DM only (the parent DM console layout already
// redirects players out; the service double-checks the role).
export default async function CrawlerSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);
  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== "OWNER" && role !== "CO_DM") notFound();

  const [players, crawlers] = await Promise.all([
    listPlayerMemberships(user.id, id),
    listAssignableCrawlers(user.id, id),
  ]);

  return (
    <SettingsShell
      campaignName={campaign.name}
      kicker="Settings · Crawlers"
      title="Crawlers"
    >
      <CrawlerAssignmentPanel campaignId={id} players={players} crawlers={crawlers} />
    </SettingsShell>
  );
}
