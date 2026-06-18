// Disposition (−100…100) as a centered diverging bar + signed readout. Shared by
// the relationship graph's connections panel and the entity page's Connections
// panel so an edge's affinity reads the same everywhere: warm allies (--ok), hot
// rivals (--hot), faint near-neutral/unknown. Pure presentational — no hooks, so
// it's safe to import from server or client components.

/** Disposition → accent: warm allies, hot rivals, faint neutral/unknown. */
export function dispositionColor(disposition: number | null): string {
  if (disposition != null && disposition > 20) return "var(--ok)";
  if (disposition != null && disposition < -20) return "var(--hot)";
  return "var(--ink-faint)";
}

/**
 * Diverging meter for a relationship's disposition. The fill grows from the
 * centre tick — left for dislike, right for affinity — and a signed value reads
 * out below it. Callers gate on a non-null disposition before rendering.
 */
export function DispositionBar({ disposition }: { disposition: number }) {
  return (
    <>
      <div className="relative mt-2 h-1 bg-[var(--bg-3)]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--ink-faint)]" />
        <div
          className="absolute inset-y-0"
          style={{
            background: dispositionColor(disposition),
            left: disposition < 0 ? `${50 + disposition / 2}%` : "50%",
            width: `${Math.abs(disposition) / 2}%`,
          }}
        />
      </div>
      <div className="mt-1 font-mono text-[9.5px] text-[var(--ink-faint)]">
        disposition {disposition > 0 ? "+" : ""}
        {disposition}
      </div>
    </>
  );
}
