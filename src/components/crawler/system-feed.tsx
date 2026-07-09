import { Radio } from "lucide-react";

import { Markdown } from "@/components/ui/markdown";
import type { SystemFeedMessage } from "@/server/services/system-feed";

// The player-facing System-message feed: THE SYSTEM's in-fiction broadcasts,
// newest first. Each card renders the message's real content (headline +
// optional summary + Markdown body) — no invented "kind" badge or filler, so
// the feed shows only what the DM actually published (AGENTS.md). The empty
// state is a single honest note rather than a faked broadcast.

function formatBroadcast(at: Date): string {
  return at.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SystemFeed({ messages }: { messages: SystemFeedMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="grid h-60 place-items-center text-center text-[var(--ink-faint)]">
        <div>
          <Radio aria-hidden size={36} className="mx-auto opacity-40" />
          <p className="mt-3 text-sm">
            No broadcasts yet. When your DM publishes a System message, it
            appears here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-[10px]">
      {messages.map((message) => (
        <article
          key={message.entityId}
          className="panel border-l-2 border-l-[var(--accent)] p-[16px]"
        >
          <div className="mb-2 flex items-center gap-[10px]">
            <span className="font-mono text-[9.5px] uppercase tracking-[.12em] text-[var(--accent)]">
              System broadcast
            </span>
            <time
              dateTime={message.broadcastAt.toISOString()}
              className="ml-auto font-mono text-[10px] text-[var(--ink-faint)]"
            >
              {formatBroadcast(message.broadcastAt)}
            </time>
          </div>
          <h2 className="font-display text-[17px] font-semibold leading-[1.2]">
            {message.name}
          </h2>
          {message.summary && (
            <p className="mt-[6px] text-[13px] leading-[1.5] text-[var(--ink-dim)]">
              {message.summary}
            </p>
          )}
          {message.description && (
            <div className="mt-[10px] text-[14px] leading-[1.55]">
              <Markdown content={message.description} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
