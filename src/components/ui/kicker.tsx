import { cn } from "@/lib/utils";

/**
 * Mono uppercase micro-label with a leading rule — the HUD section eyebrow.
 * See docs/13-design-language.md.
 */
export function Kicker({
  children,
  dim,
  noLead,
  className,
}: {
  children: React.ReactNode;
  dim?: boolean;
  noLead?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("kicker", dim && "dim", noLead && "nolead", className)}
    >
      {children}
    </span>
  );
}
