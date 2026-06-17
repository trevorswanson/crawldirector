"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import {
  searchCampaignPreviewAction,
  type SearchPreviewItem,
} from "@/app/(dm)/actions";

/**
 * Topbar campaign search. Clicking into it stays in place: it previews ranked
 * canon hits and offers an "Ask the Campaign" handoff for the typed query.
 */
export function GlobalSearchLink() {
  const pathname = usePathname();
  const router = useRouter();
  const campaignId = pathname.match(/^\/campaigns\/([^/]+)/)?.[1] ?? null;
  const listId = useId();
  const [query, setQuery] = useState("");
  // The dropdown only shows while the box has focus, so clicking away hides it.
  const [open, setOpen] = useState(false);
  const [resultState, setResultState] = useState<{
    query: string;
    items: SearchPreviewItem[];
    error: boolean;
  } | null>(null);
  const trimmed = query.trim();
  const searchHref = campaignId
    ? `/campaigns/${campaignId}/search?q=${encodeURIComponent(trimmed)}`
    : "#";

  // Enter (or "See all results") jumps to the full search page for the query.
  function goToResults() {
    if (!campaignId || !trimmed) return;
    setOpen(false);
    router.push(searchHref);
  }
  const activeResult = resultState?.query === trimmed ? resultState : null;
  const results = activeResult?.items ?? [];
  const loading = Boolean(campaignId && trimmed && !activeResult);
  const error = activeResult?.error ?? false;

  useEffect(() => {
    if (!campaignId || !trimmed) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchCampaignPreviewAction(campaignId, trimmed)
        .then((items) => {
          if (cancelled) return;
          setResultState({ query: trimmed, items, error: false });
        })
        .catch(() => {
          if (cancelled) return;
          setResultState({ query: trimmed, items: [], error: true });
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [campaignId, trimmed]);

  if (!campaignId) {
    return (
      <span
        title="Open a campaign to search or ask its canon."
        aria-disabled
        className="hidden cursor-not-allowed items-center gap-[9px] border border-[var(--line)] bg-[var(--bg)] px-[11px] py-[6px] text-[var(--ink-faint)] lg:flex"
      >
        <Search aria-hidden size={14} />
        <span className="text-[12.5px]">Search · Ask the Campaign…</span>
      </span>
    );
  }

  return (
    <div
      className="relative hidden min-w-[280px] lg:block"
      onBlur={(event) => {
        // Hide the dropdown once focus leaves the box entirely (clicking a
        // result/footer link keeps focus inside, so navigation still fires).
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <div className="flex items-center gap-[9px] border border-[var(--line)] bg-[var(--bg)] px-[11px] py-[6px] text-[var(--ink-dim)] focus-within:border-[var(--line-strong)] focus-within:text-[var(--ink)]">
        <Search aria-hidden size={14} />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              goToResults();
            }
          }}
          aria-label="Search or ask the campaign"
          aria-controls={trimmed && open ? listId : undefined}
          placeholder="Search · Ask the Campaign…"
          className="w-full bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-dim)]"
        />
      </div>
      {trimmed && open && (
        <div
          id={listId}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[360px] overflow-y-auto border border-[var(--line-strong)] bg-[var(--bg)] shadow-[0_16px_35px_rgba(0,0,0,.35)]"
        >
          <div className="flex flex-col py-1">
            {loading && results.length === 0 ? (
              <p className="px-3 py-2 font-mono text-[10px] text-[var(--ink-faint)]">
                Searching...
              </p>
            ) : error ? (
              <p className="px-3 py-2 font-mono text-[10px] text-[var(--no)]">
                Search unavailable.
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 font-mono text-[10px] text-[var(--ink-faint)]">
                No matching canon.
              </p>
            ) : (
              results.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex flex-col gap-[2px] px-3 py-[8px] transition-colors hover:bg-[var(--bg-3)]"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[12.5px] text-[var(--ink)]">
                      {item.label}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[.07em] text-[var(--ink-faint)]">
                      {item.meta}
                    </span>
                  </span>
                  {item.excerpt && (
                    <span className="line-clamp-1 text-[11px] text-[var(--ink-dim)]">
                      {item.excerpt}
                    </span>
                  )}
                </Link>
              ))
            )}
          </div>
          <div className="border-t border-[var(--line)] p-1">
            <Link
              href={searchHref}
              onClick={() => setOpen(false)}
              className="block px-3 py-[8px] text-[12px] text-[var(--ink-dim)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--ink)]"
            >
              See all results for &quot;{trimmed}&quot;
            </Link>
            <Link
              href={`/campaigns/${campaignId}/ask?q=${encodeURIComponent(trimmed)}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-[8px] text-[12px] text-[var(--ai)] transition-colors hover:bg-[var(--bg-3)]"
            >
              Ask the campaign &quot;{trimmed}&quot;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
