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
> pipeline. Unapplied event effects now submit pending Review Queue proposals
> before mutating target entities. Pending relationship/event proposals remain a
> future M3 slice.

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
  crawlers    Entity[] @relation("PlayerCrawlers")   // player ↔ crawler links
  @@unique([userId, campaignId])
  @@index([campaignId])
}

// ───────────── Entity core ─────────────
enum EntityType {
  CRAWLER NPC SPECIES CLASS
  PARTY GUILD                       // crawler-formed collectives (party → guild)
  FLOOR NEIGHBORHOOD LOCATION BOSS MOB_TYPE
  FACTION ORGANIZATION SPONSOR
  SHOW
  SYSTEM_AI
  ITEM SKILL SPELL ACHIEVEMENT TITLE SYSTEM_MESSAGE DEITY
  // extensible
}

enum CanonStatus { DRAFT PENDING CANON REJECTED ARCHIVED }
// Visibility is a campaign-wide default plus a presentation hint.
// - DM_ONLY: not broadly visible to players. Private KnowledgeGrant rows may
//   reveal exact facts/fields/entities to selected recipients.
// - SHARED_WITH_PLAYERS: visible to players as ordinary known-world canon.
// - PLAYER_FACING: visible to players and authored for the in-fiction
//   crawler/System UI. It is not a separate audience scope.
enum Visibility  { DM_ONLY SHARED_WITH_PLAYERS PLAYER_FACING }

model Entity {
  id           String      @id @default(cuid())
  campaignId   String
  type         EntityType
  name         String
  summary      String?
  description  String?     // markdown
  status       CanonStatus @default(PENDING)
  visibility   Visibility  @default(DM_ONLY)
  data         Json        @default("{}")   // type-specific structured fields
  customFields Json        @default("{}")   // DM/AI ad-hoc fields
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

// ───────────── Agent profile / persona ─────────────
// Generalized: ordered snapshots of ANY actor entity's evolving profile
// (System AI, factions, sponsors, gods, hosts, NPC crawlers). Exactly one
// active per entity at a given point in campaign time. See docs 05 and 06.
model PersonaSnapshot {
  id            String      @id @default(cuid())
  campaignId    String
  entityId      String                     // any agent-bearing entity
  label         String?                    // e.g. "post-court-defiance"
  inGameTime    Json        @default("{}")
  orderKey      Float?
  dials         Json        @default("{}") // per entity-type traits (System AI: sentience/compliance/...; faction: ambition/aggression/...)
  values        Json        @default("[]") // core values / ideology driving behavior
  agendas       Json        @default("[]") // goals: [{ text, secret: bool }]
  resources     Json        @default("{}") // capabilities the agent can actually use
  knowledgeScope String     @default("OMNISCIENT") // OMNISCIENT | IN_CHARACTER (fog of war)
  voiceGuide    String?
  constraints   String?                    // hard canon rules for generation
  compiledPrompt String?                   // cached persona prompt fragment
  isActive      Boolean     @default(false)
  status        CanonStatus @default(PENDING)
  locked        Boolean     @default(false)
  promptLocked  Boolean     @default(false) // protects compiledPrompt from recompile/AI
  version       Int         @default(1)
  entity        Entity      @relation(fields: [entityId], references: [id])
  provenance    Provenance[]
  createdAt     DateTime    @default(now())
  @@index([campaignId, entityId, orderKey])
}

// ───────────── Relationships (typed edges) ─────────────
enum RelationshipType {
  MEMBER_OF LEADS SPONSORS EMPLOYS ALLIED_WITH RIVAL_OF AT_WAR_WITH PARENT_ORG_OF
  USED_BY MANIPULATES CONTROLS DEFIES
  ALLY_OF ENEMY_OF MENTOR_OF MANAGES LOVES FAMILY_OF OWES
  LOCATED_ON PART_OF CONTAINS BOSS_OF SPAWNS_ON
  HAS_CLASS HAS_SPECIES OWNS_ITEM KNOWS_SKILL EARNED_ACHIEVEMENT HOLDS_TITLE APPEARS_ON
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
  // basis ∈ COLLAPSE|FLOOR_START|FLOOR_COLLAPSE|EVENT|ABSOLUTE_DAY|UNSCHEDULED.
  // The display phrase is generated from the structure; label is an optional
  // one-off override.
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
  // Future M3/M6: structured deltas (optionally applied), including PERSONA_SHIFT.
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
enum ChangeSource { DM AI PLAYER_SUGGESTION IMPORT }
enum ChangeSetStatus { PENDING APPROVED REJECTED PARTIALLY_APPLIED SUPERSEDED }
enum OpKind {
  CREATE_ENTITY UPDATE_ENTITY DELETE_ENTITY
  CREATE_RELATIONSHIP UPDATE_RELATIONSHIP DELETE_RELATIONSHIP
  CREATE_EVENT UPDATE_EVENT APPLY_EVENT_EFFECTS
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
model AiKey {            // encrypted at rest
  id          String @id @default(cuid())
  campaignId  String
  providerId  String
  ciphertext  String   // envelope-encrypted key material
  createdAt   DateTime @default(now())
  @@unique([campaignId, providerId])
}

model Job {              // async generation / bulk + simulation + indexing runs
  id          String @id @default(cuid())
  campaignId  String
  kind        String   // ... | AGENT_SIM | WORLD_TICK | SCENARIO | REINDEX | RECAP
  params      Json
  status      String   // QUEUED RUNNING DONE FAILED
  resultSetId String?  // -> ChangeSet
  usage       Json     @default("{}")   // tokens, est. cost
  error       String?
  createdAt   DateTime @default(now())
  @@index([campaignId, status])
}

// ───────────── Search & retrieval (doc 07) ─────────────
// Hybrid full-text + vector index over canon. Derived data, regenerable,
// never part of provenance. Requires the pgvector extension.
model SearchDoc {
  id          String   @id @default(cuid())
  campaignId  String
  targetType  String   // ENTITY | RELATIONSHIP | EVENT
  targetId    String
  content     String   // denormalized name + summary + salient fields
  // tsv      Unsupported("tsvector")        // full-text (generated/maintained)
  // embedding Unsupported("vector(1536)")   // pgvector; dims per embed model
  visibility  Visibility @default(DM_ONLY)   // mirror of source, for scoped retrieval
  updatedAt   DateTime @updatedAt
  @@unique([targetType, targetId])
  @@index([campaignId, targetType])
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

- `Entity.data` schemas per `EntityType` should be defined as **Zod schemas** in
  `/src/lib/entitySchemas` and validated on every write; keep them versioned.
  Examples: `NPC.data.roles: NpcRole[]` (GUIDE/MANAGER/ADMIN/HOST/
  PRODUCTION_CREW/ELITE/FACTION_LEADER/SHOPKEEPER/DEITY/QUEST_GIVER — non-
  exclusive, queryable); `PARTY.data`/`GUILD.data` hold formation/disband status.
- Treat `BigInt` crawler audience ratings (`viewCount`, `followerCount`,
  `favoriteCount`) carefully across the JSON boundary.
- The review service is the only writer of canon — keep mutation logic out of
  route handlers.
- Add DB-level constraints where cheap (unique edges, FK cascades to archive not
  hard-delete where history matters).
- Revisit whether more types deserve satellites once query patterns are known
  (likely candidates next: `Faction`, `Floor`).
- `Event.effects` v1 stores crawler-targeted consequences in `Event.effects`
  JSON: `ADJUST_STAT` deltas non-null numeric crawler fields, `SET_STAT` writes
  an absolute numeric crawler field (for nullable values like `currentFloor`),
  and `SET_ALIVE` flips `Crawler.isAlive`. Submitting them creates a pending
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
  without joining back to canon; the indexer keeps it in sync on re-index.
  Enable the `pgvector` extension in the first migration that adds it (M5).
- **Export/import** (doc 02, M9) serializes campaign canon + provenance to
  JSON/Markdown; import re-creates it as `IMPORT` change sets. No new tables —
  it reads/writes the existing model.
