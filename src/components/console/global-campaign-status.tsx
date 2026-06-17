"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin } from "lucide-react";

import { getCampaignHeaderStatusAction } from "@/app/(dm)/actions";

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
    <div
      aria-label="Campaign status"
      title={status?.currentFloor?.name ?? label}
      className="flex max-w-[42vw] shrink min-w-0 items-center gap-[7px] border border-[var(--line)] bg-[var(--bg)] px-[10px] py-[6px] text-[12.5px] font-semibold text-[var(--ink-dim)] sm:max-w-none"
    >
      <MapPin aria-hidden size={14} className="shrink-0 text-[var(--accent)]" />
      <span className="truncate">{label}</span>
    </div>
  );
}
