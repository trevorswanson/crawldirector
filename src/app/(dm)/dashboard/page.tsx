import Link from "next/link";

import { requireUser } from "@/server/auth/session";
import { listCampaignsForUser } from "@/server/services/campaigns";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateCampaignForm } from "@/components/campaigns/create-campaign-form";

export default async function DashboardPage() {
  const user = await requireUser();
  const campaigns = await listCampaignsForUser(user.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your campaigns</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Each campaign is an isolated world you model and curate.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New campaign</CardTitle>
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
          No campaigns yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`}>
                <Card className="transition-colors hover:border-[var(--primary)]">
                  <CardHeader>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      {c.summary || "No summary yet."}
                    </CardDescription>
                    <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {c.members[0]?.role ?? "MEMBER"}
                    </span>
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
