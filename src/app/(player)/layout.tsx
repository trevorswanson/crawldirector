import { cookies } from "next/headers";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { listCampaignsForUser } from "@/server/services/campaigns";
import { PlayerNav } from "@/components/console/player-nav";
import { PlayerCampaignSwitcher } from "@/components/console/player-campaign-switcher";
import { UserMenu } from "@/components/console/user-menu";

export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const campaigns = await listCampaignsForUser(user.id);
  // The player console only switches between crawls the user actually plays in;
  // campaigns they run live in the DM console.
  const campaignChoices = campaigns
    .filter((c) => c.members[0]?.role === Role.PLAYER)
    .map(({ id, name }) => ({ id, name }));
  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();
  const fxEnabled = (await cookies()).get("cd-fx")?.value !== "off";

  return (
    <div className="flex min-h-0 flex-1">
      {/* Sidebar: brand + player nav (desktop-first; collapses on narrow). */}
      <aside className="hidden w-[232px] shrink-0 flex-col md:flex">
        <div className="flex h-[52px] items-center gap-[10px] border-b border-r border-[var(--line)] bg-[var(--bg-1)] px-[18px]">
          <span className="brand-glyph shrink-0">C</span>
          <span className="font-display text-[15px] font-bold tracking-[.06em]">
            CrawlDirector
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <PlayerNav />
        </div>
      </aside>

      {/* Main column: topbar + scrolling content. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-[var(--line)] bg-[var(--bg-1)] px-[18px]">
          <PlayerCampaignSwitcher campaigns={campaignChoices} />
          <span className="hidden font-mono text-[10.5px] uppercase tracking-[.12em] text-[var(--ink-faint)] sm:inline">
            player view
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
