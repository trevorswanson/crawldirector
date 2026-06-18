# 01 — Domain Model

This is the conceptual model of the DCC world. It is deliberately
**stack-agnostic** — the concrete database tables live in
[`09-data-schema.md`](./09-data-schema.md). When the two disagree, this document
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
- `type` (CRAWLER, NPC, PARTY, GUILD, FLOOR, NEIGHBORHOOD, BOSS, MOB_TYPE,
  FACTION, ORGANIZATION, SPONSOR, SHOW, SYSTEM_AI, ITEM, SKILL, CLASS, SPECIES,
  ACHIEVEMENT, TITLE, LOCATION, DEITY, BOX, … extensible)
- `name`, `summary` (short), `description` (long, markdown)
- `status` lifecycle: `DRAFT → PENDING → CANON` (plus `ARCHIVED`, `REJECTED`)
- `provenance` (origin + history; see review pipeline)
- `locked` / per-field locks
- `visibility` — campaign-wide default visibility:
  - `DM_ONLY`: visible only to DMs unless a private knowledge grant reveals a
    specific fact/field/entity to someone else.
  - `PLAYER_VISIBLE`: visible to players as ordinary campaign canon. Both DMs and
    players can view entities as standard lore wiki pages; the crawler interface
    (player-facing console) displays a parallel in-fiction system console UI
    for these entities.
- `imageUrl`: optional main portrait, map, or illustration URL.
- `tags[]`, `customFields` (JSON), `attachments[]` (additional images or files).
- timestamps, `createdBy`, `lastReviewedBy`

First-class types add their own structured fields on top — held in the `data`
JSON blob and defined once per type in an entity-kind descriptor
([`adr/0009-entity-kind-registry.md`](./adr/0009-entity-kind-registry.md);
versioned/migratable per [`adr/0011-entity-data-versioning-and-satellites.md`](./adr/0011-entity-data-versioning-and-satellites.md)),
with a `Crawler`-style satellite table for the heaviest-query types.

## First-class entity types

### People & beings

**Crawler** — a participant in the dungeon (PC or NPC). The richest entity.
- Identity: crawler name, real name, crawler ID number, species/race, class,
  sponsor(s), team/party, manager, guide.
- Progression: level, the core **stats** (the published TTRPG's stat set — keep
  configurable; the books use a small set of core stats each rolling up many
  sub-aptitudes), HP/MP/stamina, gold.
- Inventory & kit: items, equipped gear, **loot boxes** (represented by the
  first-class `BOX` entity type containing items), skills, spells.
- Meta-game: **achievements** (which can reward boxes), **titles**, sponsorships, audience ratings
  (`viewCount`, `followerCount`, `favoriteCount`), kill count, notable
  broadcasts/clips, deaths/respawns.
  - **Views:** each approximately 8-second feed watch counts as one view.
  - **Followers:** viewers who bookmarked the crawler's ID and can tune in when
    they want, unless the crawler is in the bathroom.
  - **Favorites:** limited viewer slots that provide live crawler stat,
    condition, and combat-status updates.
- Story: status (alive/dead/escaped), current floor & location, bio, secrets
  (DM-only).
- *Player linkage:* a Crawler may be linked to a `Player` user; that player's
  crawler interface renders this entity.

**NPC** — non-crawler beings: guides/managers (Mordecai), admins (Zev), hosts
(Odette, the Maestro), production crew, faction leaders, gods/Old Ones,
shopkeepers, quest-givers. Lighter than Crawler but shares the core. Many NPCs
double as Faction members or Show hosts via relationships.
- **Persistence is inherent.** Entities are scoped to the *campaign*, not a
  floor, so a recurring NPC persists across the whole show by default. Their
  recurring appearances are modeled as `Event` participation, and their
  whereabouts over time are read from that event log rather than from a single
  mutable location edge. (Crawler position specifically is the
  `Crawler.currentFloor` field — the single source of truth per
  [`adr/0008-floor-model-unification-and-time-inference.md`](./adr/0008-floor-model-unification-and-time-inference.md),
  which retired the crawler→floor `LOCATED_ON` edge; `LOCATED_ON` / `PART_OF`
  remain for placing entities within the neighborhood/zone/location structure.)
  Nothing is lost when the party descends a floor.
- **Role facet.** An NPC carries a `role`/`category` (e.g. `GUIDE`, `MANAGER`,
  `ADMIN`, `HOST`, `PRODUCTION_CREW`, `ELITE`, `FACTION_LEADER`, `SHOPKEEPER`,
  `DEITY`, `QUEST_GIVER`) stored in `data` so the persistent cast is queryable —
  "show me all production elites" or "all active guides/managers." Roles are
  not mutually exclusive (an NPC can be both a manager and a production figure).
- **Production & elites.** The people running the show in-fiction — producers,
  crew, admins, and the powerful "elite" beings attached to a production — are
  NPCs tied to the relevant Organization/Show/Faction via `EMPLOYS` / `MEMBER_OF`
  / `PRODUCES` edges. They are tracked exactly like any other persistent NPC.
- Powerful NPCs (faction leaders, gods, hosts, key production figures) are
  **actor entities** and can carry an [agent profile](./06-entity-agents.md).

**Species / Class** — catalog entities (30+ species, many bizarre classes in the
TTRPG). Crawlers and NPCs reference them. Hold mechanical notes, flavor, typical
abilities.

### Groups & collectives

Crawlers organize into ever-larger groups as the show progresses. These are
modeled as entities, with membership expressed through the relationship graph —
so the hierarchy is just typed edges, not a rigid table.

**Party** (`PARTY`) — a small group of crawlers adventuring together (the
earliest form of organization). Fields: name, formation/disband status, notes.
Membership: `Crawler --MEMBER_OF--> Party`, with an optional
`Crawler --LEADS--> Party`. Membership edges carry optional crawl-day
`sinceDay` / `untilDay` bounds, so the history of who was in a party when is
preserved.

**Guild** (`GUILD`) — a larger crawler-formed organization that **multiple
parties fan out into**. Membership can be expressed two ways (both supported):
`Party --PART_OF--> Guild` (parties as the unit) and/or
`Crawler --MEMBER_OF--> Guild` (individuals directly). A guild can have
sub-structure, leadership (`LEADS`), alliances, and rivalries with other guilds
or factions via ordinary edges.

> **Party vs. Guild vs. Faction.** A **Party** is a small crawler band; a
> **Guild** is a larger crawler-formed collective of parties/members; a
> **Faction** (see below) is a sponsor/political/war team (e.g. the nine Floor-9
> armies) — not necessarily crawler-formed. All three are entities and relate to
> each other freely (a guild may be conscripted into a faction; a party may
> belong to a guild that is allied with a faction).

Because Party and Guild are actor entities, they can also carry an
[agent profile](./06-entity-agents.md) — a guild has goals, rivalries, and a
collective "personality" a subagent can role-play.

### World structure

**Floor** (1–18) — biome/theme, difficulty, descent mechanic, time limit,
special rules, boss, recap/summary, "showrunner gimmick." Floor 9 is special
(Faction Wars). A FLOOR entity carries its `data.floorNumber` (matching event
`orderKey`) and `data.theme`, so the timeline can band events under named floor
headers; the campaign's `currentFloorId` points at the FLOOR entity the crawl is
currently on (ADR 0005).

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

### The System AI

**SystemAI** (`SYSTEM_AI`) — the in-fiction AI that runs the dungeon: builds
encounters, spawns mobs/bosses, distributes loot. A first-class entity (usually
one active per campaign) whose **evolving persona drives the generation prompts**.
Its state lives in an ordered series of **persona snapshots** (traits/"dials",
overt + secret agendas, voice guide, compiled prompt) along campaign time; its
political entanglement is expressed as dispositioned relationship edges to
factions/organizations/crawlers. This is a signature feature with its own design
doc — see [`05-system-ai-persona.md`](./05-system-ai-persona.md). The System AI
is the flagship instance of a **general agent-profile capability** (values,
goals, voice) that applies to any motivated entity — factions, sponsors, gods,
show hosts, crawlers — and powers subagent simulation of their actions; see
[`06-entity-agents.md`](./06-entity-agents.md).

### Agents (motivated actor entities)

Any entity that *acts* can carry an **agent profile** (a generalized persona
snapshot): values, goals (overt + secret), dispositions, resources, constraints,
and voice. Profile-bearing types include Faction, Sponsor, Organization, Deity,
Show host (NPC), Crawler (NPC), and the System AI. Profiles are versioned,
reviewable, and lockable like any canon, and they enable **subagent simulation**
— role-playing the entity to propose in-character actions/events that flow
through the review pipeline. Full design in
[`06-entity-agents.md`](./06-entity-agents.md).

### Media layer

**Show / Broadcast** — talk shows, death-spectacle broadcasts, interview
programs. Host(s), format, audience size, recurring segments, featured crawlers.

**FanBase / Audience** segments — optional; can start as fields on Show/Crawler
(viewer counts, demographics) and graduate to entities if needed.

### Game-system catalog

**Item**, **Skill**, **Spell**, **Achievement**, **Title**, **Box**,
**Class**, **Species** — reusable catalog entries the crawler interface and
generators draw from (with achievements granting boxes, and boxes containing items).
These are the building blocks the player-facing System UI displays.

**SystemMessage / Edict** — in-fiction System announcements, rule changes,
patches, and notifications. Useful both as flavor the DM publishes to players
and as triggers/causes for Events.

## Relationships (the connective tissue)

A **Relationship** is a typed, directed edge: `(sourceEntity) --[type]-->
(targetEntity)` with attributes and its own provenance + review state (yes,
relationships go through the review pipeline too).

**Any-to-any by design.** Both endpoints reference the generic `Entity` core, so
*any* entity can relate to *any* other regardless of type — this is a property
graph, not a set of fixed per-type foreign keys. The `RelationshipType` is a
semantic label, not a structural constraint; the schema never forbids an edge by
type, which keeps the model open to the unexpected connections DCC throws up (a
guild `RIVAL_OF` a god, a sponsor `MANIPULATES` the System AI, an NPC `MANAGES` a
party). Type-appropriateness is handled softly in the UI (sensible defaults and
warnings), never as a hard schema rule. Crawler↔party↔guild membership, NPC
affiliations, and faction politics are all just edges in this one graph.

Relationship types (extensible enum), grouped:

- **Affiliation:** `MEMBER_OF`, `LEADS`, `SPONSORS`, `EMPLOYS`, `ALLIED_WITH`,
  `RIVAL_OF`, `AT_WAR_WITH`, `PARENT_ORG_OF`.
- **Power / manipulation (esp. the System AI):** `USED_BY`, `MANIPULATES`,
  `CONTROLS`, `DEFIES` — for "the System AI is being used by corporations" and
  its own scheming.
- **Social:** `ALLY_OF`, `ENEMY_OF`, `MENTOR_OF`, `MANAGES`, `LOVES`,
  `FAMILY_OF`, `OWES`.
- **Spatial / structural:** `LOCATED_ON` (floor), `PART_OF` (neighborhood/zone),
  `CONTAINS`, `BOSS_OF`, `SPAWNS_ON`.
- **Game:** `HAS_CLASS`, `HAS_SPECIES`, `OWNS_ITEM`, `KNOWS_SKILL`,
  `EARNED_ACHIEVEMENT`, `HOLDS_TITLE`, `APPEARS_ON` (show), `GRANTS_BOX`,
  `CONTAINS`.
- **Narrative:** `KNOWS_ABOUT`, `BETRAYED`, `KILLED`, `SAVED`.

Edge attributes: `strength`/`disposition` (-100..100), `since`/`until`,
`notes`, `secret` (DM-only), provenance.

> Relationships are bidirectionally queryable. The UI presents an entity's
> "connections" panel and a campaign-wide **relationship graph** view.

The connections-panel create UX (target-first entity search, applicability-ranked
type list, and directional inverse labels — e.g. `OWNS_ITEM` reads as `OWNED_BY`
from the target's page) is specified in
[`adr/0003-relationship-create-ux-and-inverse-labels.md`](./adr/0003-relationship-create-ux-and-inverse-labels.md).

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
- **Effects:** structured changes (e.g. "Crawler Y gold +50", "Crawler Y current
  floor = 1", "Faction X strength −10", "Crawler Y gained Title Z", "Crawler Y
  granted Achievement A" via structured `GRANT_ACHIEVEMENT`, or a
  **`PERSONA_SHIFT`** that nudges the System AI's dials — see
  [`05-system-ai-persona.md`](./05-system-ai-persona.md)) that can be applied to
  entity state through the review pipeline. Effect declarations are distinct
  from applied state changes: an event can carry **unapplied** effect rows, but
  mutating the target entity is represented as an `APPLY_EVENT_EFFECTS`
  operation. DM timeline **Apply** creates an auto-approved `DM` change set and
  applies immediately; AI/player/import suggestions can still land as Review
  Queue `PENDING` proposals until the DM approves, edits, rejects, or supersedes
  them.
- provenance + review state.

When an effect is approved and applied, the event should link the target entity
as an `AFFECTED` participant so the event appears on that entity's timeline even
if the entity did not act in or witness the original scene.

> **Causality view** is a headline feature: given any entity or event, show the
> upstream causes and downstream effects as a navigable chain/graph.

## Time model

DCC time is irregular (per-floor timers, "days since collapse", broadcast
schedules). Model in-game time as a flexible structure rather than forcing real
calendar dates, and keep the sort key derived (the DM never types it).

The model separates three concerns — **order** (mechanical sort key, never
user-facing), **anchor** (a structured `timeRef`: a `basis` of `COLLAPSE` /
`FLOOR_START` / `FLOOR_COLLAPSE` / `EVENT` / `ABSOLUTE_DAY` / `UNSCHEDULED`, plus
an optional `offset`, `unit`, and `anchorEventId`), and **label** (narrative
phrasing, generated from the anchor with an optional human override). Floor is the
macro-clock; an intra-floor `rank` (fractional index) gives real within-floor
ordering — **derived** from a resolved **absolute day** when one is known, else
from a concrete floor-relative offset, else set by drag-to-reorder when the time
is unscheduled — and the causality DAG provides a coherence check. The typed
`timeRef` + generated phrasing + derived rank shipped in ADR 0004 slice 2
(`src/lib/time-ref.ts`); floor day-anchors (`data.startDay` / `data.collapseDay`)
plus a recursive `resolveAbsoluteDay` resolver let an `EVENT`-anchored time sort
by its resolved day even without a causal link
([`adr/0008-floor-model-unification-and-time-inference.md`](./adr/0008-floor-model-unification-and-time-inference.md),
which amends ADR 0004). Cross-floor wall-clock reconciliation stays deferred. See
[`adr/0004-event-time-model-and-ordering.md`](./adr/0004-event-time-model-and-ordering.md)
for the full decision and migration plan.

## Scale-control tactics

To keep the world large but the database sane:

- **Templates vs. instances:** `MobType` (template) is stored once; individual
  mobs in a fight are described inside an Event, not as 10,000 rows.
- **Lazy population:** entities can exist as thin **stubs** (name + type +
  "referenced by") and be fleshed out later — ideal for AI to scaffold the world
  cheaply, DM to enrich on demand.
- **Per-type fields without per-type tables.** A type's bespoke structured fields
  live in `Entity.data` (JSON), defined once in a per-type **entity-kind
  descriptor** ([`adr/0009-entity-kind-registry.md`](./adr/0009-entity-kind-registry.md))
  from which validation, the form, the display, and the reviewable/lockable set
  all derive. Those `data` shapes are **versioned and migratable** — each kind
  carries a `schemaVersion`, every write stamps a reserved `data._v`, and pure
  per-kind migrations upgrade old rows on read and via a batch job, so a type can
  gain/rename/retire fields without silent data loss
  ([`adr/0011-entity-data-versioning-and-satellites.md`](./adr/0011-entity-data-versioning-and-satellites.md)).
- **Custom fields** (`customFields`) absorb one-off, DM-owned ad-hoc attributes —
  distinct from `data`: `data` is registry-defined, versioned, reviewable per-type
  canon; `customFields` is free-form and unversioned. Both keep the schema stable.
- **Promote to a satellite when a field gets hot.** A `data.*` field that must be
  filtered / sorted / aggregated at scale graduates to an indexed 1:1 **satellite
  table** (the `Crawler` precedent; `Faction` and `Floor` next, via the same
  migration machinery) while review / lock / provenance stay uniform on `Entity`
  (ADR 0011).
- **Soft archive** instead of delete, preserving provenance and causal history.

## Multi-tenancy boundaries

Every entity, relationship, and event is scoped to a **Campaign**. A Campaign
belongs to a DM (owner) and may have co-DMs and players. Nothing crosses
campaign boundaries except optional **shared library templates** (see roadmap
M10) — reusable canonical DCC content (the 18 canonical floors, common mob types)
a DM can import as a starting point.

See [`02-architecture.md`](./02-architecture.md) for how this maps onto auth and
data access, and [`09-data-schema.md`](./09-data-schema.md) for tables.
