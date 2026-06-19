import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { JobKind, JobStatus, Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listRecentJobs } from "@/server/services/jobs";
import { ConsoleScreen, ScreenHeader, ScreenRail } from "@/components/console/screen";
import { JobQueueList, jobKindLabels } from "@/components/jobs/job-queue-list";
import { Kicker } from "@/components/ui/kicker";

function activeEnumValue<T extends string>(value: string | string[] | undefined, values: T[]) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && values.includes(candidate as T) ? (candidate as T) : undefined;
}

function filterLinkClass(active: boolean) {
  return active
    ? "flex items-center border-l-2 border-[var(--accent)] bg-[var(--bg-3)] px-2 py-[7px] text-[11px] text-[var(--ink)]"
    : "flex items-center border-l-2 border-transparent px-2 py-[7px] text-[11px] text-[var(--ink-dim)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--ink)]";
}

export default async function CampaignJobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ kind?: string | string[]; status?: string | string[]; ai?: string | string[] }>;
}) {
  const { id } = await params;
  const rawSearchParams = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== Role.OWNER && role !== Role.CO_DM) notFound();

  const activeKind = activeEnumValue(rawSearchParams.kind, Object.values(JobKind));
  const activeStatus = activeEnumValue(rawSearchParams.status, Object.values(JobStatus));
  const aiOnly = (Array.isArray(rawSearchParams.ai) ? rawSearchParams.ai[0] : rawSearchParams.ai) === "1";
  const filters = {
    kinds: activeKind ? [activeKind] : undefined,
    statuses: activeStatus ? [activeStatus] : undefined,
    aiOnly,
  };
  const jobs = await listRecentJobs(user.id, id, null, filters);

  const hrefWith = (overrides: { kind?: JobKind; status?: JobStatus; ai?: string }) => {
    const next = new URLSearchParams();
    const merged = {
      kind: activeKind,
      status: activeStatus,
      ai: aiOnly ? "1" : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/campaigns/${id}/jobs?${query}` : `/campaigns/${id}/jobs`;
  };

  const filtered = Boolean(activeKind || activeStatus || aiOnly);

  return (
    <ConsoleScreen
      rail={
        <ScreenRail kicker="Job filters" caption={`${jobs.length} matching`} bodyClassName="px-4 py-4">
          <section className="mb-6">
            <Kicker dim noLead className="mb-[10px]">
              Job type
            </Kicker>
            <div className="flex flex-col">
              <Link href={hrefWith({ kind: undefined })} className={filterLinkClass(!activeKind)}>
                All job types
              </Link>
              {Object.values(JobKind).map((kind) => (
                <Link
                  key={kind}
                  href={hrefWith({ kind: activeKind === kind ? undefined : kind })}
                  className={filterLinkClass(activeKind === kind)}
                >
                  {jobKindLabels[kind]}
                </Link>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <Kicker dim noLead className="mb-[10px]">
              Status
            </Kicker>
            <div className="flex flex-col">
              <Link href={hrefWith({ status: undefined })} className={filterLinkClass(!activeStatus)}>
                All statuses
              </Link>
              {Object.values(JobStatus).map((status) => (
                <Link
                  key={status}
                  href={hrefWith({ status: activeStatus === status ? undefined : status })}
                  className={filterLinkClass(activeStatus === status)}
                >
                  {status.toLowerCase()}
                </Link>
              ))}
            </div>
          </section>

          <section>
            <Kicker dim noLead className="mb-[10px]">
              Usage
            </Kicker>
            <Link
              href={hrefWith({ ai: aiOnly ? undefined : "1" })}
              className={filterLinkClass(aiOnly)}
            >
              <Sparkles aria-hidden size={13} className="mr-2 text-[var(--ai)]" />
              AI-only
            </Link>
          </section>
        </ScreenRail>
      }
    >
      <ScreenHeader kicker={campaign.name} title="Job Queue" />
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">
          <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
            Full background job history kicked off by the DM console. The worker
            updates these rows as jobs move from queued to running, succeeded, or
            failed; queued jobs can be canceled here.
          </p>
          <JobQueueList jobs={jobs} campaignId={id} filtered={filtered} />
        </div>
      </div>
    </ConsoleScreen>
  );
}
