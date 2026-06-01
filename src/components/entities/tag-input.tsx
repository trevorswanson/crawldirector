"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const MAX_TAGS = 20;

/**
 * Tag-selection input with campaign autocomplete. Renders selected tags as
 * removable chips and submits them as a single comma-joined hidden field
 * (`name`), so it slots into the existing entity form action + Zod `tagsSchema`
 * (which already accepts a comma-separated string). Suggestions come from the
 * campaign's existing tags; the DM can also type a brand-new tag.
 */
export function TagInput({
  name = "tags",
  defaultTags = [],
  suggestions = [],
  readOnly = false,
}: {
  name?: string;
  defaultTags?: string[];
  suggestions?: string[];
  readOnly?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(() => dedupe(defaultTags));
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLower = useMemo(
    () => new Set(tags.map((t) => t.toLowerCase())),
    [tags],
  );

  const matches = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !selectedLower.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [input, suggestions, selectedLower]);

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (selectedLower.has(value.toLowerCase())) {
      setInput("");
      return;
    }
    if (tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, value]);
    setInput("");
    setOpen(false);
  };

  const removeTag = (value: string) => {
    setTags((prev) => prev.filter((t) => t !== value));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      // Don't submit the parent form when committing a tag.
      event.preventDefault();
      addTag(input);
    } else if (event.key === "Backspace" && !input && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

  if (readOnly) {
    return (
      <>
        <input type="hidden" name={name} value={tags.join(",")} />
        <div className="flex min-h-10 flex-wrap items-center gap-[6px] rounded-md border border-[var(--input)] bg-[var(--bg-3)] px-3 py-2 opacity-60">
          {tags.length ? (
            tags.map((tag) => (
              <span key={tag} className="hud-tag px-[6px] py-px text-[10px]">
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-[var(--ink-faint)]">No tags</span>
          )}
        </div>
      </>
    );
  }

  const atCap = tags.length >= MAX_TAGS;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={tags.join(",")} />
      <div
        className="field-shell flex min-h-10 flex-wrap items-center gap-[6px] rounded-md border border-[var(--input)] bg-transparent px-2 py-[6px] focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--ring)]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="hud-tag inline-flex items-center gap-1 px-[6px] py-px text-[10px]"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              <X aria-hidden size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          aria-label="Add tag"
          value={input}
          disabled={atCap}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a suggestion click registers before the list closes.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            atCap
              ? "Tag limit reached"
              : tags.length
                ? "Add another…"
                : "floor 1, sponsor, rumor"
          }
          className="min-w-[120px] flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] disabled:cursor-not-allowed"
        />
      </div>
      {open && !atCap && (matches.length > 0 || input.trim()) && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--line-strong)] bg-[var(--bg-2)] py-1 shadow-[0_8px_24px_rgba(0,0,0,.45)]"
        >
          {matches.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                // onMouseDown so it fires before the input's onBlur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(suggestion);
                }}
                className="flex w-full items-center px-3 py-[6px] text-left text-[12.5px] text-[var(--ink-dim)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--ink)]"
              >
                {suggestion}
              </button>
            </li>
          ))}
          {input.trim() &&
            !suggestions.some(
              (s) => s.toLowerCase() === input.trim().toLowerCase(),
            ) &&
            !selectedLower.has(input.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(input);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-[6px] text-left text-[12.5px] transition-colors hover:bg-[var(--bg-3)]",
                    "text-[var(--accent)]",
                  )}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[.08em]">
                    New
                  </span>
                  {input.trim()}
                </button>
              </li>
            )}
        </ul>
      )}
    </div>
  );
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const value = tag.trim();
    if (!value) continue;
    const lower = value.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(value);
  }
  return out;
}
