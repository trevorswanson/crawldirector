import { notFound } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listRecentJobs } from "@/server/services/jobs";
import { PageContainer } from "@/components/console/page-container";
import { JobQueueList } from "@/components/jobs/job-queue-list";
import { Kicker } from "@/components/ui/kicker";

export default async function CampaignJobsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== Role.OWNER && role !== Role.CO_DM) notFound();

  const jobs = await listRecentJobs(user.id, id, null);

  return (
    <PageContainer>
      <Kicker dim noLead className="mb-2">
        Jobs - {campaign.name}
      </Kicker>
      <h1 className="font-display mb-1 text-[26px] font-bold tracking-[.01em]">
        Job Queue
      </h1>
      <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
        Full background job history kicked off by the DM console. The worker
        updates these rows as jobs move from queued to running, succeeded, or
        failed; queued and running jobs can be canceled here.
      </p>
      <JobQueueList jobs={jobs} campaignId={id} />
    </PageContainer>
  );
}
