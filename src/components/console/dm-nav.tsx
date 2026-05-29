"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  ListChecks,
  SlidersHorizontal,
  Workflow,
  Network,
  MonitorSmartphone,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

function campaignIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  return match?.[1] ?? null;
}

type NavItem = {
  label: string;
  icon: LucideIcon;
  group: "dm" | "player";
  href?: string | ((campaignId: string | null) => string);
  /** Matches the current path → active highlight. */
  match?: (pathname: string) => boolean;
  /** Unbuilt: shown disabled with a milestone tooltip. */
  planned?: string;
};

// Only World Browser is built today. The rest are shown disabled with the
// milestone that will deliver them, so the nav doubles as a roadmap without
// faking any pages. Keep in sync with docs/11-roadmap.md.
const NAV: NavItem[] = [
  {
    label: "World Browser",
    icon: Layers,
    group: "dm",
    href: (campaignId) => (campaignId ? `/campaigns/${campaignId}` : "/dashboard"),
    match: (p) =>
      p === "/dashboard" || (/^\/campaigns\/[^/]+(?:\/entities\/.*)?$/.test(p)),
  },
  {
    label: "Review Queue",
    icon: ListChecks,
    group: "dm",
    href: (campaignId) => (campaignId ? `/campaigns/${campaignId}/review` : "/dashboard"),
    match: (p) => /^\/campaigns\/[^/]+\/review/.test(p),
  },
  { label: "AI · Persona Studio", icon: SlidersHorizontal, group: "dm", planned: "M6 — System AI persona engine" },
  { label: "Simulation", icon: Workflow, group: "dm", planned: "M11 — Entity agents & simulation" },
  { label: "Relationship Graph", icon: Network, group: "dm", planned: "M3 — Relationships & events graph" },
  { label: "Crawler Interface", icon: MonitorSmartphone, group: "player", planned: "M7 — Player crawler interface" },
];

export function DmNav() {
  const pathname = usePathname();
  const dm = NAV.filter((n) => n.group === "dm");
  const player = NAV.filter((n) => n.group === "player");

  return (
    <nav className="flex h-full flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-1)] py-3">
      <div className="flex-1">
        <p className="kicker dim px-[18px] pb-[10px] pt-2 text-[9px]">DM Console</p>
        {dm.map((n) => (
          <NavRow key={n.label} item={n} pathname={pathname} />
        ))}
        <div className="mx-[18px] my-3 h-px bg-[var(--line)]" />
        <p className="kicker dim px-[18px] pb-[10px] pt-2 text-[9px]">Player-facing</p>
        {player.map((n) => (
          <NavRow key={n.label} item={n} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = item.match?.(pathname) ?? false;
  const campaignId = campaignIdFromPathname(pathname);
  const href =
    typeof item.href === "function" ? item.href(campaignId) : (item.href ?? "#");

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
        className={cn("shrink-0", active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]")}
      />
      <span className={cn("flex-1 text-[13px]", active ? "font-semibold" : "font-medium")}>
        {item.label}
      </span>
    </Link>
  );
}
