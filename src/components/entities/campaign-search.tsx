"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";

interface CampaignSearchProps {
  initialQuery: string;
  activeTag?: string;
  activeType?: string;
  activeStatus?: string;
  activeSource?: string;
  lockedOnly?: boolean;
}

export function CampaignSearch({
  initialQuery,
  activeTag,
  activeType,
  activeStatus,
  activeSource,
  lockedOnly,
}: CampaignSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [prevQuery, setPrevQuery] = useState(initialQuery);
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  if (initialQuery !== prevQuery) {
    setPrevQuery(initialQuery);
    setValue(initialQuery);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value === initialQuery) return;

      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value);
      if (activeTag) params.set("tag", activeTag);
      if (activeType) params.set("type", activeType);
      if (activeStatus && activeStatus !== "ALL") params.set("status", activeStatus);
      if (activeSource && activeSource !== "ALL") params.set("source", activeSource);
      if (lockedOnly) params.set("locked", "1");

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    }, 200); // 200ms debounce

    return () => clearTimeout(timeout);
  }, [value, initialQuery, activeTag, activeType, activeStatus, activeSource, lockedOnly, pathname, router]);

  return (
    <div className="relative flex items-center gap-[9px] bg-[var(--bg)] border border-[var(--line-strong)] px-3 py-[8px] flex-1 max-w-[420px] rounded-[2px] focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--ring)]">
      <Search
        aria-hidden
        size={15}
        className="text-[var(--ink-faint)] shrink-0"
      />
      <input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search entities, tags, summaries…"
        className="flex-1 bg-transparent border-none text-[var(--ink)] text-[13px] outline-none placeholder:text-[var(--ink-faint)]"
      />
      {isPending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--ink-faint)] animate-pulse">
          Searching...
        </span>
      )}
    </div>
  );
}
