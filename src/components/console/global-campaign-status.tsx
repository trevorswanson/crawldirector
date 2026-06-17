"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";

import { getCampaignHeaderStatusAction } from "@/app/(dm)/actions";
import { HudTag } from "@/components/ui/hud-tag";

type CampaignHeaderStatus = Awaited<ReturnType<typeof getCampaignHeaderStatusAction>>;
type LoadedCampaignStatus = {
  campaignId: string;
  status: CampaignHeaderStatus;
};

function campaignIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  return match?.[1] ?? null;
}

export function GlobalCampaignStatus() {
  const pathname = usePathname();
  const campaignId = campaignIdFromPathname(pathname);
  const [loadedStatus, setLoadedStatus] = useState<LoadedCampaignStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!campaignId) return;
    const activeCampaignId = campaignId;

    async function loadStatus() {
      try {
        const nextStatus = await getCampaignHeaderStatusAction(activeCampaignId);
        if (!cancelled) {
          setLoadedStatus({ campaignId: activeCampaignId, status: nextStatus });
        }
      } catch {
        if (!cancelled) {
          setLoadedStatus({ campaignId: activeCampaignId, status: null });
        }
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (!campaignId || loadedStatus?.campaignId !== campaignId) return null;
  const status = loadedStatus.status;
  const floorLabel =
    status?.currentFloor == null
      ? null
      : status.currentFloor.floorNumber == null
        ? status.currentFloor.name
        : `Floor ${status.currentFloor.floorNumber}`;
  const dayLabel = status?.currentDay == null ? null : `Day ${status.currentDay}`;
  const label = [floorLabel, dayLabel].filter(Boolean).join(" · ");
  if (!label) return null;

  return (
    <HudTag
      aria-label="Campaign status"
      title={status?.currentFloor?.name ?? label}
      className="max-w-[42vw] shrink min-w-0 sm:max-w-none"
    >
      <Clock aria-hidden size={12} className="shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </HudTag>
  );
}
