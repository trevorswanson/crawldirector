import Link from "next/link";

import { promoteSessionLogEntryAction } from "@/app/(dm)/actions";
import { PromoteEntryForm } from "@/components/sessions/promote-entry-form";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";
import type { SessionLogEntryView } from "@/server/services/sessions";

function formatEntryTime(at: Date) {
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A sensible default event title from the entry's own text — its first line,
// capped so it fits the timeline. The DM can edit before promoting.
function deriveDefaultTitle(text: string) {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "Session event";
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

/** The running log — oldest first, like a transcript. Unpromoted entries are
 * scratch, never canon (docs/08-session-mode.md); each can be promoted to a
 * canonical Event through the review pipeline, after which it links to its
 * Event on the Timeline instead. */
export function SessionLogList({
  campaignId,
  sessionId,
  entries,
}: {
  campaignId: string;
  sessionId: string;
  entries: SessionLogEntryView[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--ink-faint)]">
        No log entries yet. Jot down what happens as you play.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-[10px]">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-[6px] border border-[var(--line)] bg-[var(--bg-2)] px-[14px] py-[11px]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.5] text-[var(--ink)]">
              {entry.text}
            </p>
            <span className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
              {formatEntryTime(entry.at)}
            </span>
          </div>
          {entry.taggedEntities.length > 0 && (
            <div className="flex flex-wrap gap-[6px]">
              {entry.taggedEntities.map((entity) => (
                <Link
                  key={entity.id}
                  href={`/campaigns/${campaignId}/entities/${entity.id}`}
                  className="inline-flex items-center gap-[5px] border border-[var(--line)] px-[7px] py-[3px] text-[10.5px] text-[var(--ink-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
                >
                  <TypeDot type={entity.type} size={6} />
                  {entity.name}
                  <span className="font-mono text-[8.5px] uppercase tracking-[.05em] text-[var(--ink-faint)]">
                    {formatEntityType(entity.type)}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {entry.promotedEventId ? (
            <Link
              href={`/campaigns/${campaignId}/timeline?event=${entry.promotedEventId}`}
              className="inline-flex w-fit items-center gap-[5px] font-mono text-[9.5px] uppercase tracking-[.08em] text-[var(--ok)] transition-colors hover:brightness-110"
            >
              Promoted → view event
            </Link>
          ) : (
            <PromoteEntryForm
              defaultTitle={deriveDefaultTitle(entry.text)}
              action={promoteSessionLogEntryAction.bind(null, campaignId, sessionId, entry.id)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
