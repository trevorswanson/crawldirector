import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-not-allowed read-only:opacity-60 read-only:bg-[var(--bg-3)]",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
