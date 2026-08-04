import Link from "next/link";

import type { SessionSummary } from "@/server/services/sessions";

// playedAt is a bare calendar date (parsed as UTC midnight from a
// date-only `<input type="date">`), so it must render in UTC too — otherwise
// a negative-offset timezone rolls the displayed date back by one day.
function formatPlayedAt(playedAt: Date | null) {
  return playedAt
    ? playedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Undated";
}

/** The Sessions index — most-recently-played first (docs/PROGRESS.md M8). */
export function SessionList({
  campaignId,
  sessions,
}: {
  campaignId: string;
  sessions: SessionSummary[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--ink-faint)]">
        No sessions logged yet. Start one before your next game to capture what
        happens live.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-[8px]">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            href={`/campaigns/${campaignId}/sessions/${session.id}`}
            className="flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--bg-2)] px-[14px] py-[11px] transition-colors hover:border-[var(--accent)]"
          >
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-[var(--ink)]">
                {session.title}
              </p>
              <p className="mt-[3px] font-mono text-[10px] text-[var(--ink-faint)]">
                {formatPlayedAt(session.playedAt)}
                {session.focus ? ` · ${session.focus}` : ""}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
              {session.entryCount} {session.entryCount === 1 ? "entry" : "entries"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
