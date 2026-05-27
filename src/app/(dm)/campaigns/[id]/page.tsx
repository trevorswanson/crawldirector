import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const role = campaign.members[0]?.role ?? "MEMBER";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-[var(--muted-foreground)] hover:underline"
        >
          ← All campaigns
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {campaign.name}
        </h1>
        {campaign.summary && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {campaign.summary}
          </p>
        )}
        <div className="mt-1 flex gap-3 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          <span>Role: {role}</span>
          <span>
            {campaign._count.members} member
            {campaign._count.members === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This world is empty</CardTitle>
          <CardDescription>
            Entities, relationships, events, and the review pipeline arrive in
            the next milestones. For now, your campaign exists and you own its
            canon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted-foreground)]">
            Coming soon: crawlers and the generic entity browser (M1), then the
            review pipeline that keeps every AI suggestion subordinate to you
            (M2).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
