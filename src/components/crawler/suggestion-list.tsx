import type { MySuggestion } from "@/server/services/review";

// The player's own suggestion history (M7 slice 6), so submitting isn't a
// black hole — a player can see whether their suggestion is still pending or
// how the DM resolved it. Read-only: no operation/patch detail here (that's
// the DM's Review Queue); just the headline status per docs/PROGRESS.md.

const STATUS_META: Record<
  MySuggestion["status"],
  { label: string; color: string }
> = {
  PENDING: { label: "Pending review", color: "var(--ink-faint)" },
  APPROVED: { label: "Approved", color: "var(--ok)" },
  PARTIALLY_APPLIED: { label: "Partially approved", color: "var(--ok)" },
  REJECTED: { label: "Rejected", color: "var(--no)" },
  SUPERSEDED: { label: "Superseded", color: "var(--no)" },
};

function StatusChip({ status }: { status: MySuggestion["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="hud-tag shrink-0"
      style={{ color: meta.color, borderColor: meta.color }}
    >
      {meta.label}
    </span>
  );
}

export function SuggestionList({ suggestions }: { suggestions: MySuggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--ink-faint)]">
        You haven&apos;t submitted a suggestion yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-[10px]">
      {suggestions.map((suggestion) => (
        <li
          key={suggestion.id}
          className="flex flex-col gap-[6px] border border-[var(--line)] bg-[var(--bg-2)] px-[14px] py-[11px]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-[var(--ink)]">
              {suggestion.title}
            </span>
            <StatusChip status={suggestion.status} />
          </div>
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-[var(--ink-faint)]">
            <span>{suggestion.createdAt.toLocaleDateString()}</span>
            {suggestion.reviewedAt ? (
              <span>reviewed {suggestion.reviewedAt.toLocaleDateString()}</span>
            ) : null}
          </div>
          {suggestion.reviewNotes ? (
            <p className="text-[12px] leading-[1.5] text-[var(--ink-dim)]">
              &ldquo;{suggestion.reviewNotes}&rdquo;
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
