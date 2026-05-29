import { Search } from "lucide-react";

import { cookies } from "next/headers";

import { requireUser } from "@/server/auth/session";
import { listCampaignsForUser } from "@/server/services/campaigns";
import { DmNav } from "@/components/console/dm-nav";
import { CampaignSwitcher } from "@/components/console/campaign-switcher";
import { UserMenu } from "@/components/console/user-menu";

export default async function DmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const campaigns = await listCampaignsForUser(user.id);
  const campaignChoices = campaigns.map(({ id, name }) => ({ id, name }));
  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();
  const fxEnabled = (await cookies()).get("cd-fx")?.value !== "off";

  return (
    <div className="flex min-h-0 flex-1">
      {/* Sidebar: brand + nav (desktop-first; collapses on narrow). */}
      <aside className="hidden w-[232px] shrink-0 flex-col md:flex">
        <div className="flex h-[52px] items-center gap-[10px] border-b border-r border-[var(--line)] bg-[var(--bg-1)] px-[18px]">
          <span className="brand-glyph shrink-0">
            C
          </span>
          <span className="font-display text-[15px] font-bold tracking-[.06em]">
            CrawlDirector
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <DmNav />
        </div>
      </aside>

      {/* Main column: topbar + scrolling content. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-[var(--line)] bg-[var(--bg-1)] px-[18px]">
          <CampaignSwitcher campaigns={campaignChoices} />

          <span
            title="Global search & Ask the Campaign — planned (M5). Per-campaign search is on the World Browser."
            aria-disabled
            className="hidden cursor-not-allowed items-center gap-[9px] border border-[var(--line)] bg-[var(--bg)] px-[11px] py-[6px] text-[var(--ink-faint)] lg:flex"
          >
            <Search aria-hidden size={14} />
            <span className="text-[12.5px]">Search · Ask the Campaign…</span>
            <span className="font-mono text-[9px] uppercase tracking-[.08em]">
              M5
            </span>
          </span>

          <div className="ml-auto flex items-center gap-3">
            <UserMenu
              user={{ name: user.name ?? null, email: user.email ?? "" }}
              initials={initials}
              fxEnabled={fxEnabled}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
