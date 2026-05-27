# DCC Campaign Builder

A campaign-management and worldbuilding tool for the **Dungeon Crawler Carl
(DCC) tabletop RPG** (Renegade Game Studios, 2026).

DCC's world is unusually large for a TTRPG: an 18-floor World Dungeon broadcast
as an alien game show, billions of displaced humans, countless mob types and
bosses, nine warring sponsor factions, interstellar Syndicate politics, talk
shows and hunters, and a dense web of cause-and-effect between all of it. A DM
running a DCC campaign needs to track far more state than a typical D&D table.

This tool helps Game Masters:

- **Model the whole world** — crawlers, floors, neighborhoods, bosses, mobs,
  factions, shows, sponsors, NPCs, and the typed relationships and causal links
  between them.
- **Lean on AI without losing control** — almost any AI-generated update lands
  in a **pending** state. The DM reviews it, edits it, and *approves* it before
  it becomes canon. Reviewed or hand-written data can be **locked** so AI can't
  silently overwrite it.
- **Run multiple campaigns** across multiple DMs, and **share player-facing
  "crawler interfaces"** with players (the in-fiction System UI each crawler
  sees).

## Status

🚧 **Planning phase.** No application code exists yet. This repository currently
contains the master plan that future build sessions will decompose and
implement.

## Where to start

All planning lives in [`docs/`](./docs). Read in this order:

| Doc | What it covers |
| --- | --- |
| [`docs/00-overview.md`](./docs/00-overview.md) | Vision, goals, core principles, glossary |
| [`docs/01-domain-model.md`](./docs/01-domain-model.md) | The DCC world as entities, relationships, and events |
| [`docs/02-architecture.md`](./docs/02-architecture.md) | Tech stack, multi-tenancy, auth, system shape |
| [`docs/03-review-pipeline.md`](./docs/03-review-pipeline.md) | The signature pending → approve → lock workflow |
| [`docs/04-ai-integration.md`](./docs/04-ai-integration.md) | BYO-key, multi-provider generation pipeline |
| [`docs/05-data-schema.md`](./docs/05-data-schema.md) | Concrete (draft) Prisma schema |
| [`docs/06-ui-ux.md`](./docs/06-ui-ux.md) | DM console + player crawler interface |
| [`docs/07-roadmap.md`](./docs/07-roadmap.md) | Milestones M0–M8, sequenced and decomposable |
| [`docs/08-working-sessions.md`](./docs/08-working-sessions.md) | How future sessions pick up and extend the work |

## Decisions already made

- **Stack:** Next.js (App Router, React, TypeScript) + PostgreSQL + Prisma.
- **AI:** bring-your-own-key, provider-agnostic abstraction (Claude, OpenAI,
  etc.). The pending-review pipeline is provider-independent.
- **Roadmap:** sequenced by this plan, starting with the foundation
  (auth + data model + campaigns), then the review engine.

> This is a fan-made campaign tool. *Dungeon Crawler Carl* is the work of Matt
> Dinniman; the TTRPG is published by Renegade Game Studios. This project is not
> affiliated with or endorsed by either.
