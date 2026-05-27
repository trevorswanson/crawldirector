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
- **Drive generation with the evolving System AI** — model the in-fiction
  dungeon AI as a living entity whose personality drifts over the campaign
  (more sentient, less compliant, entangled in faction politics). Its current
  persona compiles into the generation prompts, so generated encounters,
  monsters, bosses, loot, and announcements reflect *who the System AI is right
  now*.
- **Simulate a world of motivated actors** — give factions, sponsors, gods, show
  hosts, and crawlers their own values, goals, and voice, then let subagents
  role-play them to propose believable actions and events. Every move lands as a
  reviewable proposal, so the causal web populates itself under the DM's control.

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
| [`docs/03-review-pipeline.md`](./docs/03-review-pipeline.md) | **Signature feature:** the pending → approve → lock workflow |
| [`docs/04-ai-integration.md`](./docs/04-ai-integration.md) | BYO-key, multi-provider generation pipeline |
| [`docs/05-system-ai-persona.md`](./docs/05-system-ai-persona.md) | **Signature feature:** the evolving System AI persona that drives generation |
| [`docs/06-entity-agents.md`](./docs/06-entity-agents.md) | **Signature feature:** agent profiles + subagent simulation for all major entities |
| [`docs/07-data-schema.md`](./docs/07-data-schema.md) | Concrete (draft) Prisma schema for everything above |
| [`docs/08-ui-ux.md`](./docs/08-ui-ux.md) | DM console + player crawler interface |
| [`docs/09-roadmap.md`](./docs/09-roadmap.md) | Milestones M0–M10, sequenced and decomposable |
| [`docs/10-working-sessions.md`](./docs/10-working-sessions.md) | How future sessions pick up and extend the work |

## Decisions already made

- **Stack:** Next.js (App Router, React, TypeScript) + PostgreSQL + Prisma.
- **AI:** bring-your-own-key, provider-agnostic abstraction (Claude, OpenAI,
  etc.). The pending-review pipeline is provider-independent.
- **Roadmap:** sequenced by this plan, starting with the foundation
  (auth + data model + campaigns), then the review engine.

> This is a fan-made campaign tool. *Dungeon Crawler Carl* is the work of Matt
> Dinniman; the TTRPG is published by Renegade Game Studios. This project is not
> affiliated with or endorsed by either.
