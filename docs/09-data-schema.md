# 09 — Data Schema (draft Prisma)

> **Draft, not final.** This sketches the Prisma schema implied by the domain
> model, architecture, and review pipeline. The first build sessions will refine
> field names, indexes, and split it across migrations. Treat conflicts with
> `01-domain-model.md` as "domain doc wins on intent, this doc wins on shape."

## Modeling choices

- **Entity supertype via single-table + JSON + optional satellite tables.** The
  generic `Entity` table holds shared columns and a `data` JSON blob for
  type-specific structured fields. First-class types that need heavy querying
  (notably `Crawler`) get a **satellite table** with a 1:1 link for indexed
  columns; everything else lives in `Entity.data` + `customFields`. This keeps
  the review pipeline uniform (it operates on `Entity`) while allowing rich
  queries where they matter.
- **Relationships and Events are their own tables**, both reviewable. The
  `Relationship` table is **any-to-any**: `sourceId`/`targetId` both FK to
  `Entity`, so any type can link to any type (crawler↔party↔guild membership, NPC
  affiliations, faction politics are all rows here). Type-appropriateness is a UI
  concern, not a DB constraint.
- **Review pipeline tables** (`ChangeSet`, `ChangeOperation`, `Provenance`,
  `Lock`, `AuditLog`) are central and referenced by everything mutable.

> **Implementation note (M2 → M3):** the committed schema includes the identity/
> tenancy foundation, `Entity`/`Crawler`, the review-pipeline tables, M3
> `Relationship`, `Event`/`EventParticipant`, `EventCausality`, and the v1
> `Event.effects` JSON field. Direct DM/co-DM writes still feel instant in the
> UI, but the service layer records them as auto-approved `DM` change sets with
> provenance and audit rows. `CREATE_RELATIONSHIP` / `DELETE_RELATIONSHIP`,
> `CREATE_EVENT` / `UPDATE_EVENT`, `CREATE_EVENT_CAUSALITY` /
> `DELETE_EVENT_CAUSALITY`, and `APPLY_EVENT_EFFECTS` now flow through the
> pipeline. DM-applied event effects use an auto-approved `DM` change set before
> mutating target entities; AI/player/import effect proposals can still remain
> pending in the Review Queue. Pending relationship proposals shipped in M3 slice
> 11, and event proposals use the same review dispatch path, so
> relationships/events remain reviewable when they are proposed rather than direct
> DM edits.

> **Implementation note (M6 slice 1):** `PersonaSnapshot` is now committed
> schema, not just a sketch. It attaches to any `Entity`, stores the cached
> `compiledPrompt`, and is written only through `CREATE_PERSONA_SNAPSHOT` /
> `UPDATE_PERSONA_SNAPSHOT` review operations. `Provenance.personaSnapshotId`
> has a real FK/index so prompt fragments and persona fields retain field-level
> attribution.

## Sketch

```prisma
// ───────────── Identity & tenancy ─────────────
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  passwordHash  String?              // or rely on OAuth
  memberships   Membership[]
  createdAt     DateTime @default(now())
}

model Campaign {
  id             String   @id @default(cuid())
  name           String
  summary        String?
  styleGuide     String?               // tone/canon constraints for AI
  // The floor the crawl is currently on — FK to the DM-chosen FLOOR entity.
  // Drives the timeline's ON-AIR / current-floor styling (ADR 0005). The floor
  // *number* is read from that entity's data.floorNumber. onDelete: SetNull.
  currentFloorId String?
  ownerId        String
  members        Membership[]
  entities       Entity[]
  // ...other relations
  createdAt      DateTime @default(now())
}

enum Role { OWNER CO_DM PLAYER }

model Membership {
  id          String   @id @default(cuid())
  userId      String
  campaignId  String
  role        Role
  user        User     @relation(fields: [userId], references: [id])
  campaign    Campaign @relation(fields: [campaignId], references: [id])
  // M7: the CRAWLER entity this player controls, set by the DM. Optional 1:1
  // (a player controls one crawler); SetNull so archiving the entity clears the
  // link. Only meaningful for PLAYER memberships. The link is also the read
  // grant for the player's own crawler sheet (getMyCrawlerSheet).
  crawlerEntityId String?
  crawlerEntity   Entity? @relation("PlayerCrawler", fields: [crawlerEntityId], references: [id], onDelete: SetNull)
  @@unique([userId, campaignId])
  @@index([campaignId])
  @@index([crawlerEntityId])
}

// ───────────── Entity core ─────────────
enum EntityType {
  CRAWLER NPC SPECIES CLASS
  PARTY GUILD                       // crawler-formed collectives (party → guild)
  FLOOR NEIGHBORHOOD LOCATION BOSS MOB_TYPE
  FACTION ORGANIZATION SPONSOR
  SHOW
  SYSTEM_AI
  ITEM SKILL SPELL ACHIEVEMENT TITLE SYSTEM_MESSAGE DEITY BOX
  // extensible
}

enum CanonStatus { DRAFT PENDING CANON REJECTED ARCHIVED }
// Visibility is a campaign-wide default:
// - DM_ONLY: not broadly visible to players. Private KnowledgeGrant rows may
//   reveal exact facts/fields/entities to selected recipients.
// - PLAYER_VISIBLE: visible to players as ordinary campaign canon.
enum Visibility  { DM_ONLY PLAYER_VISIBLE }

model Entity {
  id           String      @id @default(cuid())
  campaignId   String
  type         EntityType
  name         String
  summary      String?
  description  String?     // markdown
  status       CanonStatus @default(PENDING)
  visibility   Visibility  @default(DM_ONLY)
  imageUrl     String?
  data         Json        @default("{}")   // type-specific structured fields,
                                            //   defined per type by the entity-kind
                                            //   registry (ADR 0009); carries a
                                            //   reserved `_v` schema-version stamp
                                            //   for migration (ADR 0011)
  customFields Json        @default("{}")   // DM/AI ad-hoc fields (free-form,
                                            //   unversioned — distinct from `data`)
  tags         String[]
  version      Int         @default(1)
  locked       Boolean     @default(false)
  lockedFields String[]    @default([])
  isStub       Boolean     @default(false)
  agentEnabled Boolean     @default(false)   // participates in agent simulation (doc 06)

  campaign     Campaign    @relation(fields: [campaignId], references: [id])
  crawler      Crawler?                       // satellite (if type == CRAWLER)
  playerOwners Membership[] @relation("PlayerCrawlers")
  outEdges     Relationship[] @relation("SourceEntity")
  inEdges      Relationship[] @relation("TargetEntity")
  personas     PersonaSnapshot[]
  provenance   Provenance[]

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([campaignId, type])
  @@index([campaignId, status])
}

// Satellite for the heaviest type. Other types may get satellites later.
model Crawler {
  id            String  @id            // == Entity.id
  entity        Entity  @relation(fields: [id], references: [id])
  realName      String?
  crawlerNo     String?
  level         Int     @default(1)
  stats         Json    @default("{}") // core stat set (configurable per ruleset)
  hp            Int?
  mp            Int?
  gold          Int     @default(0)
  viewCount     BigInt  @default(0)
  followerCount BigInt  @default(0)
  favoriteCount BigInt  @default(0)
  killCount     Int     @default(0)
  isAlive       Boolean @default(true)
  currentFloor  Int?
  // class/species/items/skills/achievements modeled as Relationships
}

// Satellite for FACTION — the first data → satellite promotion (M5.5, ADR 0011).
// The standing/strength fields are filtered, sorted, and aggregated (M9 queries,
// M12 faction-power rollups + Faction-Wars tracker), so they graduate from
// Entity.data to indexed columns; the MIGRATE_ENTITY_DATA job moves them and drops
// them from `data`. Non-indexed faction fields stay in Entity.data. Review / lock /
// provenance still operate on the parent Entity (the satellite is just storage).
model Faction {
  id          String  @id            // == Entity.id
  entity      Entity  @relation(fields: [id], references: [id])
  standing    Int?                   // e.g. Faction-Wars army strength/score
  allegiance  String?
  resources   Int?
  @@index([standing])
}
// A FLOOR satellite (floorNumber/startDay/collapseDay/theme) is the heavier,
// later M5.5 slice — many hot readers (resolveAbsoluteDay, timeline banding,
// currentFloor). It may land as a full satellite OR as an indexed generated
// column for floorNumber, decided against the real query shapes (ADR 0011 Part C).

// ───────────── Agent profile / persona ─────────────
// Generalized: ordered snapshots of ANY actor entity's evolving profile
// (System AI, factions, sponsors, gods, hosts, NPC crawlers). Exactly one
// active per entity at a given point in campaign time. See docs 05 and 06.
model PersonaSnapshot {
  id             String       @id @default(cuid())
  campaignId     String
  entityId       String                     // any agent-bearing entity
  label          String?                    // e.g. "post-court-defiance"
  inGameTime     Json         @default("{}")
  orderKey       Float?
  dials          Json         @default("{}") // per entity-type traits
  values         Json         @default("[]") // core values / ideology
  agendas        Json         @default("[]") // goals: [{ text, secret: bool }]
  resources      Json         @default("{}") // capabilities the agent can use
  knowledgeScope String     @default("OMNISCIENT") // OMNISCIENT | IN_CHARACTER (fog of war)
  voiceGuide     String?
  constraints    String?                    // hard canon rules for generation
  compiledPrompt String?                   // cached persona prompt fragment
  isActive       Boolean      @default(false)
  source         ChangeSource @default(DM)
  status         CanonStatus  @default(CANON)
  locked         Boolean      @default(false)
  promptLocked   Boolean      @default(false) // protects compiledPrompt
  version        Int          @default(1)
  campaign       Campaign     @relation(fields: [campaignId], references: [id])
  entity         Entity       @relation(fields: [entityId], references: [id])
  provenance     Provenance[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  @@index([campaignId, entityId, orderKey])
  @@index([campaignId, entityId, isActive])
  @@index([campaignId, status])
}

// ───────────── Relationships (typed edges) ─────────────
enum RelationshipType {
  MEMBER_OF LEADS SPONSORS EMPLOYS ALLIED_WITH RIVAL_OF AT_WAR_WITH PARENT_ORG_OF
  USED_BY MANIPULATES CONTROLS DEFIES
  ALLY_OF ENEMY_OF MENTOR_OF MANAGES LOVES FAMILY_OF OWES
  LOCATED_ON PART_OF CONTAINS BOSS_OF SPAWNS_ON
  HAS_CLASS HAS_SPECIES OWNS_ITEM KNOWS_SKILL EARNED_ACHIEVEMENT GRANTS_BOX HOLDS_TITLE APPEARS_ON
  KNOWS_ABOUT BETRAYED KILLED SAVED
  // extensible
}

model Relationship {
  id          String           @id @default(cuid())
  campaignId  String
  type        RelationshipType
  sourceId    String
  targetId    String
  disposition Int?             // -100..100
  sinceDay    Int?             // optional crawl-day start for membership-like edges
  untilDay    Int?             // optional crawl-day end for membership-like edges
  attributes  Json   @default("{}")
  notes       String?
  secret      Boolean @default(false)   // DM-only
  status      CanonStatus @default(PENDING)
  locked      Boolean @default(false)
  version     Int     @default(1)
  source      Entity  @relation("SourceEntity", fields: [sourceId], references: [id])
  target      Entity  @relation("TargetEntity", fields: [targetId], references: [id])
  provenance  Provenance[]
  createdAt   DateTime @default(now())
  @@index([campaignId, sourceId])
  @@index([campaignId, targetId])
  @@index([campaignId, type])
  @@index([campaignId, type, sinceDay, untilDay])
}

// ───────────── Events & causality ─────────────
model Event {
  id          String   @id @default(cuid())
  campaignId  String
  title       String
  summary     String?
  description String?
  // Typed timeRef (ADR 0004 slice 2, src/lib/time-ref.ts):
  //   { basis, floor?, offset?, unit?, anchorEventId?, label? }
  // basis ∈ COLLAPSE|FLOOR_START|FLOOR_COLLAPSE|EVENT|UNSCHEDULED.
  // The display phrase is generated from the structure; label is an optional
  // one-off override. (A legacy ABSOLUTE_DAY basis is read as COLLAPSE — both
  // are bare days-since-collapse, collapse = day 0; see src/lib/time-ref.ts.)
  inGameTime  Json     @default("{}")
  // Order is mechanical and derived, never authored (ADR 0004): orderKey is the
  // floor (coarse macro-clock), rank is a fractional index (lexicographically
  // sortable string, COLLATE "C") giving stable DM-controllable order *within* a
  // floor. rank is derived from a concrete floor-relative offset, or set by drag
  // for unscheduled events. The timeline sorts by (orderKey, rank); neither is a
  // reviewable change-set field.
  orderKey    Int      @default(0)
  rank        String   @default("a0")
  secret      Boolean  @default(false)
  source      ChangeSource @default(DM)
  status      CanonStatus @default(CANON)
  locked      Boolean  @default(false)
  version     Int      @default(1)
  participants EventParticipant[]
  causedBy    EventCausality[] @relation("Effect")
  causes      EventCausality[] @relation("Cause")
  // Structured effect rows (M3): ADJUST_STAT, SET_STAT, SET_ALIVE.
  // PERSONA_SHIFT (M6) nudges System AI dials; GRANT_ACHIEVEMENT (M7) grants a
  // crawler an EARNED_ACHIEVEMENT edge. All use the same reviewable
  // APPLY_EVENT_EFFECTS path.
  effects     Json     @default("[]")
  provenance  Provenance[]
  @@index([campaignId, orderKey, rank])
}

enum ParticipantRole { ACTOR TARGET WITNESS LOCATION AFFECTED }

model EventParticipant {
  id        String @id @default(cuid())
  eventId   String
  entityId  String
  role      ParticipantRole
  event     Event  @relation(fields: [eventId], references: [id])
  @@index([entityId])
}

model EventCausality {     // DAG edge between events; cycles blocked in service logic
  id         String @id @default(cuid())
  campaignId String
  causeId    String
  effectId   String
  weight     Int?   // optional strength of causal contribution
  note       String?
  source     ChangeSource @default(DM)
  status     CanonStatus @default(CANON)
  locked     Boolean @default(false)
  version    Int @default(1)
  cause      Event  @relation("Cause",  fields: [causeId],  references: [id])
  effect     Event  @relation("Effect", fields: [effectId], references: [id])
  provenance Provenance[]
  @@index([causeId, effectId])
  @@index([campaignId, status])
}

// ───────────── Review pipeline ─────────────
// MIGRATION (M5.5, ADR 0011) marks an auto-approved data-schema migration write —
// attributed to a real account (the triggering DM, or Campaign.ownerId for an
// automatic schemaVersion bump) so the required AuditLog.actorUserId FK is satisfied,
// while provenance reads as a mechanical migration, not that account's hand edit.
enum ChangeSource { DM AI PLAYER_SUGGESTION IMPORT MIGRATION }
enum ChangeSetStatus { PENDING APPROVED REJECTED PARTIALLY_APPLIED SUPERSEDED }
enum OpKind {
  CREATE_ENTITY UPDATE_ENTITY DELETE_ENTITY
  CREATE_RELATIONSHIP UPDATE_RELATIONSHIP DELETE_RELATIONSHIP
  CREATE_EVENT UPDATE_EVENT APPLY_EVENT_EFFECTS
  CREATE_EVENT_CAUSALITY DELETE_EVENT_CAUSALITY
}
enum OpDecision { PENDING ACCEPTED EDITED REJECTED }

model ChangeSet {
  id            String   @id @default(cuid())
  campaignId    String
  source        ChangeSource
  title         String
  summary       String?
  status        ChangeSetStatus @default(PENDING)
  // origin / provenance of the whole set:
  actorUserId   String?
  providerId    String?
  model         String?
  promptId      String?
  promptVersion String?
  runId         String?
  baseVersions  Json     @default("{}")   // entityId -> version seen at generation
  operations    ChangeOperation[]
  reviewedById  String?
  reviewedAt    DateTime?
  reviewNotes   String?
  createdAt     DateTime @default(now())
  @@index([campaignId, status])
}

model ChangeOperation {
  id          String   @id @default(cuid())
  changeSetId String
  op          OpKind
  targetType  String
  targetId    String?                 // null => create
  patch       Json                    // { field: { from?, to } }
  editedPatch Json?                    // DM's edited version
  fieldDecisions Json @default("{}")  // { field: "ACCEPTED" | "REJECTED" }
  decision    OpDecision @default(PENDING)
  blockedByLock Boolean @default(false)
  isStale     Boolean  @default(false)
  changeSet   ChangeSet @relation(fields: [changeSetId], references: [id])
  @@index([changeSetId])
}

model Provenance {       // attached to each canon record's history
  id            String   @id @default(cuid())
  campaignId    String
  entityId      String?
  relationshipId String?
  eventId       String?
  personaSnapshotId String?
  changeSetId   String
  source        ChangeSource
  field         String?               // null => whole-record
  actorUserId   String?
  providerId    String?
  model         String?
  promptId      String?
  runId         String?
  createdAt     DateTime @default(now())
  @@index([entityId])
}

model AuditLog {
  id          String   @id @default(cuid())
  campaignId  String
  actorUserId String
  action      String   // APPROVE | REJECT | LOCK | UNLOCK | EDIT | DELETE | ...
  targetType  String
  targetId    String
  detail      Json     @default("{}")
  createdAt   DateTime @default(now())
  @@index([campaignId, createdAt])
}

// ───────────── AI config & jobs ─────────────
model AiKey {            // encrypted at rest — see docs/adr/0006 + adr/0007
  id          String @id @default(cuid())
  campaignId  String
  providerId  String   // matches src/lib/ai/providers.ts (e.g. "anthropic")
  ciphertext  String   // AES-256-GCM envelope-encrypted key material (server-only)
  lastFour    String   // non-secret display hint: the key's last 4 chars
  baseUrl     String?  // OpenAI-compatible endpoint (self-hosted / proxy); non-secret
  model       String?  // optional per-key model override (falls back to provider default)
  embeddingModel      String? // optional semantic-search embedder model
  embeddingDimensions Int?    // optional vector width for that embedder
  inputPerMTokUsd  Float?  // DM price override (USD / 1M tokens); both set → overrides table
  outputPerMTokUsd Float?  // ... — the only way to cost a self-hosted/proxy model
  createdById String   // who configured it
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([campaignId, providerId])
  @@index([campaignId])
}

model AiUsage {          // one generation's token usage + estimated cost (M4)
  id                  String @id @default(cuid())
  campaignId          String
  createdById         String // who triggered the run
  providerId          String // matches src/lib/ai/providers.ts
  model               String
  generatorId         String // the generator's prompt id (e.g. "flesh-entity")
  changeSetId         String?  // the PENDING change set it produced (plain id, no FK)
  inputTokens         Int
  outputTokens        Int
  cacheReadTokens     Int    @default(0)
  cacheCreationTokens Int    @default(0)
  estimatedCostUsd    Float?   // null = model unpriced; tokens stay authoritative
  createdAt           DateTime @default(now())
  @@index([campaignId, createdAt])
}
// Spend cap lives on Campaign: `spendCapUsd Float?` (null = no cap). Enforced
// against the sum of priced AiUsage rows before a generation runs. Carries no
// secret — the API key is never referenced here (invariant #6). See pricing in
// src/lib/ai/pricing.ts. (Distinct from review-pipeline Provenance.)

model Job {              // async generation / bulk + simulation + indexing runs
  id          String @id @default(cuid())
  campaignId  String
  kind        String   // ... | AGENT_SIM | WORLD_TICK | SCENARIO | REINDEX | RECAP
                       //   | MIGRATE_ENTITY_DATA (M5.5: upgrade stale data._v rows)
  params      Json
  status      String   // QUEUED RUNNING DONE FAILED
  resultSetId String?  // -> ChangeSet
  usage       Json     @default("{}")   // tokens, est. cost
  error       String?
  createdAt   DateTime @default(now())
  @@index([campaignId, status])
}

// ───────────── Search & retrieval (doc 07) ─────────────
// Hybrid full-text + semantic retrieval over canon. Derived data, regenerable,
// never part of provenance. `embedding` is a pgvector semantic embedding added
// in M5 slice 4a (populated async by the EMBED_SEARCH_DOCS job).
model SearchDoc {
  id             String                       @id @default(cuid())
  campaignId     String
  targetType     String                       // ENTITY | RELATIONSHIP | EVENT
  targetId       String
  content        String                       // denormalized name + summary + salient fields
  // Generated from content; GIN-indexed in migration.
  searchVector   Unsupported("tsvector")?     @default(dbgenerated("to_tsvector('english'::regconfig, content)"))
  embedding           Unsupported("vector")?  // written via raw SQL; null = not yet embedded
  embeddingModel      String?                 // model that produced `embedding`
  embeddingDimensions Int?                    // vector width that produced `embedding`
  visibility     Visibility                   @default(DM_ONLY) // mirror of source, for scoped retrieval
  updatedAt      DateTime                     @updatedAt
  @@unique([targetType, targetId])
  @@index([campaignId, targetType])
  @@index([searchVector], type: Gin, map: "SearchDoc_searchVector_idx")
  // Raw migration index (not representable in Prisma @@index):
  // SearchDoc_embedding_hnsw_1536_idx on (embedding::vector(1536)) vector_cosine_ops
  // where embedding is not null and embeddingDimensions = 1536.
}

// ───────────── Knowledge / reveals (fog of war) ─────────────
// Canon visibility is not only global. A DM can reveal a specific entity, field,
// relationship, event, or fact to one crawler/player/NPC/faction without sharing
// it with everyone. These grants power both the player "known world" projection
// and in-character agent context.
enum KnowledgeTargetType { ENTITY ENTITY_FIELD RELATIONSHIP EVENT FACT }
enum KnowledgeRecipientType { ENTITY MEMBERSHIP }

model KnowledgeGrant {
  id              String   @id @default(cuid())
  campaignId      String
  targetType      KnowledgeTargetType
  targetId        String               // entityId, relationshipId, eventId, etc.
  field           String?              // for ENTITY_FIELD / field-level reveals
  factKey         String?              // optional stable key for derived/ad-hoc facts
  recipientType   KnowledgeRecipientType
  recipientId     String               // Entity.id (NPC/Crawler/Party/etc.) or Membership.id
  sourceEventId   String?              // optional event/session context that revealed it
  revealedById    String
  revealedAt      DateTime @default(now())
  expiresAt       DateTime?
  notes           String?
  revokedAt       DateTime?
  revokedById     String?
  @@index([campaignId, recipientType, recipientId])
  @@index([campaignId, targetType, targetId])
}

// ───────────── Live session mode (doc 08) ─────────────
model Session {
  id          String   @id @default(cuid())
  campaignId  String
  title       String
  playedAt    DateTime?
  focus       String?               // floor/area in focus
  notes       String?               // prep + freeform
  entries     SessionLogEntry[]
  createdAt   DateTime @default(now())
  @@index([campaignId, playedAt])
}

model SessionLogEntry {             // real-time capture; NOT canon until promoted
  id          String   @id @default(cuid())
  sessionId   String
  at          DateTime @default(now())
  text        String
  taggedIds   String[] @default([])  // referenced entity ids (@Carl, #Floor7)
  promotedEventId String?            // -> Event, once promoted via review pipeline
  session     Session  @relation(fields: [sessionId], references: [id])
  @@index([sessionId, at])
}
// Reveals (flipping visibility to players during a session) are recorded as
// AuditLog rows (action: REVEAL) — the principled source for the player
// interface's "known world" and for agent fog-of-war.
```

## Notes for implementers

- `Entity.data` schemas per `EntityType` are defined as **Zod schemas** in the
  per-type entity-kind descriptors under `/src/lib/entity-kinds`
  ([ADR 0009](./adr/0009-entity-kind-registry.md)) and validated on every write —
  validation, the data-key lists, the reviewable/lockable set, the form, and the
  display all derive from one descriptor. They are **versioned**: each descriptor
  carries a `schemaVersion`, every write stamps a reserved `data._v`, and pure
  per-kind migrations upgrade older rows on read (and via the
  `MIGRATE_ENTITY_DATA` job), so a type can evolve its fields without silent data
  loss ([ADR 0011](./adr/0011-entity-data-versioning-and-satellites.md)). FLOOR is
  the first non-lossless bump: v2 converts legacy v1 numeric floor fields stored
  as strings into stored numbers before final validation.
  Examples of bespoke `data` to add as those types gain descriptors:
  `NPC.data.roles: NpcRole[]` (GUIDE/MANAGER/ADMIN/HOST/PRODUCTION_CREW/ELITE/
  FACTION_LEADER/SHOPKEEPER/DEITY/QUEST_GIVER — non-exclusive, queryable);
  `PARTY.data`/`GUILD.data` hold formation/disband status. (Today only FLOOR and
  ITEM carry descriptors; the rest use the generic core path.)
- Treat `BigInt` crawler audience ratings (`viewCount`, `followerCount`,
  `favoriteCount`) carefully across the JSON boundary.
- The review service is the only writer of canon — keep mutation logic out of
  route handlers.
- Add DB-level constraints where cheap (unique edges, FK cascades to archive not
  hard-delete where history matters).
- More types graduate to satellites as query patterns demand. **`Faction` and
  `Floor` are now scheduled in M5.5** ([ADR 0011](./adr/0011-entity-data-versioning-and-satellites.md)),
  promoted via the `MIGRATE_ENTITY_DATA` job (the schema-versioning machinery is
  the promotion mechanism). Further candidates stay deferred until their query
  shapes warrant indexing.
- `Event.effects` v1 stores crawler-targeted consequences in `Event.effects`
  JSON: `ADJUST_STAT` deltas non-null numeric crawler fields, `SET_STAT` writes
  an absolute numeric crawler field (for nullable values like `currentFloor`),
  `SET_ALIVE` flips `Crawler.isAlive`, and `GRANT_ACHIEVEMENT` records achievement
  awards. Submitting them creates a pending
  `APPLY_EVENT_EFFECTS` Change Set and stores `pendingChangeSetId` /
  `pendingOperationId` plus `reviewStatus` on each effect row. Approval applies
  the reviewed effect rows through the review pipeline, writes
  `appliedChangeSetId`, and attaches effect targets as `AFFECTED` participants
  so entity timelines include events that changed that crawler. Rejection or
  supersede clears pending pointers and marks the rows reviewed without mutating
  target entities.
- `Event.effects` entries include a `PERSONA_SHIFT` kind
  (`{ kind, entityId, dialDeltas, note }`); applying it (via
  `APPLY_EVENT_EFFECTS`, on approval) creates/updates a `PersonaSnapshot`. This
  keeps the System AI's drift in the same reviewable causality graph as
  everything else (see doc 05).
- `SearchDoc` mirrors its source's `visibility` so retrieval can be scoped
  before hydration; relationship/event results still re-apply endpoint/
  participant visibility against live canon because that projection can change
  without an edge/event write. `searchVector` is generated from `content` and
  GIN-indexed for keyword/full-text search. The M5 slice-4a migration enables the
  `pgvector` extension and adds semantic embeddings; slice 4c widens the vector
  column for configurable dimensions, records `embeddingDimensions`, and adds a
  raw-SQL HNSW cosine expression index for 1536-dimensional rows.
  `searchCanon` blends full-text `ts_rank` with cosine similarity (hybrid) but
  never changes what a player may see — the visibility pre-filter + hydration
  projection are unchanged.
- **Export/import** (doc 02, M9) serializes campaign canon + provenance to
  JSON/Markdown; import re-creates it as `IMPORT` change sets. No new tables —
  it reads/writes the existing model.
