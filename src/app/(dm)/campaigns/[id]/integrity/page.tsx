import Link from "next/link";
import { notFound } from "next/navigation";

import { JobKind, Role } from "@/generated/prisma/client";
import { formatEntityType } from "@/lib/entities";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getActiveCampaignJob } from "@/server/services/jobs";
import {
  getCampaignIntegrityReport,
  type BrokenReferenceIssue,
  type StaleDataIssue,
} from "@/server/services/references";
import { ConsoleScreen, ScreenHeader } from "@/components/console/screen";
import { MigrateEntityDataButton } from "@/components/integrity/migrate-entity-data-button";
import { Panel, PanelHeader } from "@/components/ui/panel";

function Stat({
  label,
  value,
  tone = "text-[var(--ink)]",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--bg-1)] px-4 py-3">
      <div className={`font-display text-[24px] font-semibold ${tone}`}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
        {label}
      </div>
    </div>
  );
}

function reasonLabel(issue: BrokenReferenceIssue) {
  switch (issue.reason) {
    case "MISSING":
      return "The saved target is no longer in this campaign.";
    case "ARCHIVED":
      return "The saved target is archived.";
    case "WRONG_TYPE":
      return `Expected ${formatEntityType(issue.targetType)}; actual ${formatEntityType(issue.actualType ?? "UNKNOWN")}.`;
  }
}

function BrokenReferenceRow({
  issue,
  campaignId,
}: {
  issue: BrokenReferenceIssue;
  campaignId: string;
}) {
  return (
    <li className="grid gap-3 border-t border-[var(--line)] px-[18px] py-4 md:grid-cols-[minmax(0,1fr)_160px]">
      <div className="min-w-0">
        <Link
          href={`/campaigns/${campaignId}/entities/${issue.entityId}`}
          className="font-display text-[15px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
        >
          {issue.entityName}
        </Link>
        <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
          {formatEntityType(issue.entityType)} field{" "}
          <span className="font-mono text-[var(--ink-dim)]">{issue.patchKey}</span>{" "}
          points to{" "}
          <span className="font-mono text-[var(--ink-dim)]">{issue.targetId}</span>.
        </p>
        <p className="mt-1 text-[12px] text-[var(--ink-dim)]">{reasonLabel(issue)}</p>
        <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
          Open the entity and choose a valid target, clear the field, or restore the
          archived target if it still belongs in play.
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-start gap-2 md:justify-end">
        <span className="border border-[color-mix(in_srgb,var(--no)_50%,transparent)] bg-[color-mix(in_srgb,var(--no)_10%,transparent)] px-2 py-1 font-mono text-[10px] uppercase tracking-[.08em] text-[var(--no)]">
          {issue.reason}
        </span>
        <Link
          href={`/campaigns/${campaignId}/entities/${issue.entityId}`}
          className="border border-[var(--line)] px-2 py-1 font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          aria-label={`Open entity ${issue.entityName}`}
        >
          Open entity
        </Link>
      </div>
    </li>
  );
}

function StaleDataRow({
  issue,
  campaignId,
}: {
  issue: StaleDataIssue;
  campaignId: string;
}) {
  return (
    <li className="grid gap-3 border-t border-[var(--line)] px-[18px] py-4 md:grid-cols-[minmax(0,1fr)_120px]">
      <div className="min-w-0">
        <Link
          href={`/campaigns/${campaignId}/entities/${issue.entityId}`}
          className="font-display text-[15px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
        >
          {issue.entityName}
        </Link>
        <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
          {formatEntityType(issue.entityType)} details are using an older saved
          format.
        </p>
      </div>
      <div className="font-mono text-[11px] uppercase tracking-[.08em] text-[var(--sys)] md:text-right">
        v{issue.storedVersion} -&gt; v{issue.currentVersion}
      </div>
    </li>
  );
}

export default async function CampaignIntegrityPage({
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

  const report = await getCampaignIntegrityReport(user.id, id);
  const issueCount = report.brokenReferences.length + report.staleData.length;
  const activeDataRepairJobRow =
    report.staleData.length > 0
      ? await getActiveCampaignJob(user.id, id, JobKind.MIGRATE_ENTITY_DATA)
      : null;
  const activeDataRepairJob =
    activeDataRepairJobRow &&
    (activeDataRepairJobRow.status === "QUEUED" || activeDataRepairJobRow.status === "RUNNING")
      ? {
          id: activeDataRepairJobRow.id,
          status: activeDataRepairJobRow.status,
          createdAt: activeDataRepairJobRow.createdAt,
          startedAt: activeDataRepairJobRow.startedAt,
        }
      : null;

  return (
    <ConsoleScreen>
      <ScreenHeader kicker={campaign.name} title="Canon Integrity" />
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">
          <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
            Checks every live entity for broken links and older saved data formats.
            Only DMs can see this because the scan includes hidden campaign canon.
          </p>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="checked" value={report.checkedEntities} />
            <Stat
              label="broken refs"
              value={report.brokenReferences.length}
              tone={report.brokenReferences.length > 0 ? "text-[var(--no)]" : "text-[var(--ink)]"}
            />
            <Stat
              label="stale data"
              value={report.staleData.length}
              tone={report.staleData.length > 0 ? "text-[var(--sys)]" : "text-[var(--ink)]"}
            />
          </div>

          {issueCount === 0 ? (
            <Panel>
              <div className="px-[18px] py-6">
                <p className="font-display text-[17px] font-semibold">
                  No integrity issues detected.
                </p>
                <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
                  All live reference fields resolve and all versioned data rows are
                  current.
                </p>
              </div>
            </Panel>
          ) : (
            <div className="grid gap-5">
              <Panel>
                <PanelHeader
                  kicker="References"
                  title="Broken entity links"
                  sub="These fields point at a missing, archived, or wrong-type entity. Each one needs a DM decision: choose the right target, clear the field, or restore the archived target."
                />
                {report.brokenReferences.length === 0 ? (
                  <p className="px-[18px] py-4 text-[12px] text-[var(--ink-faint)]">
                    No broken entity links.
                  </p>
                ) : (
                  <ul>
                    {report.brokenReferences.map((issue) => (
                      <BrokenReferenceRow
                        key={`${issue.entityId}:${issue.field}:${issue.targetId}`}
                        issue={issue}
                        campaignId={id}
                      />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel>
                <PanelHeader
                  kicker="Data repair"
                  title="Older saved data formats"
                  sub="These entries still load, but they need a background cleanup so future tools read the latest shape. Queue a repair pass; the worker updates them and records the change in history."
                />
                {report.staleData.length > 0 && (
                  <div className="border-b border-[var(--line)] px-[18px] py-3">
                    <MigrateEntityDataButton
                      campaignId={id}
                      activeJob={activeDataRepairJob}
                    />
                  </div>
                )}
                {report.staleData.length === 0 ? (
                  <p className="px-[18px] py-4 text-[12px] text-[var(--ink-faint)]">
                    No data-format repairs needed.
                  </p>
                ) : (
                  <ul>
                    {report.staleData.map((issue) => (
                      <StaleDataRow
                        key={issue.entityId}
                        issue={issue}
                        campaignId={id}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </div>
      </div>
    </ConsoleScreen>
  );
}
