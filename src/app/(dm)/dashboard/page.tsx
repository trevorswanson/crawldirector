import Link from "next/link";

import { requireUser } from "@/server/auth/session";
import { listCampaignsForUser } from "@/server/services/campaigns";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { HudTag } from "@/components/ui/hud-tag";
import { CreateCampaignForm } from "@/components/campaigns/create-campaign-form";

export default async function DashboardPage() {
  const user = await requireUser();
  const campaigns = await listCampaignsForUser(user.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Kicker>World Browser · Campaigns</Kicker>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Your crawls
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Each crawl is an isolated world you model and curate.
        </p>
      </div>

      <Card id="new-crawl">
        <CardHeader>
          <CardTitle>New Crawl</CardTitle>
          <CardDescription>
            Spin up a fresh Dungeon Crawler Carl world.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <CreateCampaignForm />
        </div>
      </Card>

      {campaigns.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No crawls yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`}>
                <Card className="h-full transition-colors hover:border-[var(--accent)]">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <span className="size-[7px] rounded-full bg-[var(--accent)]" />
                      <HudTag>{c.members[0]?.role ?? "MEMBER"}</HudTag>
                    </div>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      {c.summary || "No summary yet."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
