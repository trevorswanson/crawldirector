# 01 — Domain Model

This is the conceptual model of the DCC world. It is deliberately
**stack-agnostic** — the concrete database tables live in
[`05-data-schema.md`](./05-data-schema.md). When the two disagree, this document
describes *intent* and the schema describes *implementation*.

## Design strategy: a typed entity-relationship-event graph

DCC's scale and interconnectedness make a pure table-per-noun model brittle —
DMs constantly invent new kinds of things (a new mob, a new talk show, a new
splinter faction), and everything relates to everything. We therefore use a
**hybrid model**:

- A small set of **first-class entity types** that get rich, dedicated fields
  because they are central and well-understood (Crawler, Floor, Faction, etc.).
- A **generic `Entity` core** every first-class type extends, giving every
  modeled noun a shared identity, provenance, lock state, and review lifecycle —
  so the [review pipeline](./03-review-pipeline.md) works uniformly.
- A **typed Relationship graph** for the web of connections.
- An **Event log with causal links** for "what happened and what it caused."
- A **custom-field / extension** escape hatch so DMs (and AI) can add
  attributes without a schema migration.

> **Why this shape:** the signature feature is uniform review + locking +
> provenance across *everything*. That is only sustainable if every noun shares
> a common core. Bespoke fields ride on top of that core, they don't replace it.

## The Entity core

Every modeled noun is an `Entity`. Shared attributes:

- `id`, `campaignId` (scoping)
- `type` (CRAWLER, FLOOR, NEIGHBORHOOD, BOSS, MOB_TYPE, NPC, FACTION, SHOW,
  SPONSOR, ITEM, SKILL, CLASS, SPECIES, ACHIEVEMENT, TITLE, LOCATION,
  ORGANIZATION, DEITY, … extensible)
- `name`, `summary` (short), `description` (long, markdown)
- `status` lifecycle: `DRAFT → PENDING → CANON` (plus `ARCHIVED`, `REJECTED`)
- `provenance` (origin + history; see review pipeline)
- `locked` / per-field locks
- `visibility` (DM_ONLY, SHARED_WITH_PLAYERS, PLAYER_FACING) — drives the
  crawler interface and sharing
- `tags[]`, `customFields` (JSON), `attachments[]`
- timestamps, `createdBy`, `lastReviewedBy`

First-class types add their own structured columns/relations on top.

## First-class entity types

### People & beings

**Crawler** — a participant in the dungeon (PC or NPC). The richest entity.
- Identity: crawler name, real name, crawler ID number, species/race, class,
  sponsor(s), team/party, manager, guide.
- Progression: level, the core **stats** (the published TTRPG's stat set — keep
  configurable; the books use a small set of core stats each rolling up many
  sub-aptitudes), HP/MP/stamina, gold.
- Inventory & kit: items, equipped gear, **loot boxes** (tier + opened state),
  skills, spells.
- Meta-game: **achievements**, **titles**, sponsorships, **fan count /
  popularity**, kill count, notable broadcasts/clips, deaths/respawns.
- Story: status (alive/dead/escaped), current floor & location, bio, secrets
  (DM-only).
- *Player linkage:* a Crawler may be linked to a `Player` user; that player's
  crawler interface renders this entity.

**NPC** — non-crawler beings: guides (Mordecai), admins (Zev), hosts (Odette,
the Maestro), faction leaders, gods/Old Ones, shopkeepers, quest-givers.
Lighter than Crawler but shares the core. Many NPCs double as Faction members or
Show hosts via relationships.

**Species / Class** — catalog entities (30+ species, many bizarre classes in the
TTRPG). Crawlers and NPCs reference them. Hold mechanical notes, flavor, typical
abilities.

### World structure

**Floor** (1–18) — biome/theme, difficulty, descent mechanic, time limit,
special rules, boss, recap/summary, "showrunner gimmick." Floor 9 is special
(Faction Wars).

**Neighborhood / Zone** — subdivisions of a floor (DCC floors are explicitly
divided into neighborhoods/districts). Hold local mobs, NPCs, locations.

**Location** — discrete places: safe rooms, shops, stairwells, landmarks, the
castle Larracos, etc. Belong to a neighborhood/floor.

**Boss / Mini-boss** — floor bosses and lesser bosses. Stats, phases, lore,
rewards, the show angle. (Modeled as a flavored entity, optionally linked to a
Floor.)

**MobType** — reusable monster/enemy templates (not individual instances):
stat block, behavior, floor(s) where they appear, loot tables. Instances of a
mob in an encounter are referenced from Events rather than stored individually
(scale control).

### Factions & politics

**Faction** — sponsor factions, the nine Floor-9 war teams, corporations
(Borant), governments, the Syndicate, the Ascendancy, hunter orgs, clans (Skull
Empire). Fields: type, allegiance, leaders, member crawlers/NPCs, resources,
goals, current standing/score (e.g. Faction Wars army strength).

**Organization** — broader political/corporate bodies that aren't "factions" in
the war sense (the Syndicate itself, regulatory bodies, networks). Often parents
of Factions.

**Sponsor** — an entity (usually an Organization/Faction) sponsoring crawlers or
shows. Sponsorship is a *relationship* with terms, stake, and money flow.

### Media layer

**Show / Broadcast** — talk shows, death-spectacle broadcasts, interview
programs. Host(s), format, audience size, recurring segments, featured crawlers.

**FanBase / Audience** segments — optional; can start as fields on Show/Crawler
(viewer counts, demographics) and graduate to entities if needed.

### Game-system catalog

**Item**, **Skill**, **Spell**, **Achievement**, **Title**, **LootBox tier**,
**Class**, **Species** — reusable catalog entries the crawler interface and
generators draw from. These are the building blocks the player-facing System UI
displays.

**SystemMessage / Edict** — in-fiction System announcements, rule changes,
patches, and notifications. Useful both as flavor the DM publishes to players
and as triggers/causes for Events.

## Relationships (the connective tissue)

A **Relationship** is a typed, directed edge: `(sourceEntity) --[type]-->
(targetEntity)` with attributes and its own provenance + review state (yes,
relationships go through the review pipeline too).

Relationship types (extensible enum), grouped:

- **Affiliation:** `MEMBER_OF`, `LEADS`, `SPONSORS`, `EMPLOYS`, `ALLIED_WITH`,
  `RIVAL_OF`, `AT_WAR_WITH`, `PARENT_ORG_OF`.
- **Social:** `ALLY_OF`, `ENEMY_OF`, `MENTOR_OF`, `MANAGES`, `LOVES`,
  `FAMILY_OF`, `OWES`.
- **Spatial / structural:** `LOCATED_ON` (floor), `PART_OF` (neighborhood/zone),
  `CONTAINS`, `BOSS_OF`, `SPAWNS_ON`.
- **Game:** `HAS_CLASS`, `HAS_SPECIES`, `OWNS_ITEM`, `KNOWS_SKILL`,
  `EARNED_ACHIEVEMENT`, `HOLDS_TITLE`, `APPEARS_ON` (show).
- **Narrative:** `KNOWS_ABOUT`, `BETRAYED`, `KILLED`, `SAVED`.

Edge attributes: `strength`/`disposition` (-100..100), `since`/`until`,
`notes`, `secret` (DM-only), provenance.

> Relationships are bidirectionally queryable. The UI presents an entity's
> "connections" panel and a campaign-wide **relationship graph** view.

## Events & causality (the "why")

An **Event** is something that happened (or is scheduled): a stat boost, a
death, a sponsorship signed, a faction's funding cut, a Floor-9 battle, a show
airing.

Event fields:
- `title`, `description`, `inGameTime` (flexible — floors/days, see below),
  `realWorldTimestamp` (when the DM logged it), `floor`/`location` context.
- **Participants:** typed links to entities (`ACTOR`, `TARGET`, `WITNESS`,
  `LOCATION`, `AFFECTED`).
- **Causality:** `causes` / `causedBy` links to other Events, forming a DAG.
  This is how "Carl's stunt → sponsor stock drop → faction defunded → war shift"
  is represented and traversed.
- **Effects:** structured deltas (e.g. "Faction X strength −10", "Crawler Y
  gained Title Z") that can optionally be *applied* to entity state on approval.
- provenance + review state.

> **Causality view** is a headline feature: given any entity or event, show the
> upstream causes and downstream effects as a navigable chain/graph.

## Time model

DCC time is irregular (per-floor timers, "days since collapse", broadcast
schedules). Model in-game time as a flexible structure:
`{ floor?, dayInFloor?, absoluteDay?, label? }` plus an ordering key, rather than
forcing real calendar dates. DMs can sort the timeline by the ordering key and
annotate with human-readable labels.

## Scale-control tactics

To keep the world large but the database sane:

- **Templates vs. instances:** `MobType` (template) is stored once; individual
  mobs in a fight are described inside an Event, not as 10,000 rows.
- **Lazy population:** entities can exist as thin **stubs** (name + type +
  "referenced by") and be fleshed out later — ideal for AI to scaffold the world
  cheaply, DM to enrich on demand.
- **Custom fields** absorb one-off attributes so the schema stays stable.
- **Soft archive** instead of delete, preserving provenance and causal history.

## Multi-tenancy boundaries

Every entity, relationship, and event is scoped to a **Campaign**. A Campaign
belongs to a DM (owner) and may have co-DMs and players. Nothing crosses
campaign boundaries except optional **shared library templates** (see roadmap
M7) — reusable canonical DCC content (the 18 canonical floors, common mob types)
a DM can import as a starting point.

See [`02-architecture.md`](./02-architecture.md) for how this maps onto auth and
data access, and [`05-data-schema.md`](./05-data-schema.md) for tables.
