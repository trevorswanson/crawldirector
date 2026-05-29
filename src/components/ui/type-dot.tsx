import { entityTypeColor } from "@/lib/entities";

/** Small color dot encoding an entity's type category. */
export function TypeDot({ type, size = 9 }: { type: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: entityTypeColor(type),
        display: "inline-block",
      }}
    />
  );
}
