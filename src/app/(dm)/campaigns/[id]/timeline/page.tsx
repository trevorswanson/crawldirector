import { notFound } from "next/navigation";

import { CampaignTimeline } from "@/components/timeline/campaign-timeline";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listEntitiesForUser } from "@/server/services/entities";
import { listCampaignFloors, listCampaignTimeline } from "@/server/services/events";
import { listAiKeys } from "@/server/services/ai-keys";

// Each "window" unit adds 200 events; min window=1 (200 events), max window=50 (10 000 events).
const WINDOW_UNIT = 200;
const MAX_WINDOWS = 50;

export default async function CampaignTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ event?: string; window?: string }>;
}) {
  const { id } = await params;
  const { event: initialEventId, window: windowParam } = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  // Parse and clamp the window parameter (number of 200-event blocks).
  const windowCount = Math.min(
    MAX_WINDOWS,
    Math.max(1, parseInt(windowParam ?? "1", 10) || 1),
  );
  const limit = windowCount * WINDOW_UNIT;

  const [timelineResult, floors, candidates, aiKeys] = await Promise.all([
    listCampaignTimeline(user.id, id, { limit }),
    listCampaignFloors(user.id, id),
    listEntitiesForUser(user.id, id),
    listAiKeys(user.id, id),
  ]);

  let { events, truncated, totalEvents } = timelineResult;

  // Deep-link fallback: if the target event isn't in the windowed result, re-query
  // without a limit so the full timeline is loaded.
  if (initialEventId && !events.some((e) => e.id === initialEventId)) {
    const full = await listCampaignTimeline(user.id, id);
    events = full.events;
    truncated = full.truncated;
    totalEvents = full.totalEvents;
  }

  const role = campaign.members[0]?.role;
  const canEdit = role === "OWNER" || role === "CO_DM";

  // Build "load older" href: increment window by 1, preserve ?event= deep-link.
  const nextWindow = windowCount + 1;
  const loadOlderParams = new URLSearchParams({ window: String(nextWindow) });
  if (initialEventId) loadOlderParams.set("event", initialEventId);
  const loadOlderHref = `?${loadOlderParams.toString()}`;

  return (
    <CampaignTimeline
      campaignId={id}
      events={events}
      floors={floors}
      canEdit={canEdit}
      aiConfigured={aiKeys.length > 0}
      initialEventId={initialEventId}
      truncated={truncated}
      loadOlderHref={loadOlderHref}
      totalEvents={totalEvents}
      candidates={candidates.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
      }))}
    />
  );
}
