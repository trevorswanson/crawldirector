# 13 — Design language

CrawlDirector's UI has a deliberate identity: the **in-fiction "Dungeon Crawler
World" broadcast HUD** — a warm-black control room where a DM directs a televised
dungeon. This doc is the canonical spec. The **visual source of truth** is the
saved mockup in [`design/mockup/`](./design/mockup/) (study
`CrawlDirector Console.html`); when in doubt, match it.

> **Rule for every milestone:** build UI from the tokens and primitives below.
> Never hardcode a hex value in a component — use a CSS variable (or a shadcn
> alias). New surfaces should feel like they came out of the same console.

## Where it lives

- **Tokens + base HUD CSS:** [`../src/app/globals.css`](../src/app/globals.css).
- **Fonts + broadcast-FX overlays:** [`../src/app/layout.tsx`](../src/app/layout.tsx).
- **Primitives:** [`../src/components/ui/`](../src/components/ui) and the console
  shell in [`../src/components/console/`](../src/components/console).
- **Presentation helpers** (status/provenance/type → color):
  [`../src/lib/entities.ts`](../src/lib/entities.ts).

## Type

| Role    | Family          | CSS var          | Use                                  |
| ------- | --------------- | ---------------- | ------------------------------------ |
| Display | Chakra Petch    | `--font-display` | Headings, brand, titles              |
| Body    | Space Grotesk   | `--font-body`    | Prose, descriptions, controls        |
| Mono    | JetBrains Mono  | `--font-mono`    | Labels, kickers, badges, data values |

Loaded via `next/font/google` in the root layout. Tailwind `font-display` /
`font-mono` utilities are wired to these.

## Color tokens

Warm near-black surfaces, DCC book-cover gold accent, ink on top.

| Token              | Value (default) | Meaning                              |
| ------------------ | --------------- | ------------------------------------ |
| `--bg` … `--bg-4`  | `#0a0908`→`#262019` | Page → raised surfaces (5 layers) |
| `--ink`            | `#f3eee3`       | Primary text                         |
| `--ink-dim`        | `#a89f8d`       | Secondary text                       |
| `--ink-faint`      | `#6d6557`       | Tertiary / disabled                  |
| `--accent`         | `#f0c349`       | DCC gold — primary/brand/active      |
| `--accent-ink`     | `#1a1306`       | Text on accent                       |
| `--hot`            | `#ff5b3a`       | Hazard / live                        |
| `--ok`             | `#57d98a`       | Success / canon                      |
| `--no`             | `#ff5d5d`       | Destructive / rejected               |
| `--sys`            | `#74b6ff`       | System / **locked**                  |
| `--line` / `--line-strong` | translucent ink | Hairline borders             |

### Provenance & status semantics (a core UX requirement)

The product promise is that a DM can see **at a glance what is AI vs. human, and
what is locked**. These colors are a contract — reuse them everywhere canon is
shown (see [`10-ui-ux.md`](./10-ui-ux.md) and
[`03-review-pipeline.md`](./03-review-pipeline.md)):

| Token       | Value     | Meaning                |
| ----------- | --------- | ---------------------- |
| `--ai`      | `#c08bff` | AI-generated origin    |
| `--player`  | `#5fd1c9` | Player suggestion      |
| `--import`  | `#d8a45f` | Imported               |
| `--add`     | `#57d98a` | Diff addition          |
| `--del`     | `#ff7a6b` | Diff deletion          |

Status (`CanonStatus`): PENDING = gold, CANON = green, DRAFT/ARCHIVED = dim,
REJECTED = red. **LOCKED is a separate `entity.locked` flag** rendered in `--sys`
blue via the lock chip — it is not a `CanonStatus`.

The shadcn alias layer (`--primary`, `--background`, `--card`, `--border`, …) is
mapped onto these tokens so existing Tailwind `var(--*)` utilities keep working.

## Primitives

Typed React ports of the mockup's `console-common.jsx` kit:

| Component      | File                              | Purpose                                   |
| -------------- | --------------------------------- | ----------------------------------------- |
| `Kicker`       | `ui/kicker.tsx`                   | Mono uppercase eyebrow with leading rule  |
| `HudTag`       | `ui/hud-tag.tsx`                  | Metadata chip (type, role, version)       |
| `TypeDot`      | `ui/type-dot.tsx`                 | Entity-type category color dot            |
| `SourceBadge`  | `ui/source-badge.tsx`             | Provenance badge (DM/AI/PLR/IMP)          |
| `StatusPill`   | `ui/status-pill.tsx`              | Canon-status pill with dot                |
| `LockChip`     | `ui/lock-chip.tsx`                | Lock indicator (display-only until M2)    |
| `Panel`/`PanelHeader` | `ui/panel.tsx`             | HUD surface + header with kicker/actions  |
| `FxToggle`     | `ui/fx-toggle.tsx`                | Broadcast-FX on/off (client)              |
| `DmNav`        | `console/dm-nav.tsx`              | Left nav with active state + planned items|

`Button`, `Card`, `Input`, `Textarea`, `Label` are rethemed in place: square
(2px radius), hairline borders, mono-uppercase buttons (`primary`/`ok`/`bare`
variants added). Base CSS classes `.kicker`, `.panel`, `.hud-tag`, `.bracket`,
`.live-dot`, `.fade-in`, `.mono`, `.font-display` live in `globals.css`.

## Broadcast FX

Film grain, scanlines, and a vignette sell the "this is a broadcast feed" vibe.
They are **subtle and optional**:

- Default ON at low opacity (`--grain-opacity .045`, `--scan-opacity .05`).
- Gated by `html.fx`; the preference persists in the `cd-fx` cookie and is applied
  server-side (no flash). The `FxToggle` in the DM topbar flips it.
- **Accessibility:** under `prefers-reduced-motion: reduce`, all animation is
  neutralized and the flickery grain/scanline layers are force-hidden regardless
  of the toggle (the static vignette may remain). Never rely on FX to convey
  information; never let it reduce text contrast.

## Shell / information architecture

Desktop-first console (collapses below `md`): a 232px left nav + 52px topbar.

- **Brand:** boxed gold "C" + "CrawlDirector" (`(dm)/layout.tsx`).
- **Topbar:** campaign switcher, global "Search · Ask the Campaign" (planned, M5),
  FX toggle, user avatar, sign-out.
- **Left nav** (`DmNav`): grouped **DM Console** / **Player-facing**. Built screens
  link normally with a gold left-accent active state; **unbuilt screens are shown
  disabled with a "Planned · Mn" tooltip** so the nav doubles as a roadmap without
  faking pages. Keep the planned list in sync with [`11-roadmap.md`](./11-roadmap.md).

## Principles

- **No fabricated data.** Show only real campaign data. Atmosphere comes from
  styling, not invented numbers (no fake tickers/clocks/ratings — those are
  roadmapped, see [`11-roadmap.md`](./11-roadmap.md)).
- **Provenance is always visible** on canon. AI/locked status is glanceable.
- **Stub-friendly & dense** for the DM; the player-facing crawler interface (M7)
  is the in-fiction reskin and must work on phones.
