import { provenanceMeta } from "@/lib/entities";

/**
 * Provenance badge — DM / AI / PLR / IMP. A core UX requirement: canon must
 * show at a glance where it came from. See docs/13-design-language.md.
 */
export function SourceBadge({
  source,
  small,
}: {
  source: string;
  small?: boolean;
}) {
  const p = provenanceMeta(source);
  return (
    <span
      title={p.label}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: small ? 9 : 10,
        letterSpacing: ".1em",
        padding: small ? "1px 5px" : "2px 7px",
        textTransform: "uppercase",
        color: p.color,
        border: `1px solid ${p.color}`,
        background: `color-mix(in srgb, ${p.color} 12%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {p.short}
    </span>
  );
}
