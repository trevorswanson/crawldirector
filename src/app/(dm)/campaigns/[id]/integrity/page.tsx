import Link from "next/link";
import { notFound } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { formatEntityType } from "@/lib/entities";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  getCampaignIntegrityReport,
  type BrokenReferenceIssue,
  type StaleDataIssue,
} from "@/server/services/references";
import { ConsoleScreen, ScreenHeader } from "@/components/console/screen";
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
      return "Target missing from this campaign.";
    case "ARCHIVED":
      return "Target is archived.";
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
      </div>
      <div className="flex items-start justify-start md:justify-end">
        <span className="border border-[color-mix(in_srgb,var(--no)_50%,transparent)] bg-[color-mix(in_srgb,var(--no)_10%,transparent)] px-2 py-1 font-mono text-[10px] uppercase tracking-[.08em] text-[var(--no)]">
          {issue.reason}
        </span>
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
          {formatEntityType(issue.entityType)} data is behind the descriptor version.
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

  return (
    <ConsoleScreen>
      <ScreenHeader kicker={campaign.name} title="Canon Integrity" />
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">
          <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
            Campaign-wide scan for broken bespoke references and stale versioned entity
            data. The scan is DM-only because it spans all live canon, including hidden
            rows.
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
                  title="Broken soft references"
                  sub="Reference fields stay soft FKs, but broken links are visible before import/export and consistency tooling consume them."
                />
                {report.brokenReferences.length === 0 ? (
                  <p className="px-[18px] py-4 text-[12px] text-[var(--ink-faint)]">
                    No broken references.
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
                  kicker="Data versions"
                  title="Stale versioned data"
                  sub="Rows listed here can be upgraded through the MIGRATE_ENTITY_DATA job path with provenance."
                />
                {report.staleData.length === 0 ? (
                  <p className="px-[18px] py-4 text-[12px] text-[var(--ink-faint)]">
                    No stale data rows.
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
