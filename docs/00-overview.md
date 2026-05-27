# 00 — Overview & Vision

## The problem

A *Dungeon Crawler Carl* campaign is not scoped like a typical fantasy game. The
source material establishes a world that is enormous along several independent
axes at once:

- **Population scale** — the System seizes Earth and kills most of the surface
  population; billions become potential crawlers, viewers, or casualties.
- **Spatial scale** — an 18-floor World Dungeon, each floor a distinct biome
  with neighborhoods, zones, safe rooms, shops, stairwells, dozens of mob types,
  mini-bosses, and a floor boss. Floor 9 (Faction Wars) alone is a 30-day war
  over a castle with nine armies.
- **Political scale** — the Borant Syndicate, rival corporations and
  governments, sponsor factions, the broader galactic Syndicate, the
  Ascendancy, hunters, and shifting interstellar alliances.
- **Media scale** — *Dungeon Crawler World* is a broadcast game show: talk
  shows, hosts (Odette, the Maestro), sponsorships, advertisements, fan bases,
  and viewer economics that directly affect in-dungeon outcomes.
- **Causal scale** — all of the above is *interconnected*. A crawler's stunt on
  Floor 3 changes their sponsor's stock, which shifts a faction's funding, which
  changes the Floor 9 war. DMs need to track not just entities but **why things
  happened and what they caused**.

No DM can hand-author all of this. They will inevitably use AI to populate the
world. But AI output is uneven, and a DM's campaign is a curated creative work —
they cannot let generated text silently become canon.

## The vision

A multi-tenant web app where a DM models their DCC campaign as a **living graph
of entities, relationships, and events**, and where **AI is a first-class but
always-subordinate contributor**. Every AI suggestion is a *proposal* the DM
reviews before it becomes canon. Human-authored or human-approved data can be
*locked* so it is protected from future automated edits.

Players get scoped, in-fiction **crawler interfaces** — the System UI their
character would "see" — plus whatever extra information the DM chooses to share.

## Core principles

1. **The DM owns canon.** Nothing an AI generates is canonical until a DM
   approves it. This is the product's defining constraint, not a feature flag.
   See [`03-review-pipeline.md`](./03-review-pipeline.md).
   - **The System AI is a character, not a setting.** The in-fiction dungeon AI
     is modeled as an evolving entity whose persona drifts over the campaign and
     **drives the generation prompts**. This is the second signature feature; see
     [`05-system-ai-persona.md`](./05-system-ai-persona.md).
   - **Major entities are motivated agents.** The persona machinery generalizes:
     factions, sponsors, gods, show hosts, and crawlers carry values + goals, and
     subagents can role-play them to **propose believable actions and events** —
     all as reviewable proposals. See [`06-entity-agents.md`](./06-entity-agents.md).
2. **Provenance is permanent.** Every piece of data records where it came from
   (DM-authored, AI-generated + which model/prompt, player-suggested, imported)
   and its review history. Provenance is never discarded on approval.
3. **Lock what you trust.** Reviewed or hand-written fields/entities can be
   locked. Generators must respect locks and surface them as "do not touch."
4. **Model relationships and causality as data, not prose.** The web of
   cause-and-effect is a queryable graph, not notes buried in a description
   field.
5. **Scale through structure, not through bigger text blobs.** Prefer many
   small typed entities and edges over a few giant freeform documents.
6. **Players see a curated slice.** Player access is always a deliberate,
   DM-controlled projection of canon — never the raw editing surface.
7. **Generic over bespoke.** The review pipeline, provenance, and locking work
   uniformly across *all* entity types. Adding a new entity type should not
   require re-implementing review.

## Who uses it

- **Game Master (DM / owner):** creates campaigns, models the world, runs the AI
  generators, reviews and approves/rejects proposals, controls what players see.
- **Co-DM (optional):** a collaborator with edit/review rights on a campaign.
- **Player:** belongs to a campaign, is linked to one or more crawlers, and gets
  a read-mostly crawler interface plus DM-shared information. May *suggest*
  changes (which enter the same pending pipeline) but cannot approve them.

## Non-goals (for now)

- Not a virtual tabletop (no maps/tokens/dice-in-browser/initiative tracker in
  the early milestones — may come later).
- Not a rules engine that enforces the published TTRPG mechanics. It tracks
  state; it does not adjudicate combat. (A rules-assist layer is a possible
  later milestone.)
- Not a public wiki. Sharing is per-campaign and DM-gated.
- Not tied to one AI vendor. See [`04-ai-integration.md`](./04-ai-integration.md).

## Glossary

| Term | Meaning |
| --- | --- |
| **Canon** | Approved, authoritative campaign data. |
| **Proposal / Change Set** | A bundle of create/update/delete/relate operations awaiting DM review. |
| **Pending** | A proposal's state before review. |
| **Lock** | A flag on an entity or field protecting it from automated edits. |
| **Provenance** | The recorded origin + history of a piece of data. |
| **Crawler interface** | The in-fiction, player-facing System UI for a crawler. |
| **Entity** | Any modeled noun in the world (crawler, floor, faction, show, item…). |
| **Relationship** | A typed, directed, any-to-any edge between two entities. |
| **Party / Guild** | Crawler-formed collectives; parties fan out into guilds (membership via edges). |
| **Event** | A timestamped occurrence with participants and causal links. |
| **The System / System AI** | The in-fiction AI running the dungeon — modeled as an evolving `SYSTEM_AI` entity (distinct from *our* AI generators). |
| **Persona snapshot** | A point-in-time capture of the System AI's traits, agendas, and voice along campaign time. |
| **Persona compiler** | Turns the active persona snapshot into a prompt fragment injected into generation. |
| **Agent profile** | A generalized persona (values, goals, voice) on any major entity. |
| **Agent run / world tick** | A subagent role-playing an entity (or many) to propose in-character actions and events. |
| **Fog of war** | Limiting an agent's context to what its entity plausibly knows, for believable behavior. |

> Naming note: the in-fiction "System AI" is a DCC world concept and a modeled
> entity (see [`05-system-ai-persona.md`](./05-system-ai-persona.md)). To avoid
> confusion, this project always calls our generation layer the **AI generators**
> or **the review pipeline**, never "the System." The **persona** that flavors
> those generators is the in-fiction System AI's, compiled into the prompt.
