import { cn } from "@/lib/utils";

/** Mono uppercase metadata chip (type, role, version, …). */
export function HudTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("hud-tag", className)}>{children}</span>;
}
