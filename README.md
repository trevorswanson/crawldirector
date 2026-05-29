# CrawlDirector

Build the Crawl. Curate the Chaos.

CrawlDirector is a world simulation and canon management platform for the Dungeon Crawler Carl tabletop RPG.

A Dungeon Crawler Carl campaign is larger than a typical fantasy adventure. Every crawler, sponsor, faction, floor, host, audience trend, and world-shaping event exists inside a single interconnected system. Actions have consequences. Consequences create stories. Stories reshape the world.

CrawlDirector helps Game Masters manage that complexity.

Instead of storing a campaign as disconnected notes and documents, CrawlDirector models the crawl as a living graph of entities, relationships, motivations, and events. Crawlers interact with factions. Sponsors influence wars. The System changes the rules. Every decision can ripple across the dungeon.

AI is a first-class collaborator—but never the authority.

Generated content enters a review queue where the DM decides what becomes canon. Every change is tracked. Every fact records its provenance. Trusted content can be locked against future modification.

Think of it as a control room for an interstellar death-game reality show.

## What CrawlDirector Does

### Model a Living World

Track crawlers, factions, floors, bosses, mobs, sponsors, gods, talk shows, corporations, and galactic powers as connected entities inside a queryable relationship graph.

### Protect Canon

AI-generated content, player suggestions, imports, and manual edits all flow through a review pipeline. Nothing becomes canon until approved.

### Simulate Motivated Actors

Give major entities goals, values, personalities, and limited knowledge. Let AI agents role-play them to propose believable actions, conflicts, alliances, and world events.

### Bring the System to Life

Model the System itself as an evolving character. Its personality shifts over time and directly influences generated encounters, loot, announcements, quests, and world events.

### Ask the Campaign

Search canon, trace causal chains, inspect relationships, and answer questions about the world with citations back to source data.

### Run the Show

Capture live sessions, reveal information to players, maintain player-facing crawler interfaces, and generate in-universe recaps and broadcasts.

## Core Philosophy

The DM owns reality.

AI proposes.

The DM decides.

Reality is pending review.

## Status

🚧 **M1 in progress.** M0 foundation is implemented: the app is scaffolded and
runnable with auth, campaigns, Prisma/Postgres, CI, and coverage gates. M1 has
started with the generic Entity core, Crawler satellite, service-layer CRUD, and
a world browser/detail UI. The app now wears the CrawlDirector "broadcast HUD"
design language ([`docs/13-design-language.md`](./docs/13-design-language.md)).
See [`docs/PROGRESS.md`](./docs/PROGRESS.md).

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
| [`docs/07-search-retrieval.md`](./docs/07-search-retrieval.md) | Hybrid search, "Ask the Campaign", and retrieval-augmented AI context |
| [`docs/08-session-mode.md`](./docs/08-session-mode.md) | Live session capture, reveals, and "previously on…" recaps |
| [`docs/09-data-schema.md`](./docs/09-data-schema.md) | Concrete (draft) Prisma schema for everything above |
| [`docs/10-ui-ux.md`](./docs/10-ui-ux.md) | DM console + player crawler interface |
| [`docs/11-roadmap.md`](./docs/11-roadmap.md) | Milestones M0–M12, sequenced and decomposable |
| [`docs/12-working-sessions.md`](./docs/12-working-sessions.md) | How future sessions pick up and extend the work |
| [`docs/13-design-language.md`](./docs/13-design-language.md) | The "broadcast HUD" design system: tokens, fonts, primitives, FX (build all UI from this) |

## Decisions already made

- **Stack:** Next.js (App Router, React, TypeScript) + PostgreSQL + Prisma.
- **AI:** bring-your-own-key, provider-agnostic abstraction (Claude, OpenAI,
  etc.). The pending-review pipeline is provider-independent.
- **Roadmap:** sequenced by this plan, starting with the foundation
  (auth + data model + campaigns), then the review engine.

> This is a fan-made campaign tool. *Dungeon Crawler Carl* is the work of Matt
> Dinniman; the TTRPG is published by Renegade Game Studios. This project is not
> affiliated with or endorsed by either.
