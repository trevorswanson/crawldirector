import { notFound } from "next/navigation";

import { CampaignTimeline } from "@/components/timeline/campaign-timeline";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listEntitiesForUser } from "@/server/services/entities";
import { listCampaignFloors, listCampaignTimeline } from "@/server/services/events";

export default async function CampaignTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ event?: string }>;
}) {
  const { id } = await params;
  const { event: initialEventId } = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  const [events, floors, candidates] = await Promise.all([
    listCampaignTimeline(user.id, id),
    listCampaignFloors(user.id, id),
    listEntitiesForUser(user.id, id),
  ]);

  const role = campaign.members[0]?.role;
  const canEdit = role === "OWNER" || role === "CO_DM";

  return (
    <CampaignTimeline
      campaignId={id}
      events={events}
      floors={floors}
      canEdit={canEdit}
      initialEventId={initialEventId}
      candidates={candidates.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
      }))}
    />
  );
}
