# Event-Consequence Generator Design

## Goal

Pull the event-consequence generator forward from M10 as the next M6 slice. A DM
can select a canonical timeline event, ask the configured BYO-key model to propose
bounded consequences, and review every resulting mutation before canon changes.
The generator must be able to propose entity-state effects (including
`PERSONA_SHIFT`) and causal graph edges without depending on shared-canon-library
work.

## Scope

This slice adds a single, event-scoped generator:

- Input is one unlocked, unarchived canonical event plus its participants,
  declared effects, campaign style guide, and retrieval-scoped canon context.
- Output contains at most six structured event effects and four causal links from
  the selected event to existing, unlocked canonical events.
- Effects are limited to the already supported kinds: crawler stat/alive updates,
  `COLLAPSE_FLOOR`, and `PERSONA_SHIFT`. A persona-shift candidate must be a
  `SYSTEM_AI` with an active persona snapshot.
- The generated result becomes one `source: AI`, `PENDING` event change set. The
  effect operation applies target-entity updates only when the DM accepts and
  approves it; causal links are separate review operations in the same set.
- The campaign Timeline is the single invocation surface. The button appears in
  the expanded event card only for a DM/co-DM with a configured provider and an
  unlocked source event. Its result links directly to the Review Queue.

The generator does not create a new downstream Event, create or update ordinary
relationship edges, apply anything automatically, run asynchronously, or change
the shared-library/import/admin model.

## Why existing-event causal links are the correct boundary

Current review operations use real database ids. A `CREATE_EVENT_CAUSALITY`
operation cannot safely refer to a `CREATE_EVENT` operation in the same pending
change set because the latter's id does not exist until approval. The dependency
and alias mechanism needed to solve that is explicitly deferred by ADR 0012 for
same-batch library entity/relationship imports, where partial review must not
create dangling edges.

This slice therefore links only to existing event ids. It still produces useful
canon: a DM can log or import an event, then ask the generator to propose what it
caused; the generator can affect existing crawler/System-AI entities and connect
the event to existing downstream events. A future extension can add proposed new
events after generic operation aliases/dependencies exist, without changing this
generator's prompt, provider, provenance, or review semantics.

## Architecture

`src/server/ai/generators/event-consequences.ts` is a pure module holding the
versioned generator identity, strict Zod output schema, prompt construction, and
conversion from model output to event-review operations. The prompt only exposes
candidate ids supplied by the service. It requires concise, high-confidence
proposals, rejects invented ids, and clearly states that it is drafting for a
Review Queue.

`proposeEventConsequences` in `src/server/services/generation.ts` owns
authorization, spend caps, provider calls, usage recording, candidate loading,
retrieval, duplicate filtering, and PENDING change-set creation. The service
loads the selected event and makes its title, summary, time, participants, and
declared effects read-only context. It offers only supported effect targets and
eligible existing consequence events. The source event and candidate events are
locked-filtered before the provider call; review-layer checks remain the backstop.

The existing `APPLY_EVENT_EFFECTS` review operation is extended so that AI-proposed
effects in its patch are self-contained. Today it expects those effect rows to be
predeclared on the Event. For a generated operation, the service will validate the
patch effects, preview their resolved changes, and—only after acceptance—merge
them into the event's stored effect history and apply them atomically. Existing
DM-declared pending effects retain their current behavior. A rejected generated
effect never appears on the Event.

## Data and review flow

1. The DM invokes the generator from an eligible event card.
2. The service retrieves relevant canon, calls the provider with a structured
   schema, records paid usage even if the result is unusable, filters duplicate
   causal links/effects, and files a PENDING AI change set.
3. The Review Queue uses its existing structured effect editor and causality
   operation rendering. It shows resolved before/after previews for effects and
   normal per-operation decisions for causal links.
4. On approval, the effect operation validates live targets, locks, active
   persona state, and staleness, then updates the affected crawler or creates the
   drifted persona snapshot. Causality operations use the existing cycle and
   duplicate guards. All writes retain AI provider/model/prompt provenance.
5. Rejection or supersession leaves no generated effect rows or entity changes in
   canon.

## Error handling and safety

- DM/co-DM authorization, provider resolution, secret redaction, and spend-cap
  behavior follow existing generators.
- The service rejects missing, archived, or locked source events and reports a
  safe message. It also refuses a run with no usable effect targets or causal
  candidates.
- The generator never receives API keys, hidden prompt data, or arbitrary target
  ids. It receives only campaign-scoped canon exposed to the DM.
- Candidate filtering is defense in depth; `APPLY_EVENT_EFFECTS` and causality
  apply paths remain responsible for live lock, archived, active-persona,
  duplicate, and cycle checks.
- No model output can bypass the review service or mutate canon during generation.

## Testing

Pure tests cover schema bounds, prompt candidate restrictions, persona-aware
instructions, duplicate filtering, and conversion to self-contained effect plus
causality operations. DB-backed service tests cover authorization, missing
provider, locked inputs, usage/provenance, PENDING-only creation, successful
approval of crawler and persona effects, rejected generated effects leaving no
event history, duplicate/cycle filtering, and drift becoming stale or locked
before approval. Action/component tests cover the Timeline affordance, error
state, successful Review Queue handoff, provider gating, and locked-event
suppression.

## Documentation impact

`docs/04-ai-integration.md`, `docs/05-system-ai-persona.md`,
`docs/11-roadmap.md`, and `docs/PROGRESS.md` will move the bounded
event-consequence generator from M10 into a completed M6 slice. They will retain
new downstream-event creation and generic operation alias/dependency support as a
later M10 extension rather than implying that feature is complete.
