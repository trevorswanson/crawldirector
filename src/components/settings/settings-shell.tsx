import type { ReactNode } from "react";

import { SettingsNav } from "@/components/settings/settings-nav";
import { ConsoleScreen, ScreenHeader, ScreenRail } from "@/components/console/screen";

// The shared frame for every settings section: the console screen shell + the
// settings sub-nav rail + the section's HUD header + a scrolling body. Each
// section route (settings/page.tsx = AI, settings/crawlers/page.tsx = Crawlers)
// renders only its header text + body through this, so the rail wiring and body
// container live in one place instead of being copy-pasted per section.
export function SettingsShell({
  campaignName,
  kicker,
  title,
  children,
}: {
  campaignName: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <ConsoleScreen
      rail={
        // Mirrors the timeline descent rail / DM console nav: --bg-1 surface,
        // hairline right border, bordered header block.
        <ScreenRail kicker="Settings" caption={campaignName} bodyClassName="py-2">
          <SettingsNav />
        </ScreenRail>
      }
    >
      <ScreenHeader kicker={kicker} title={title} />
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">{children}</div>
      </div>
    </ConsoleScreen>
  );
}
