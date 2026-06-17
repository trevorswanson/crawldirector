"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";

export type EntityCandidate = { id: string; name: string; type: string };

/**
 * Search-as-you-type entity picker. Replaces flat dropdowns that list every
 * entity (which doesn't scale). When nothing is selected it shows a search box
 * with ranked matches; once a candidate is chosen it collapses to a removable
 * chip. The selected id is mirrored into a hidden input named `name` so the
 * component drops into a plain <form action> without extra wiring.
 */
export function EntityTypeahead({
  name,
  candidates,
  value,
  onChange,
  searchCandidates,
  placeholder = "Search entity…",
  emptyLabel = "No matching entities.",
  autoFocus = false,
}: {
  name: string;
  candidates: EntityCandidate[];
  value: EntityCandidate | null;
  onChange: (candidate: EntityCandidate | null) => void;
  searchCandidates?: (query: string) => Promise<EntityCandidate[]>;
  placeholder?: string;
  emptyLabel?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [remoteResult, setRemoteResult] = useState<{
    query: string;
    matches: EntityCandidate[];
    error: boolean;
  } | null>(null);
  const listId = useId();

  // Debounce remote search so rapid keystrokes don't fire a server action per
  // character. Local candidate filtering (below) is instant and unaffected.
  useEffect(() => {
    if (!searchCandidates) return;
    const q = query.trim();
    if (!q) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      searchCandidates(q)
        .then((results) => {
          if (cancelled) return;
          setRemoteResult({
            query: q,
            matches: results.slice(0, 8),
            error: false,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setRemoteResult({ query: q, matches: [], error: true });
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchCandidates]);

  const trimmedQuery = query.trim();
  const activeRemoteResult =
    trimmedQuery && searchCandidates && remoteResult?.query === trimmedQuery
      ? remoteResult
      : null;
  const remoteLoading = Boolean(
    trimmedQuery && searchCandidates && remoteResult?.query !== trimmedQuery,
  );
  const remoteError = activeRemoteResult?.error ?? false;

  const matches = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    const pool = q
      ? candidates.filter((c) => c.name.toLowerCase().includes(q))
      : candidates;
    if (q && activeRemoteResult) {
      const seen = new Set(pool.map((candidate) => candidate.id));
      return [
        ...pool,
        ...activeRemoteResult.matches.filter((candidate) => !seen.has(candidate.id)),
      ].slice(0, 8);
    }
    return pool.slice(0, 8);
  }, [activeRemoteResult, candidates, trimmedQuery]);

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={name} value={value?.id ?? ""} />
      {value ? (
        <div className="flex items-center gap-[7px] border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[7px]">
          <TypeDot type={value.type} size={7} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink)]">
            {value.name}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            {formatEntityType(value.type)}
          </span>
          <button
            type="button"
            title="Choose a different entity"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="inline-flex items-center p-[2px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
          >
            <X aria-hidden size={12} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg)] px-2">
            <Search aria-hidden size={12} className="text-[var(--ink-faint)]" />
            <input
              type="text"
              autoFocus={autoFocus}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-controls={listId}
              className="w-full bg-transparent py-[6px] text-[11.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            />
          </div>
          <div
            id={listId}
            className="flex max-h-[180px] flex-col overflow-y-auto border border-[var(--line)]"
          >
            {matches.length === 0 ? (
              <p className="px-2 py-[7px] font-mono text-[10px] text-[var(--ink-faint)]">
                {remoteLoading
                  ? "Searching..."
                  : remoteError
                    ? "Search unavailable."
                    : emptyLabel}
              </p>
            ) : (
              matches.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    onChange(candidate);
                    setQuery("");
                  }}
                  className="flex items-center gap-[7px] px-2 py-[6px] text-left transition-colors hover:bg-[var(--bg-3)]"
                >
                  <TypeDot type={candidate.type} size={7} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">
                    {candidate.name}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                    {formatEntityType(candidate.type)}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
