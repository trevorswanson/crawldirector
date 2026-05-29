import { Search } from "lucide-react";

import { cookies } from "next/headers";

import { requireUser } from "@/server/auth/session";
import { listCampaignsForUser } from "@/server/services/campaigns";
import { signOutAction } from "@/app/(dm)/actions";
import { Button } from "@/components/ui/button";
import { DmNav } from "@/components/console/dm-nav";
import { CampaignSwitcher } from "@/components/console/campaign-switcher";
import { FxToggle } from "@/components/ui/fx-toggle";

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
          <span className="grid size-[26px] shrink-0 place-items-center border-[1.5px] border-[var(--accent)] font-display text-[16px] font-bold text-[var(--accent)]">
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
            <FxToggle defaultOn={fxEnabled} />
            <span className="hidden text-sm text-[var(--ink-dim)] sm:inline">
              {user.email}
            </span>
            <span className="grid size-7 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-4)] font-mono text-[12px] text-[var(--ink-dim)]">
              {initials}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
