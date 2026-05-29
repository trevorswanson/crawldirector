"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FocusEvent, useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type CampaignSwitcherItem = {
  id: string;
  name: string;
};

function campaignIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  return match?.[1] ?? null;
}

export function CampaignSwitcher({
  campaigns,
}: {
  campaigns: CampaignSwitcherItem[];
}) {
  const pathname = usePathname();
  const [campaignItems, setCampaignItems] = useState(campaigns);
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const open = openPathname === pathname;
  const activeCampaignId = campaignIdFromPathname(pathname);
  const activeCampaign = campaignItems.find(
    (campaign) => campaign.id === activeCampaignId,
  );
  const label = activeCampaign?.name ?? "Campaigns";

  useEffect(() => {
    let cancelled = false;

    async function refreshCampaigns() {
      try {
        const response = await fetch("/api/campaigns", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          campaigns?: CampaignSwitcherItem[];
        };
        if (!cancelled && Array.isArray(payload.campaigns)) {
          setCampaignItems(payload.campaigns);
        }
      } catch {
        // Keep the server-rendered list if a refresh is unavailable.
      }
    }

    void refreshCampaigns();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function closeIfFocusLeaves(event: FocusEvent<HTMLDetailsElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setOpenPathname(null);
    }
  }

  return (
    <details
      open={open}
      onBlur={closeIfFocusLeaves}
      onToggle={(event) => {
        setOpenPathname(event.currentTarget.open ? pathname : null);
      }}
      className="group relative"
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          setOpenPathname((current) => (current === pathname ? null : pathname));
        }}
        className="flex cursor-pointer list-none items-center gap-[9px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[11px] py-[6px] text-[var(--ink)] transition-colors marker:hidden hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        aria-label="Switch campaign"
        aria-expanded={open}
      >
        <span className="size-[7px] shrink-0 rounded-full bg-[var(--accent)]" />
        <span className="max-w-[180px] truncate text-[13px] font-semibold sm:max-w-[240px]">
          {label}
        </span>
        <ChevronDown
          aria-hidden
          size={14}
          className="shrink-0 text-[var(--ink-dim)] transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-[min(18rem,calc(100vw-2rem))] border border-[var(--line-strong)] bg-[var(--bg-1)] p-1 shadow-[0_18px_50px_rgba(0,0,0,.35)]">
        {campaignItems.length > 0 ? (
          campaignItems.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              onClick={() => setOpenPathname(null)}
              className={cn(
                "flex min-h-9 items-center px-3 py-2 text-[13px] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--ink)]",
                campaign.id === activeCampaignId
                  ? "bg-[var(--bg-3)] font-semibold text-[var(--ink)]"
                  : "text-[var(--ink-dim)]",
              )}
            >
              <span className="truncate">{campaign.name}</span>
            </Link>
          ))
        ) : (
          <p className="px-3 py-2 text-[13px] text-[var(--ink-faint)]">
            No crawls yet.
          </p>
        )}

        <div className="my-1 h-px bg-[var(--line)]" />

        <Link
          href="/dashboard#new-crawl"
          onClick={() => setOpenPathname(null)}
          className="flex min-h-9 items-center gap-2 px-3 py-2 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--bg-3)]"
        >
          <Plus aria-hidden size={14} />
          <span>Start New Crawl</span>
        </Link>
      </div>
    </details>
  );
}
