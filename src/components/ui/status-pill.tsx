import { statusMeta } from "@/lib/entities";

/** Canon-status pill with a leading status dot. */
export function StatusPill({ status }: { status: string }) {
  const s = statusMeta(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: s.color,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          background: s.color,
          display: "inline-block",
          borderRadius: "50%",
        }}
      />
      {s.label}
    </span>
  );
}
