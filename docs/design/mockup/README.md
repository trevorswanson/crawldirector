# CrawlDirector — design mockup (reference only)

This directory is the **visual source of truth** for the CrawlDirector UI. It is a
static, high-fidelity mockup authored in Claude Design. **It is not wired into the
app build** — it does not import from `src/`, and the app does not import from it.
It is excluded from ESLint (`eslint.config.mjs`) and is not type-checked (tsconfig
only includes `*.ts`/`*.tsx`).

When you build UI for any milestone, **match this mockup** and use the design system
codified in [`../../13-design-language.md`](../../13-design-language.md). Treat the
matching screen as the visual acceptance target: layout, density, controls, and
interaction model should carry into the app unless a real data, accessibility, or
implementation constraint is documented in `../../PROGRESS.md` or an ADR.

## Source

Authored in Claude Design:
`https://api.anthropic.com/v1/design/h/vz_2Cg41ylzlL1wsSqr8Tw` (requires sign-in).
Snapshot saved here on 2026-05-29.

## Files

- **`CrawlDirector Console.html`** — the DM Console entry point (the one to study).
  Open it to see the live shell + all screens.
- **`index.html`** — the marketing homepage entry ("Reality Is Pending Review").
- `console-app.jsx` — app shell: nav router, topbar, brand, tweaks panel mount.
- `console-common.jsx` — **the HUD primitive kit** (Icon set, `SourceBadge`,
  `StatusPill`, `LockChip`, `Btn`, `PanelHead`, `Dial`, `Kicker`/`FieldKey`). The
  React components in `src/components/ui/` are typed ports of these.
- `console-data.jsx` / `world-data.jsx` — mock fixtures (provenance map, change
  sets, persona, entity catalog). **Flavor/sample data only — do not port verbatim
  into the app.** The app shows only real campaign data.
- `screen-review.jsx` — Review Queue (roadmap **M2**).
- `screen-world.jsx` — World Browser + Entity Detail (**M1**, the surfaces we have).
- `screen-studio.jsx` — AI · Persona Studio (**M6**).
- `screen-sim.jsx` — Simulation (**M11**).
- `screen-graph.jsx` — Relationship Graph (**M3**).
- `screen-crawler.jsx` — player-facing Crawler Interface (**M7**).
- `homepage-*.jsx` — marketing homepage sections.
- `tweaks-panel.jsx` — the accent/FX live-tweak panel.
- `thumbnail.svg` — project thumbnail.

## Viewing it

The JSX is transpiled in-browser via Babel standalone, so just serve the folder:

```bash
npx serve docs/design/mockup
# then open the printed URL and load "CrawlDirector Console.html"
```

(Opening the HTML via `file://` may be blocked by CORS on the `<script src>` JSX —
use a static server.)
