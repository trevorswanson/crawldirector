import { notFound } from "next/navigation";

import { CampaignTimeline } from "@/components/timeline/campaign-timeline";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listEntitiesForUser } from "@/server/services/entities";
import { listCampaignTimeline } from "@/server/services/events";

export default async function CampaignTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  const [events, candidates] = await Promise.all([
    listCampaignTimeline(user.id, id),
    listEntitiesForUser(user.id, id),
  ]);

  return (
    <CampaignTimeline
      campaignId={id}
      events={events}
      candidates={candidates.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
      }))}
    />
  );
}
