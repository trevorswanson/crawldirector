import { Lock, Unlock } from "lucide-react";

/**
 * Lock indicator for canon. Display-only for now — the lock *mutation* (and the
 * lock-aware blocking it implies) lands with the M2 review pipeline; until then
 * this just surfaces the `entity.locked` flag in the design language.
 */
export function LockChip({ locked }: { locked: boolean }) {
  const color = locked ? "var(--sys)" : "var(--ink-faint)";
  const Glyph = locked ? Lock : Unlock;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${locked ? "var(--sys)" : "var(--line-strong)"}`,
        color,
        padding: "2px 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: ".1em",
        textTransform: "uppercase",
      }}
    >
      <Glyph aria-hidden size={11} />
      {locked ? "Locked" : "Unlocked"}
    </span>
  );
}
