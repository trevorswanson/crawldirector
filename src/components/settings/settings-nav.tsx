import Link from "next/link";
import { Sparkles, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// The settings sub-navigation (the middle pane of the planned three-pane layout,
// docs/11-roadmap.md M9). "AI Provider" (M4) and "Crawlers" (M7 player↔crawler
// link) are built; "General" is shown disabled with the milestone that delivers
// it, so the nav doubles as a roadmap without faking pages — mirroring the DM
// console nav.
type SettingsSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Query-param suffix for this section (the default section has none). */
  section?: string;
  /** Unbuilt: shown disabled with a milestone tooltip. */
  planned?: string;
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "ai", label: "AI Provider", icon: Sparkles },
  {
    id: "general",
    label: "General",
    icon: SlidersHorizontal,
    planned: "M9 — campaign name, description & dungeon visibility",
  },
  {
    id: "crawlers",
    label: "Crawlers",
    icon: Users,
    section: "crawlers",
  },
];

export function SettingsNav({
  activeId,
  campaignId,
}: {
  activeId: string;
  campaignId: string;
}) {
  const base = `/campaigns/${campaignId}/settings`;
  return (
    <nav className="flex flex-col gap-[2px]" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;

        if (section.planned) {
          return (
            <div
              key={section.id}
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

        const active = section.id === activeId;
        const href = section.section ? `${base}?section=${section.section}` : base;
        return (
          <Link
            key={section.id}
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
