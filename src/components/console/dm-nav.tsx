"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  ListChecks,
  ListTodo,
  SlidersHorizontal,
  Workflow,
  Network,
  CalendarClock,
  MonitorSmartphone,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getCampaignCanonIntegrityAction } from "@/app/(dm)/actions";
import type { CanonIntegrity } from "@/server/services/campaigns";


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
  {
    label: "Job Queue",
    icon: ListTodo,
    group: "dm",
    href: (campaignId) => (campaignId ? `/campaigns/${campaignId}/jobs` : "/dashboard"),
    match: (p) => /^\/campaigns\/[^/]+\/jobs/.test(p),
  },
  {
    label: "Canon Integrity",
    icon: ShieldAlert,
    group: "dm",
    href: (campaignId) =>
      campaignId ? `/campaigns/${campaignId}/integrity` : "/dashboard",
    match: (p) => /^\/campaigns\/[^/]+\/integrity/.test(p),
  },
  {
    label: "Relationship Graph",
    icon: Network,
    group: "dm",
    href: (campaignId) =>
      campaignId ? `/campaigns/${campaignId}/graph` : "/dashboard",
    match: (p) => /^\/campaigns\/[^/]+\/graph/.test(p),
  },
  {
    label: "Timeline",
    icon: CalendarClock,
    group: "dm",
    href: (campaignId) =>
      campaignId ? `/campaigns/${campaignId}/timeline` : "/dashboard",
    match: (p) => /^\/campaigns\/[^/]+\/timeline/.test(p),
  },
  {
    label: "Settings",
    icon: Settings,
    group: "dm",
    href: (campaignId) =>
      campaignId ? `/campaigns/${campaignId}/settings` : "/dashboard",
    match: (p) => /^\/campaigns\/[^/]+\/settings/.test(p),
  },
  { label: "AI · Persona Studio", icon: SlidersHorizontal, group: "dm", planned: "M6 — System AI persona engine" },
  { label: "Simulation", icon: Workflow, group: "dm", planned: "M11 — Entity agents & simulation" },
  { label: "Crawler Interface", icon: MonitorSmartphone, group: "player", planned: "M7 — Player crawler interface" },
];

export function DmNav() {
  const pathname = usePathname();
  const campaignId = campaignIdFromPathname(pathname);
  const [integrity, setIntegrity] = useState<CanonIntegrity | null>(null);

  useEffect(() => {
    if (!campaignId) {
      Promise.resolve().then(() => {
        setIntegrity(null);
      });
      return;
    }

    let active = true;
    getCampaignCanonIntegrityAction(campaignId)
      .then((data) => {
        if (active) setIntegrity(data);
      })
      .catch((err) => {
        console.error("Error loading canon integrity:", err);
      });

    return () => {
      active = false;
    };
  }, [campaignId, pathname]);

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

      {integrity && (
        <div className="border-t border-[var(--line)] px-[18px] pt-[14px] pb-1">
          <p className="kicker dim mb-2 text-[9px] nolead">Canon integrity</p>
          <div className="mb-[7px] flex gap-[5px] items-center">
            {[
              { label: "DM", color: "var(--ink-dim)", weight: integrity.dmPercent },
              { label: "AI", color: "var(--ai)", weight: integrity.aiPercent },
              { label: "PLR", color: "var(--player)", weight: integrity.playerPercent },
              { label: "LCK", color: "var(--sys)", weight: integrity.lockedPercent },
            ]
              .filter((item) => item.weight > 0)
              .map(({ label, color, weight }) => (
                <div
                  key={label}
                  className="opacity-70"
                  title={`${label}: ${weight}%`}
                  style={{
                    flex: weight,
                    height: "4px",
                    backgroundColor: color,
                  }}
                />
              ))}
          </div>
          <p className="font-mono text-[9px] text-[var(--ink-faint)] leading-none">
            {[
              integrity.dmPercent > 0 && `${integrity.dmPercent}% DM`,
              integrity.aiPercent > 0 && `${integrity.aiPercent}% AI-origin`,
              integrity.playerPercent > 0 && `${integrity.playerPercent}% Player`,
              integrity.lockedPercent > 0 && `${integrity.lockedPercent}% locked`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}
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
