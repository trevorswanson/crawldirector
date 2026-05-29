# 10 — UI / UX

Two distinct surfaces share one app and one data layer but feel different:

1. **DM Console** — a dense worldbuilding + review workbench.
2. **Crawler Interface** — an in-fiction, read-mostly System UI for players.

> **Design language.** Both surfaces use the **"Dungeon Crawler World broadcast
> HUD"** look — warm-black, DCC gold, mono HUD labels, optional broadcast FX. The
> canonical spec (tokens, fonts, primitives, FX/accessibility rules) is
> [`13-design-language.md`](./13-design-language.md), and the visual source of
> truth is the saved mockup in [`design/mockup/`](./design/mockup/). Each IA
> section below names the mockup screen that realizes it. Build every milestone's
> UI from those primitives; the provenance/status visual semantics here are a
> cross-cutting contract, not per-screen decisions.

## DM Console

### Information architecture

- **Campaign switcher** (a DM may own/co-DM several).
- **Review Queue** — the home base. Pending Change Sets grouped by source and
  run, with diff views and batch actions. This should be the most polished
  screen; it is where the product's promise is felt. (See pipeline doc.)
  _Mockup: `design/mockup/screen-review.jsx` (M2)._
- **World browser** — navigate entities by type, floor/area, faction, tag, or
  full-text search. Quick-create stubs.
  _Mockup: `design/mockup/screen-world.jsx` (M1 — implemented)._
- **Search & "Ask the Campaign"** — a global search box (hybrid keyword + semantic)
  and a natural-language Q&A that answers from canon with **citations** linking to
  the source entities/events. Read-only; never writes canon. See
  [`07-search-retrieval.md`](./07-search-retrieval.md).
- **Entity detail** — structured fields + markdown description, the
  **connections panel** (in/out relationships), a **timeline** of events the
  entity participated in, provenance ("authored by you" vs "AI-generated, model
  X, approved by you on …"), and lock controls.
- **Relationship graph** — interactive node-link view of the campaign (filter by
  type/faction/floor). Central to feeling the "web."
  _Mockup: `design/mockup/screen-graph.jsx` (M3)._
- **Causality view** — for any event/entity, the upstream-cause /
  downstream-effect chain as a navigable DAG.
- **Timeline** — chronological events with in-game-time ordering and filters.
- **AI generation panel** — pick a generator, set params/scope, preview cost,
  run; results flow to the Review Queue. For persona-aware generators, show the
  compiled System AI persona that will flavor the run, with inline edit.
- **Agent profile studio** — author any actor entity's profile: per-type dial
  sliders, values, overt + secret goals, resources, knowledge-scope toggle,
  voice-guide textarea, and (for the System AI) a **live-updating compiled-prompt
  preview** the DM can edit and lock. A snapshot timeline shows the arc of change;
  diff two snapshots to see what shifted. The System AI is the flagship instance.
  See [`05-system-ai-persona.md`](./05-system-ai-persona.md) and
  [`06-entity-agents.md`](./06-entity-agents.md).
- **Simulation panel** — pick an actor (or a set, for a world tick), choose a run
  mode (single act / reactive cascade / world tick / scenario), set bounds
  (depth, fan-out, spend cap) and knowledge scope, preview cost, run. Subagent
  proposals flow to the Review Queue as a batch.
  _Mockup: `design/mockup/screen-sim.jsx` (M11)._
- **Session console** — run a live game: a fast capture log (freeform, `@`/`#`
  tagging), one-click **reveal** of an entity/fact to players, **promote** log
  entries into canonical Events (via the review pipeline), and generate session /
  per-crawler **recaps**. See [`08-session-mode.md`](./08-session-mode.md).
- **Sharing controls** — set campaign-wide entity/field visibility, grant or
  revoke private knowledge for specific players/crawlers/NPCs/parties/guilds,
  and manage player↔crawler links.
- **Campaign settings** — members/roles, AI providers + keys, style guide, spend
  caps, import shared library.
- **Archive / Trash Bin** — view all soft-deleted/archived entities (those with
  status `ARCHIVED`), with actions for the DM to inspect provenance and restore
  them back to canon or draft.

### Key interactions

- **Provenance & lock are always visible** on canon: a clear visual language
  distinguishing human-authored, AI-generated-approved, and locked content.
  (e.g. an "AI" badge that disappears once a DM edits/locks, a lock icon on
  protected fields.)
- **Diff-first review:** new entities highlighted; field changes shown from→to;
  accept/edit/reject per field; "approve & lock" affordance; bulk actions per
  run; stale/locked-conflict callouts.
- **Stub-friendly:** creating a thin reference is one action; "flesh out with AI"
  is one more.

### Visual distinction of AI vs human (a core UX requirement)

The user specifically wants to *see at a glance what was generated vs.
locked-in*. Establish a consistent treatment early:
- pending AI content tinted / badged distinctly from canon,
- approved-but-AI-origin content carries a subtle, dismissible provenance marker,
- locked content visibly protected,
- a campaign-wide filter: "show me everything still AI-origin and never edited."

## Crawler Interface (player-facing)

An in-fiction reskin of canon, scoped by the visibility projection
([`02-architecture.md`](./02-architecture.md)). It should evoke the DCC System
UI a crawler "sees." _Mockup: `design/mockup/screen-crawler.jsx` (M7)._

`SHARED_WITH_PLAYERS` and `PLAYER_FACING` are both player-visible. The
difference is presentation: shared content appears as normal known-world canon;
player-facing content is written for direct display in the crawler/System UI
(messages, achievements, item text, sheet fields). Private reveals decide *who*
gets access to otherwise hidden facts.

- **Crawler sheet:** name, species/class, level, the core stats, HP/MP/stamina,
  gold, current floor/location.
- **Inventory & loot boxes:** items, equipped gear, unopened loot boxes (flavor).
- **Achievements & titles:** earned list with System-style descriptions.
- **System messages / notifications:** the DM-published in-fiction feed (rule
  changes, announcements, personal notifications).
- **Known world:** entities/relationships/facts the DM has shared broadly
  (`SHARED_WITH_PLAYERS`) plus private knowledge grants for that player or their
  linked crawler — e.g. floors they've cleared, NPCs they've met, secrets only
  their crawler learned, populated from the reveal/knowledge log
  ([`08-session-mode.md`](./08-session-mode.md)). Secrets and DM-only data never
  appear unless explicitly granted to that player/crawler.
- **Recap feed:** "previously on *Dungeon Crawler World*" — session and
  per-crawler recaps the DM publishes, in the show's voice.
- **Ask (scoped):** the player can ask natural-language questions, answered only
  from their player-visible canon ([`07-search-retrieval.md`](./07-search-retrieval.md)).
- **Suggestions:** a player can propose edits (e.g. bio, notes); these enter the
  review pipeline as `PLAYER_SUGGESTION`, never write canon directly.

### Principles

- **Read-mostly:** players consume; the few writes they make are suggestions.
- **No leakage:** the projection is the only data path; pending/DM-only/secret
  content is never sent to the client. Test this explicitly.
- **Shareable:** a player visits their interface via their account; a DM controls
  exactly what is visible per entity/field and can reveal specific facts to one
  player/crawler without revealing them to the table.

## Cross-cutting UX

- **Search everywhere** (entities, events, relationships).
- **Responsive:** DM console is desktop-first (dense); crawler interface should
  work well on phones (players check it at the table).
- **Keyboard-friendly review** (accept/reject/next) to make batch review fast.
- **Empty states** that guide a new DM: create campaign → import canonical floors
  → generate stubs → review.

## Component/library guidance

- shadcn/ui + Tailwind for primitives.
- A graph lib for the relationship/causality views (e.g. React Flow or a force
  layout) — defer the heavy graph UI to its milestone; start with simple
  list/connection panels.
- Markdown rendering for descriptions; sanitize player-facing markdown.
