import * as React from "react";

import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "font-mono text-[10.5px] uppercase leading-none tracking-[.08em] text-[var(--ink-dim)]",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
