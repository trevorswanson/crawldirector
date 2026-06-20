import type { JobKind, JobStatus } from "@/generated/prisma/client";
import { cancelJobAction } from "@/app/(dm)/actions";

export type JobQueueItem = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  error: string | null;
  result: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export const jobKindLabels: Record<JobKind, string> = {
  BULK_FLESH: "Bulk flesh-out",
  LORE_SEED: "Lore seed",
  EMBED_SEARCH_DOCS: "Semantic index",
  MIGRATE_ENTITY_DATA: "Data repair",
};

const kindDescriptions: Record<JobKind, string> = {
  BULK_FLESH: "Files draft entity proposals from selected stubs.",
  LORE_SEED: "Imports the configured lore dataset into canon.",
  EMBED_SEARCH_DOCS: "Builds embeddings for hybrid campaign search.",
  MIGRATE_ENTITY_DATA: "Updates older saved entity details to the current app format.",
};

function statusColor(status: JobStatus): string {
  if (status === "SUCCEEDED") return "var(--ok)";
  if (status === "FAILED") return "var(--no)";
  if (status === "RUNNING") return "var(--ai)";
  return "var(--ink-faint)";
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function resultObject(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  return result as Record<string, unknown>;
}

function resultSummary(job: JobQueueItem): string | null {
  const result = resultObject(job.result);
  if (!result || job.status !== "SUCCEEDED") return null;

  if (job.kind === "EMBED_SEARCH_DOCS") {
    const embedded = typeof result.embedded === "number" ? result.embedded : null;
    const model = typeof result.model === "string" ? result.model : null;
    if (embedded === null) return null;
    return model ? `${embedded} embedded - ${model}` : `${embedded} embedded`;
  }

  if (job.kind === "BULK_FLESH") {
    const proposed = typeof result.proposedCount === "number" ? result.proposedCount : null;
    const skipped = typeof result.skippedCount === "number" ? result.skippedCount : null;
    if (proposed === null) return null;
    const parts = [`${proposed} proposed`];
    if (skipped !== null && skipped > 0) parts.push(`${skipped} skipped`);
    return parts.join(", ");
  }

  if (job.kind === "MIGRATE_ENTITY_DATA") {
    const migrated = typeof result.migrated === "number" ? result.migrated : null;
    const skipped = typeof result.skipped === "number" ? result.skipped : null;
    if (migrated === null) return null;
    const parts = [`${migrated} repaired`];
    if (skipped !== null && skipped > 0) parts.push(`${skipped} skipped`);
    return parts.join(", ");
  }

  const count = typeof result.count === "number" ? result.count : null;
  return count === null ? null : `${count} seeded`;
}

function timingText(job: JobQueueItem): string {
  if (job.finishedAt) return `Finished ${relativeTime(job.finishedAt)}`;
  if (job.startedAt) return `Started ${relativeTime(job.startedAt)}`;
  return `Queued ${relativeTime(job.createdAt)}`;
}

export function JobQueueList({
  jobs,
  campaignId,
  filtered = false,
}: {
  jobs: JobQueueItem[];
  campaignId?: string;
  filtered?: boolean;
}) {
  if (jobs.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center border border-dashed border-[var(--line)] bg-[var(--bg)] p-8 text-center">
        <div>
          <p className="font-display text-[18px] font-semibold">
            {filtered ? "No jobs match these filters." : "No jobs queued yet."}
          </p>
          <p className="mt-2 max-w-md text-[12.5px] leading-[1.6] text-[var(--ink-dim)]">
            {filtered
              ? "Try clearing a filter or expanding the selected job types and statuses."
              : "Background work such as semantic indexing, data repairs, bulk flesh-out runs, and lore seeding will appear here."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {jobs.map((job) => {
        const summary = resultSummary(job);
        return (
          <li key={job.id} className="panel flex flex-col gap-2 p-[14px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-[16px] font-semibold">{jobKindLabels[job.kind]}</p>
                <p className="mt-1 text-[12px] leading-[1.5] text-[var(--ink-dim)]">
                  {kindDescriptions[job.kind]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-[10px] uppercase tracking-[.08em]"
                  style={{ color: statusColor(job.status) }}
                >
                  {job.status}
                </span>
                {campaignId && job.status === "QUEUED" && (
                  <form
                    action={async () => {
                      "use server";
                      await cancelJobAction(campaignId, job.id);
                    }}
                  >
                    <button
                      type="submit"
                      aria-label={`Cancel ${jobKindLabels[job.kind]} job`}
                      className="border border-[var(--line)] px-[8px] py-[5px] font-mono text-[9px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:border-[var(--no)] hover:text-[var(--no)]"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ink-faint)]">
              <time dateTime={job.createdAt.toISOString()}>{timingText(job)}</time>
              <span className="font-mono uppercase tracking-[.08em]">{job.id.slice(0, 8)}</span>
              {summary && <span className="text-[var(--ink-dim)]">{summary}</span>}
              {job.status === "FAILED" && job.error && (
                <span className="text-[var(--no)]">{job.error}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
