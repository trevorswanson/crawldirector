# 05 — Data Schema (draft Prisma)

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
- **Relationships and Events are their own tables**, both reviewable.
- **Review pipeline tables** (`ChangeSet`, `ChangeOperation`, `Provenance`,
  `Lock`, `AuditLog`) are central and referenced by everything mutable.

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
  id          String   @id @default(cuid())
  name        String
  summary     String?
  styleGuide  String?               // tone/canon constraints for AI
  ownerId     String
  members     Membership[]
  entities    Entity[]
  // ...other relations
  createdAt   DateTime @default(now())
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
  FLOOR NEIGHBORHOOD LOCATION BOSS MOB_TYPE
  FACTION ORGANIZATION SPONSOR
  SHOW
  SYSTEM_AI
  ITEM SKILL SPELL ACHIEVEMENT TITLE SYSTEM_MESSAGE DEITY
  // extensible
}

enum CanonStatus { DRAFT PENDING CANON REJECTED ARCHIVED }
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
  id           String  @id            // == Entity.id
  entity       Entity  @relation(fields: [id], references: [id])
  realName     String?
  crawlerNo    String?
  level        Int     @default(1)
  stats        Json    @default("{}") // core stat set (configurable per ruleset)
  hp           Int?
  mp           Int?
  gold         Int     @default(0)
  fanCount     BigInt  @default(0)
  killCount    Int     @default(0)
  isAlive      Boolean @default(true)
  currentFloor Int?
  // class/species/items/skills/achievements modeled as Relationships
}

// ───────────── System AI persona ─────────────
// Ordered snapshots of a SYSTEM_AI entity's evolving behavior; exactly one
// active per entity at a given point in campaign time. See doc 09.
model PersonaSnapshot {
  id            String      @id @default(cuid())
  campaignId    String
  entityId      String                     // the SYSTEM_AI entity (could generalize)
  label         String?                    // e.g. "post-court-defiance"
  inGameTime    Json        @default("{}")
  orderKey      Float?
  dials         Json        @default("{}") // { sentience, compliance, volatility, benevolence, resentment, theatricality, ... }
  agendas       Json        @default("[]") // [{ text, secret: bool }]
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
  description String?
  inGameTime  Json     @default("{}")   // { floor?, dayInFloor?, absoluteDay?, label? }
  orderKey    Float?                     // sortable timeline position
  loggedAt    DateTime @default(now())
  status      CanonStatus @default(PENDING)
  locked      Boolean  @default(false)
  visibility  Visibility @default(DM_ONLY)
  participants EventParticipant[]
  causedBy    EventCausality[] @relation("Effect")
  causes      EventCausality[] @relation("Cause")
  effects     Json     @default("[]")    // structured deltas (optionally applied)
  provenance  Provenance[]
  @@index([campaignId, orderKey])
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

model EventCausality {     // DAG edge between events
  id        String @id @default(cuid())
  causeId   String
  effectId  String
  weight    Int?   // optional strength of causal contribution
  cause     Event  @relation("Cause",  fields: [causeId],  references: [id])
  effect    Event  @relation("Effect", fields: [effectId], references: [id])
  @@unique([causeId, effectId])
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

model Job {              // async generation / bulk runs
  id          String @id @default(cuid())
  campaignId  String
  kind        String   // generator family
  params      Json
  status      String   // QUEUED RUNNING DONE FAILED
  resultSetId String?  // -> ChangeSet
  usage       Json     @default("{}")   // tokens, est. cost
  error       String?
  createdAt   DateTime @default(now())
  @@index([campaignId, status])
}
```

## Notes for implementers

- `Entity.data` schemas per `EntityType` should be defined as **Zod schemas** in
  `/src/lib/entitySchemas` and validated on every write; keep them versioned.
- Treat `BigInt` (fanCount) carefully across the JSON boundary.
- The review service is the only writer of canon — keep mutation logic out of
  route handlers.
- Add DB-level constraints where cheap (unique edges, FK cascades to archive not
  hard-delete where history matters).
- Revisit whether more types deserve satellites once query patterns are known
  (likely candidates next: `Faction`, `Floor`).
- `Event.effects` entries include a `PERSONA_SHIFT` kind
  (`{ kind, entityId, dialDeltas, note }`); applying it (via
  `APPLY_EVENT_EFFECTS`, on approval) creates/updates a `PersonaSnapshot`. This
  keeps the System AI's drift in the same reviewable causality graph as
  everything else (see doc 09).
