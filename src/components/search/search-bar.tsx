"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface SearchBarProps {
  campaignId: string;
  initialQuery: string;
  autoFocus?: boolean;
}

/**
 * Debounced query box for the campaign search page. Pushes `?q=` so the server
 * component re-runs the search; mirrors the World Browser's CampaignSearch UX.
 */
export function SearchBar({ campaignId, initialQuery, autoFocus }: SearchBarProps) {
  const router = useRouter();
  const [prevQuery, setPrevQuery] = useState(initialQuery);
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  // Keep the field in sync if the URL query changes from outside (back/forward).
  if (initialQuery !== prevQuery) {
    setPrevQuery(initialQuery);
    setValue(initialQuery);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value === initialQuery) return;
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      startTransition(() => {
        router.push(`/campaigns/${campaignId}/search${qs ? `?${qs}` : ""}`);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [value, initialQuery, campaignId, router]);

  return (
    <div className="field-shell relative flex items-center gap-[10px] rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-[14px] py-[11px] focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--ring)]">
      <Search aria-hidden size={17} className="shrink-0 text-[var(--ink-faint)]" />
      <input
        autoFocus={autoFocus}
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search canon — names, summaries, descriptions, tags…"
        className="flex-1 border-none bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        aria-label="Search canon"
      />
      {isPending && (
        <span className="absolute right-[14px] top-1/2 -translate-y-1/2 animate-pulse font-mono text-[10px] text-[var(--ink-faint)]">
          Searching…
        </span>
      )}
    </div>
  );
}
