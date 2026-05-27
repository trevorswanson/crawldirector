# 06 — UI / UX

Two distinct surfaces share one app and one data layer but feel different:

1. **DM Console** — a dense worldbuilding + review workbench.
2. **Crawler Interface** — an in-fiction, read-mostly System UI for players.

## DM Console

### Information architecture

- **Campaign switcher** (a DM may own/co-DM several).
- **Review Queue** — the home base. Pending Change Sets grouped by source and
  run, with diff views and batch actions. This should be the most polished
  screen; it is where the product's promise is felt. (See pipeline doc.)
- **World browser** — navigate entities by type, floor/area, faction, tag, or
  full-text search. Quick-create stubs.
- **Entity detail** — structured fields + markdown description, the
  **connections panel** (in/out relationships), a **timeline** of events the
  entity participated in, provenance ("authored by you" vs "AI-generated, model
  X, approved by you on …"), and lock controls.
- **Relationship graph** — interactive node-link view of the campaign (filter by
  type/faction/floor). Central to feeling the "web."
- **Causality view** — for any event/entity, the upstream-cause /
  downstream-effect chain as a navigable DAG.
- **Timeline** — chronological events with in-game-time ordering and filters.
- **AI generation panel** — pick a generator, set params/scope, preview cost,
  run; results flow to the Review Queue.
- **Sharing controls** — set entity/field visibility; manage players and
  player↔crawler links.
- **Campaign settings** — members/roles, AI providers + keys, style guide, spend
  caps, import shared library.

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
UI a crawler "sees."

- **Crawler sheet:** name, species/class, level, the core stats, HP/MP/stamina,
  gold, current floor/location.
- **Inventory & loot boxes:** items, equipped gear, unopened loot boxes (flavor).
- **Achievements & titles:** earned list with System-style descriptions.
- **System messages / notifications:** the DM-published in-fiction feed (rule
  changes, announcements, personal notifications).
- **Known world:** only entities/relationships the DM has shared
  (`SHARED_WITH_PLAYERS`/`PLAYER_FACING`) — e.g. floors they've cleared, NPCs
  they've met, factions they know of. Secrets and DM-only data never appear.
- **Suggestions:** a player can propose edits (e.g. bio, notes); these enter the
  review pipeline as `PLAYER_SUGGESTION`, never write canon directly.

### Principles

- **Read-mostly:** players consume; the few writes they make are suggestions.
- **No leakage:** the projection is the only data path; pending/DM-only/secret
  content is never sent to the client. Test this explicitly.
- **Shareable:** a player visits their interface via their account; a DM controls
  exactly what is visible per entity/field.

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
