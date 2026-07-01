"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MonitorSmartphone,
  Globe2,
  Radio,
  MessageCircleQuestion,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

function campaignIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/play\/campaigns\/([^/]+)/);
  return match?.[1] ?? null;
}

type PlayerNavItem = {
  label: string;
  icon: LucideIcon;
  href?: (campaignId: string | null) => string;
  /** Matches the current path → active highlight. */
  match?: (pathname: string) => boolean;
  /** Unbuilt: shown disabled with the milestone slice that delivers it. */
  planned?: string;
};

// Only the Known World is built today; the rest of the crawler interface ships
// in later M7 slices and is shown disabled with its slice, so the nav doubles
// as a roadmap without faking any pages. Keep in sync with docs/11-roadmap.md.
const NAV: PlayerNavItem[] = [
  {
    label: "Known World",
    icon: Globe2,
    href: (campaignId) =>
      campaignId ? `/play/campaigns/${campaignId}` : "/dashboard",
    match: (p) =>
      /^\/play\/campaigns\/[^/]+(?:\/entities\/.*)?$/.test(p),
  },
  {
    label: "Crawler Sheet",
    icon: MonitorSmartphone,
    href: (campaignId) =>
      campaignId ? `/play/campaigns/${campaignId}/sheet` : "/dashboard",
    match: (p) => /^\/play\/campaigns\/[^/]+\/sheet$/.test(p),
  },
  { label: "System Feed", icon: Radio, planned: "M7 — System-message feed" },
  {
    label: "Ask the System",
    icon: MessageCircleQuestion,
    planned: "M7 — scoped Ask",
  },
  { label: "Suggestions", icon: Lightbulb, planned: "M7 — player suggestions" },
];

export function PlayerNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-1)] py-3">
      <p className="kicker dim px-[18px] pb-[10px] pt-2 text-[9px]">
        Crawler Interface
      </p>
      {NAV.map((item) => (
        <PlayerNavRow key={item.label} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

function PlayerNavRow({
  item,
  pathname,
}: {
  item: PlayerNavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const active = item.match?.(pathname) ?? false;
  const campaignId = campaignIdFromPathname(pathname);

  if (item.planned) {
    return (
      <div
        title={`Planned · ${item.planned}`}
        aria-disabled
        className="flex cursor-not-allowed items-center gap-3 border-l-2 border-transparent px-[18px] py-[10px] text-[var(--ink-faint)] opacity-60"
      >
        <Icon aria-hidden size={18} className="shrink-0 text-[var(--ink-faint)]" />
        <span className="flex-1 text-[13px] font-medium">{item.label}</span>
        <span className="font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
          Planned
        </span>
      </div>
    );
  }

  const href = item.href?.(campaignId) ?? "#";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 border-l-2 px-[18px] py-[10px] transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--bg-3)] text-[var(--ink)]"
          : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]",
      )}
    >
      <Icon
        aria-hidden
        size={18}
        className={cn(
          "shrink-0",
          active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]",
        )}
      />
      <span
        className={cn(
          "flex-1 text-[13px]",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}
