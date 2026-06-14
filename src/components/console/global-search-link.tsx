"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Topbar "Search" affordance. Full-text search is live (M5 slice 1); semantic
 * search + "Ask the Campaign" arrive in later M5 slices. The link is active only
 * inside a campaign — there's no global cross-campaign search yet.
 */
export function GlobalSearchLink() {
  const pathname = usePathname();
  const campaignId = pathname.match(/^\/campaigns\/([^/]+)/)?.[1] ?? null;

  if (!campaignId) {
    return (
      <span
        title="Open a campaign to search its canon."
        aria-disabled
        className="hidden cursor-not-allowed items-center gap-[9px] border border-[var(--line)] bg-[var(--bg)] px-[11px] py-[6px] text-[var(--ink-faint)] lg:flex"
      >
        <Search aria-hidden size={14} />
        <span className="text-[12.5px]">Search · Query the System…</span>
      </span>
    );
  }

  return (
    <Link
      href={`/campaigns/${campaignId}/search`}
      title="Search this campaign's canon. Ask the Campaign — planned (M5)."
      className="hidden items-center gap-[9px] border border-[var(--line)] bg-[var(--bg)] px-[11px] py-[6px] text-[var(--ink-dim)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] lg:flex"
    >
      <Search aria-hidden size={14} />
      <span className="text-[12.5px]">Search · Query the System…</span>
      <span className="font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
        Ask · M5
      </span>
    </Link>
  );
}
