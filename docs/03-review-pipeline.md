# 03 — The Review Pipeline (signature feature)

> **This is the defining feature of the product.** Almost every update — and
> *every* AI-generated update — enters as a **proposal** that the DM reviews
> before it becomes canon. Reviewed or hand-written data can be **locked** so it
> is protected from future automated edits. Get this right and everything else is
> ordinary CRUD; get it wrong and the product has no reason to exist.

## Concepts

### States

Every reviewable artifact (entity, relationship, event, **System AI persona
snapshot** — and individual field changes within them) moves through:

```
        ┌──────────┐  submit   ┌──────────┐  approve  ┌────────┐
  ────▶ │  DRAFT*   │ ───────▶ │ PENDING  │ ────────▶ │ CANON  │
        └──────────┘           └────┬─────┘            └────────┘
                                    │ reject              ▲
                                    ▼                     │ lock (optional)
                               ┌──────────┐               │
                               │ REJECTED │          ┌─────┴─────┐
                               └──────────┘          │  LOCKED   │
                                                     └───────────┘
            * DRAFT is optional (DM scratch space / partial AI output)
```

- **DRAFT** — optional work-in-progress, not yet submitted for review.
- **PENDING** — submitted, awaiting DM decision. Visible in the review queue.
- **CANON** — approved, authoritative.
- **REJECTED** — declined; retained for history, not canon.
- **LOCKED** — a canon entity/field flagged as protected from automated edits.
- **SUPERSEDED** — a pending proposal invalidated because canon changed under it,
  or a newer proposal replaced it.

### The Change Set / Proposal

A **Change Set** is the unit of review. It bundles one or more **Change
Operations** so related edits are approved together (e.g. "create faction +
3 member relationships + 1 founding event" is one reviewable set).

```
ChangeSet {
  id, campaignId
  source: DM | AI | PLAYER_SUGGESTION | IMPORT
  origin: { actorUserId?, model?, providerId?, promptId?, runId? }   // provenance
  title, summary                  // human/AI description of what & why
  status: PENDING | APPROVED | REJECTED | PARTIALLY_APPLIED | SUPERSEDED
  baseVersionRefs: [...]          // entity versions this was generated against
  operations: ChangeOperation[]
  reviewedBy?, reviewedAt?, reviewNotes?
  createdAt
}

ChangeOperation {
  id
  op: CREATE_ENTITY | UPDATE_ENTITY | DELETE_ENTITY
    | CREATE_RELATIONSHIP | UPDATE_RELATIONSHIP | DELETE_RELATIONSHIP
    | CREATE_EVENT | UPDATE_EVENT
    | CREATE_EVENT_CAUSALITY | DELETE_EVENT_CAUSALITY
    | APPLY_EVENT_EFFECTS
  targetType, targetId?           // null targetId => create
  patch: { field -> { from?, to } }   // field-level diff
  decision: PENDING | ACCEPTED | EDITED | REJECTED   // per-operation
  editedPatch?                    // DM's edited version of the proposed change
}
```

**Field-level granularity is essential.** A DM must be able to accept an AI
proposal's new `description` but reject its change to `level`, or edit the
proposed value before accepting. Decisions are recorded per operation (and the
UI may expose per-field accept/reject within an operation's patch).

### Provenance

Provenance is attached at the Change Set level and **copied onto the resulting
canon** (each entity/edge/event records the Change Set that last modified each
field, or at least last modified the record). It captures:

- `source` (DM / AI / player / import)
- for AI: provider, model, prompt template id + version, the run id, and a
  reference to the generation request (NOT the API key)
- acting user, timestamps, and the review decision

Provenance is **never discarded** — even after approval, you can answer "where
did this sentence come from, and who approved it?" This powers the "AI vs.
human" visual distinction the DM relies on.

### Locking

- A **lock** can be placed on an entire entity or on specific fields
  (`lockedFields: string[]`), and on relationships/events similarly.
- **AI generators and imports MUST refuse to modify locked targets.** When a
  generator would touch a locked field, it instead emits the change as a
  *flagged operation* the DM sees as "blocked by lock — unlock to apply," rather
  than silently overwriting.
- Locking is itself an audited action. Unlocking requires the DM and is logged.
- Approving a proposal does **not** auto-lock; locking is a separate, deliberate
  "I trust this" action (though the UI may offer "approve & lock" as one click).

## Lifecycle in practice

### 1. DM direct edit (auto-approved, still tracked)
A DM editing a field directly creates a Change Set with `source: DM` that is
**auto-approved** and applied immediately. Why route DM edits through the same
pipeline? So provenance and audit are uniform, and so the "what changed" history
is complete. The UI makes this invisible/instant for the DM.

> Exception for ergonomics: trivial DM edits may be applied directly with a
> lightweight audit record instead of a full Change Set, as long as provenance is
> still captured. Decide the exact threshold during M2 implementation; the
> invariant is *provenance is always recorded*.

### 1a. Event effects (reviewable consequences)

Event effects are structured consequences of an event: examples include
`Crawler.gold +50`, `Crawler.currentFloor = 1`, or `Crawler.isAlive = false`.
The event itself can store the declared effect rows, but applying those rows to
the target entity is a canon mutation and should enter the Review Queue as an
`APPLY_EVENT_EFFECTS` operation.

Default flow:

1. A DM, AI run, player suggestion, or import declares one or more unapplied
   effects on an event.
2. The service creates or updates a `PENDING` Change Set with an
   `APPLY_EVENT_EFFECTS` operation that targets the event and shows the resolved
   entity patch in the queue (for example, `Crawler.gold: 20 -> 70`).
3. The Review Queue owns approve/edit/reject/supersede. Editing the queued
   operation should let the DM fix the target, effect kind, stat, or value before
   approval.
4. Approval applies the resolved patch atomically, marks the event effect rows as
   applied, records the applying Change Set id on those rows, and attaches every
   target as an `AFFECTED` participant so affected entities show the event in
   their timelines.
5. Rejection or supersede must not mutate the target entity. The UI must also
   avoid leaving a rejected effect looking like a still-actionable unapplied
   effect; either remove it from the active effect list or mark it with an
   explicit rejected/superseded review state.

A later "apply now" button can exist for DM speed, but it should still be an
explicit auto-approved `DM` Change Set using the same `APPLY_EVENT_EFFECTS`
application path. The distinction is:

- Review Queue `PENDING` means the entity mutation has not been approved.
- Event effect `unapplied` means the declared consequence has not changed entity
  state yet.

### 2. AI generation (the core flow)
1. DM triggers a generator (e.g. "flesh out Floor 7", "generate 5 mob types for
   the goblin neighborhood", "propose consequences of Carl's Floor-3 stunt").
2. The AI orchestrator builds context from canon (respecting locks — locked data
   is sent as read-only context), calls the provider, and parses output into a
   Change Set with `source: AI` and full origin provenance.
3. The Change Set lands as **PENDING** in the review queue. Nothing is canon yet.
4. DM opens the review view: sees a **diff** (new entities highlighted, field
   changes shown as from→to), can **accept / edit / reject per operation/field**,
   add review notes, then **approve** (commit accepted ops to canon),
   **reject**, or **save edits and re-review**.
5. Approved operations apply atomically; provenance is written; optionally
   "approve & lock."

### 3. Player suggestion
A player proposes a change (e.g. updates their crawler's bio). It enters as
`source: PLAYER_SUGGESTION`, PENDING, and the DM reviews it exactly like AI
output. Players never write canon directly.

### 4. Import (shared library / canonical DCC content)
Importing the canonical 18 floors or a mob-type pack creates a Change Set with
`source: IMPORT` so even seed data is reviewable and attributable.

## Conflict & staleness handling

- Each proposal records `baseVersionRefs` (the entity versions it was generated
  against).
- On approval, if a referenced entity's current `version` ≠ the base version,
  the affected operations are flagged as **stale**; the DM sees a three-way view
  (base / current canon / proposed) and resolves. Non-conflicting operations in
  the same set can still apply.
- Locked-field collisions surface as blocked operations (see Locking).

## Batch review

DMs will generate a lot. The review queue must support:
- filtering by source, entity type, floor/area, generator run;
- **bulk accept/reject** of a whole run;
- "accept all non-conflicting, hold the rest";
- a per-run summary ("AI proposed: 5 new mob types, 12 relationships, 3 events").

## Data model touchpoints

This pipeline is implemented by the `review` service
(`/src/server/services/review.ts`) and backed by `ChangeSet`,
`ChangeOperation`, `Provenance`, and `AuditLog` tables (see
[`09-data-schema.md`](./09-data-schema.md)). The first entity slice uses the
`Entity.locked` / `Entity.lockedFields` columns for field locks; a unified lock
table can arrive when relationships and events need the same treatment. The
`entities`, `relationships`, and `events` services call into `review` for all
mutations — they do not write canon themselves.

## Invariants (must always hold)

1. No canon write happens without a Change Set + provenance.
2. AI/import never modifies a locked target silently.
3. Rejected/superseded proposals are retained, never hard-deleted.
4. Provenance survives approval.
5. Players cannot transition anything to CANON.
6. Approval is atomic per accepted-operation-set.

These invariants should be enforced in the service layer and covered by tests
from the first milestone that introduces the pipeline (M2).
