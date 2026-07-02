"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";

import { campaignIdFromPathname } from "@/lib/campaign-routes";
import { cn } from "@/lib/utils";

// The settings sub-navigation (the middle pane of the planned three-pane layout,
// docs/11-roadmap.md M9). Each built section is a real route segment under
// /campaigns/[id]/settings — "AI Provider" (M4, the index) and "Crawlers" (M7
// player↔crawler link); "General" is shown disabled with the milestone that
// delivers it. Active state is derived from the path the same way DmNav does, so
// the nav doubles as a roadmap without faking pages.
type SettingsSection = {
  label: string;
  icon: LucideIcon;
  /** Route segment under settings/ (undefined = the index/AI section). */
  segment?: string;
  /** Unbuilt: shown disabled with a milestone tooltip. */
  planned?: string;
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  { label: "AI Provider", icon: Sparkles },
  {
    label: "General",
    icon: SlidersHorizontal,
    planned: "M9 — campaign name, description & dungeon visibility",
  },
  { label: "Crawlers", icon: Users, segment: "crawlers" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const campaignId = campaignIdFromPathname(pathname);
  const base = campaignId ? `/campaigns/${campaignId}/settings` : "#";
  // The trailing path after `${base}` identifies the active section ("" = AI).
  const activeSegment = campaignId
    ? pathname.slice(base.length).replace(/^\//, "")
    : "";

  return (
    <nav className="flex flex-col gap-[2px]" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;

        if (section.planned) {
          return (
            <div
              key={section.label}
              title={`Planned · ${section.planned}`}
              aria-disabled
              className="flex cursor-not-allowed items-center gap-3 border-l-2 border-transparent px-3 py-[9px] text-[var(--ink-faint)] opacity-60"
            >
              <Icon aria-hidden size={16} className="shrink-0" />
              <span className="flex-1 text-[13px] font-medium">{section.label}</span>
              <span className="font-mono text-[9px] uppercase tracking-[.08em]">
                Planned
              </span>
            </div>
          );
        }

        const active = activeSegment === (section.segment ?? "");
        const href = section.segment ? `${base}/${section.segment}` : base;
        return (
          <Link
            key={section.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 border-l-2 px-3 py-[9px] transition-colors",
              active
                ? "border-[var(--accent)] bg-[var(--bg-3)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]",
            )}
          >
            <Icon
              aria-hidden
              size={16}
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
              {section.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
