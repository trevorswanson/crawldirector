import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Kicker } from "@/components/ui/kicker";

/**
 * The console "screen shell" — the per-route skeleton every DM screen is built
 * from so screens feel interchangeable. See the "Screen shell" section of
 * docs/13-design-language.md; the canonical usage is the Timeline
 * (components/timeline/campaign-timeline.tsx) and Settings.
 *
 * A screen that has no dedicated design/mockup/screen-* file MUST adopt these
 * primitives rather than hand-rolling its own layout (this is what went wrong
 * with the first Settings page — a centered card that read nothing like the rest
 * of the console). Keep every color a CSS variable; never hardcode a hex (AGENTS.md).
 */

/**
 * ConsoleScreen — the full-bleed outer grid that fills the route. Renders the
 * `grid h-full min-h-0 overflow-hidden bg-[var(--bg)]` wrapper plus the main
 * column (`flex min-h-0 min-w-0 flex-col`) so the rail and the scrolling body
 * line up the same way on every screen. The `264px` rail track here is the single
 * source of truth for console rail width — every screen with a rail goes through
 * this component, so rails never drift between routes. Pass an optional `rail` (a `<ScreenRail>`)
 * and the main-column content (typically a `<ScreenHeader>` then a scrolling body)
 * as children. There is no `mx-auto max-w-*` wrapper around the shell — center
 * *content* inside the main column instead (`max-w-[760px]`).
 */
export function ConsoleScreen({
  rail,
  children,
  className,
}: {
  /** Optional left rail — a `<ScreenRail>`. Adds the `lg` two-column grid. */
  rail?: ReactNode;
  /** Main-column content (header band + scrolling body). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-cols-1 overflow-hidden bg-[var(--bg)]",
        rail && "lg:grid-cols-[264px_minmax(0,1fr)]",
        className,
      )}
    >
      {rail}
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
    </div>
  );
}

/**
 * ScreenRail — the raised left rail (`<aside>` on `--bg-1` with a hairline right
 * border, hidden below `lg`). Opens with an optional bordered header block
 * holding a `Kicker` + a mono caption, then a `min-h-0 flex-1 overflow-y-auto`
 * scrolling body (`children`); pinned `footer` content sits below the scroll
 * region. Active items inside should use the gold left-accent
 * (`border-l-2 border-[var(--accent)] bg-[var(--bg-3)]`), mirroring `DmNav`.
 */
export function ScreenRail({
  kicker,
  caption,
  header,
  children,
  footer,
  bodyClassName,
  className,
}: {
  /** Header-block eyebrow (rendered in a `Kicker`). Ignored when `header` is set. */
  kicker?: ReactNode;
  /** Header-block caption — a mono micro-line, e.g. the campaign name. Ignored when `header` is set. */
  caption?: ReactNode;
  /**
   * Custom header-block content, for rails whose header is a mini-toolbar rather
   * than a kicker + caption (e.g. the Review Queue's filter controls). Overrides
   * `kicker`/`caption` and is rendered inside the same bordered header block.
   */
  header?: ReactNode;
  /** Scrolling rail body. */
  children?: ReactNode;
  /** Pinned content below the scroll region (e.g. filters), each a `border-t` block. */
  footer?: ReactNode;
  /** Padding/utility classes for the scroll region (varies per screen). */
  bodyClassName?: string;
  className?: string;
}) {
  const headerBlock =
    header ??
    (kicker || caption ? (
      <>
        {kicker && <Kicker className="mb-[9px]">{kicker}</Kicker>}
        {caption && (
          <div className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
            {caption}
          </div>
        )}
      </>
    ) : null);

  return (
    <aside
      className={cn(
        "hidden min-h-0 flex-col border-r border-[var(--line)] bg-[var(--bg-1)] lg:flex",
        className,
      )}
    >
      {headerBlock && (
        <div className="border-b border-[var(--line)] px-4 py-[14px]">
          {headerBlock}
        </div>
      )}
      {children !== undefined && (
        <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
          {children}
        </div>
      )}
      {footer}
    </aside>
  );
}

/**
 * ScreenHeader — the main column's HUD header band: a bracketed
 * `border-b border-[var(--line)] bg-[var(--bg-1)] px-[26px] py-4` block holding a
 * `Kicker` eyebrow, a `font-display` title, and optional right-aligned actions
 * (`HudTag`s, buttons). The scrolling body lives below it so the header stays put
 * while the body scrolls.
 */
export function ScreenHeader({
  kicker,
  title,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  /** Right-aligned actions (HudTags, buttons). When omitted the title spans the band. */
  actions?: ReactNode;
  className?: string;
}) {
  const heading = (
    <div>
      {kicker && <Kicker className="mb-2">{kicker}</Kicker>}
      <h1 className="font-display text-[27px] font-bold leading-tight tracking-[.01em] text-[var(--ink)]">
        {title}
      </h1>
    </div>
  );

  return (
    <div
      className={cn(
        "bracket border-b border-[var(--line)] bg-[var(--bg-1)] px-[26px] py-4",
        className,
      )}
    >
      {actions ? (
        <div className="flex flex-wrap items-start justify-between gap-[18px]">
          {heading}
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      ) : (
        heading
      )}
    </div>
  );
}
