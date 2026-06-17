import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

/** Mono uppercase metadata chip (type, role, version, …). */
export function HudTag({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span className={cn("hud-tag", className)} {...props}>
      {children}
    </span>
  );
}
