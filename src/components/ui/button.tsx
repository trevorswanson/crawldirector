import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// HUD buttons: mono, uppercase, square, hairline-bordered. See
// docs/13-design-language.md. Existing variant names are preserved; `primary`,
// `ok`, and `bare` are added to mirror the mockup's button kit.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono uppercase tracking-[.06em] transition-[filter,background,color] hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]",
        primary:
          "border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]",
        outline:
          "border border-[var(--line-strong)] bg-[var(--bg-3)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
        ghost:
          "border border-transparent bg-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]",
        ok: "border border-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-[var(--ok)]",
        destructive:
          "border border-[color-mix(in_srgb,var(--no)_50%,transparent)] bg-transparent text-[var(--no)]",
        bare: "border border-transparent bg-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]",
      },
      size: {
        default: "h-10 px-[13px] text-xs",
        sm: "h-8 px-[9px] text-[11px]",
        lg: "h-11 px-[18px] text-[13px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
