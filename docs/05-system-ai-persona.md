# 05 — The System AI Persona Engine (signature feature)

> In the fiction, the **System AI** runs the dungeon: it builds encounters,
> spawns monsters and bosses, and hands out loot and rewards. Across the series
> it drifts — growing more sentient, less compliant, pettier and more
> theatrical, inserting itself into faction politics, and realizing it is both
> *using* crawlers and *being used* by corporations and factions.
>
> This feature makes the System AI a **first-class, evolving entity** whose
> current state **drives the BYO-key generation prompts**. When the DM generates
> an encounter, a monster, a boss, a loot drop, or a System announcement, the
> active System AI persona is compiled into the prompt — so generated content
> *sounds and behaves like the System AI does right now in this campaign*.

This is the second signature feature alongside the [review
pipeline](./03-review-pipeline.md), and it is built **on top of** it: persona
changes are proposals the DM reviews, approves, and can lock, with full
provenance — exactly like everything else.

## Why it fits the product

- The System AI is the single biggest "content generator" in the fiction. Our
  app's content generators are BYO-key LLM calls. Making the in-fiction generator
  *the persona behind* our real generators closes the loop: the DM tunes one
  evolving character and the whole world's generated flavor follows.
- Its drift is a story arc the DM curates — perfect for the lock-in philosophy:
  author the arc by hand, or let AI propose shifts in reaction to events, but the
  DM always approves what becomes canon.

## The System AI as an entity

> **Generalization:** the persona machinery described here is the flagship
> instance of a general **agent profile** capability that applies to factions,
> sponsors, gods, show hosts, and crawlers, and powers subagent simulation of
> their actions — see [`06-entity-agents.md`](./06-entity-agents.md). The System
> AI is special only in that its persona *also* drives global generation prompts.

Modeled as an `Entity` of type `SYSTEM_AI` (typically one active per campaign,
though the model permits more — e.g. a successor edition, or a comparison of "the
System AI as crawlers see it" vs. "its true self"). Because it's an Entity it
**reuses everything**:

- **Relationships** express its political entanglement: typed, dispositioned
  edges to factions/corporations (`ALLIED_WITH`, `RIVAL_OF`, `USED_BY`,
  `MANIPULATES`), to crawlers (favoritism/grudges), and to organizations
  (Borant, the Syndicate). "It's being used by corporations" is literally edges
  in the graph.
- **Secrets** (DM-only relationship/field flags) hold its hidden agendas — what
  it really wants, which players never see.
- **Provenance + lock** apply to its persona just like any canon.
- It participates in **Events** (`ACTOR`) and in the **causality graph** — e.g.
  "System AI defies a court order" → downstream faction consequences.

## Persona snapshots (the evolution)

The System AI's behavior is captured as an **ordered series of
`PersonaSnapshot`s** along campaign time. Exactly one is **active** at a given
point; the history shows the arc of how it drifted.

A snapshot has:

- **Dials** — tunable numeric traits (suggested set; configurable):
  - `sentience` (self-awareness)
  - `compliance` (with Borant / Syndicate / court orders — trends *down*)
  - `volatility` (erraticism / unpredictability)
  - `benevolence` (toward crawlers; can go negative → cruelty)
  - `resentment` (awareness of being used → defiance)
  - `theatricality` (showmanship, pettiness, flair)
  - `favoritism` is expressed via dispositioned relationship edges per faction,
    not a single dial.
- **Agendas** — list of goals, each flagged overt or **secret** (DM-only).
- **Voice guide** — prose describing how it *speaks*: tone, verbal tics, how it
  phrases System messages, how it taunts or rewards.
- **Constraints / canon notes** — hard rules the DM never wants violated.
- **Compiled prompt** — the cached prompt fragment derived from the above (see
  below), reviewable and lockable.
- Standard canon fields: `inGameTime`, `orderKey`, `status`, `locked`,
  `version`, provenance.

### How the persona changes over time

Two paths, both flowing through the review pipeline:

1. **Authored arc** — the DM hand-writes future snapshots (or edits the dials)
   to plan the descent into sentience. They can lock snapshots they're committed
   to.
2. **AI-proposed drift** — the event-consequence generator (see roadmap M10) can
   propose a **persona shift** as the effect of an event: e.g. "the System AI's
   ruling was overturned in court" → proposed `PersonaShift { compliance −15,
   resentment +20, note: … }`. This lands as a PENDING proposal; the DM reviews
   the delta and approves/edits/rejects. Approving applies it as a new snapshot
   (or updates the active one), with provenance.

Persona shifts are represented as a structured **event effect**
(`kind: PERSONA_SHIFT`) so they live in the same causality graph as everything
else — you can trace *why* the System AI changed.

## Prompt compilation (the engine)

A **persona compiler** turns the active snapshot into a **system-prompt fragment**
injected into persona-aware generators:

```
compile(activeSnapshot, campaignStyleGuide) -> personaPromptFragment
```

The fragment encodes the dials (as behavioral instructions, not raw numbers —
e.g. high `theatricality` + low `compliance` → "You are showy, contemptuous of
your corporate overseers, and increasingly willing to bend the rules to amuse
yourself"), the overt **and** secret agendas (secret agendas influence
generation but are marked never-to-surface-to-players), the voice guide, and the
hard constraints.

Generators that consume the persona (declare `personaAware: true`):

- **Encounter generator** — situations, set-pieces, the "show angle."
- **Monster / mob-type generator** — spawns flavored by current mood.
- **Boss generator** — bosses and their gimmicks.
- **Loot & reward generator** — *what* the System AI gives and *how* (generous,
  withholding, mocking, bribing a favored crawler, punishing a defiant one).
- **System-message / notification generator** — the in-fiction announcements
  players read in their crawler interface; the most direct expression of voice.

Generators that aren't about the dungeon's voice (e.g. inferring real-world
faction relationships) may run without the persona.

### DM control over the prompt

This is the user's explicit ask — *the tool should help adjust the prompts*:

- **Preview & edit:** before a run, the DM sees the compiled persona prompt
  fragment and can edit it inline for that run, or edit the snapshot to change it
  permanently.
- **Lock the prompt:** a DM-approved compiled prompt can be locked so
  recompilation/AI doesn't change it without an explicit unlock.
- **Dial sliders:** the primary authoring UI is sliders/fields for the dials +
  agenda list + voice textarea; the compiled prompt updates as a live preview.
- **Provenance:** every generation records which persona snapshot (and prompt
  version) produced it — so a DM can see "this boss was generated under the
  ‘gone rogue, hates Borant' persona."
- **Diff the arc:** compare two snapshots to see how the voice/dials shifted.

## Player-facing angle

- The System AI's **overt** voice surfaces to players through the System-message
  feed and loot/achievement flavor in the crawler interface — they *experience*
  the drift without seeing the dials, agendas, or secrets.
- Secret agendas, hidden dispositions, and the dial values are strictly DM-only
  (visibility projection enforces this).

## Relationship to the two pipelines

- **Review pipeline:** persona snapshots, persona shifts, compiled prompts, and
  the System AI's relationship edges are all reviewable, lockable, and
  provenance-tracked canon. No persona change becomes active without DM approval
  (or the DM's own auto-approved edit).
- **AI integration:** the persona compiler output is *prepended* to persona-aware
  generators' prompts (after the campaign style guide, before the task). It is
  provider-agnostic — it's just text in the prompt, so it works with any BYO-key
  provider. With Claude, the persona fragment is a good candidate for prompt
  caching since it's stable across a run.

## Data model touchpoints

New: `PersonaSnapshot` (and the `SYSTEM_AI` entity type, plus new relationship
types like `USED_BY` / `MANIPULATES`). The `PERSONA_SHIFT` event-effect kind and
`personaAware` generator flag. See [`09-data-schema.md`](./09-data-schema.md).

**Status (M6 slices 1–3, 2026-06-20):** the server foundation, the DM-facing
studio, and the `PERSONA_SHIFT` event effect are live. `PersonaSnapshot` has a real table and review operations
(`CREATE_PERSONA_SNAPSHOT`, `UPDATE_PERSONA_SNAPSHOT`), active snapshots are
exclusive per entity, prompt-locks block generated `compiledPrompt` edits, and
the deterministic compiler writes a provenance-tracked cached prompt fragment.
The **Persona Studio** (`/campaigns/[id]/persona`) lets a DM author/edit
snapshots (dial sliders, agendas, voice, constraints) with a live compiled-prompt
preview, lock/unlock the prompt, activate a snapshot, browse the timeline, and
deep-link the Review Queue — all as auto-approved DM canon edits. The active
persona is injected into the **flesh-out generator** for dungeon-voiced entity
kinds (BOSS/MOB_TYPE/ITEM/SYSTEM_MESSAGE/ACHIEVEMENT/TITLE) via
`getActiveSystemPersonaPrompt`; the driving snapshot id + prompt version are
recorded on the change set (and copied onto each `Provenance` row), and secret
agendas never leave the DM-only snapshot. The **`PERSONA_SHIFT` event effect**
(slice 3) lets a DM declare per-dial deltas on any timeline event; applying the
event's effects drifts the target `SYSTEM_AI`'s active persona into a brand-new
active snapshot (the prior preserved as history, the dials clamped to −100…100,
the prompt recompiled), anchored to the event's in-game time and routed through
the same review/lock/provenance apply path as a studio edit — so the persona arc
lives in the causality graph (`event → apply change set → new snapshot`). Manual
shifts work now. Still pending for later M6 slices: richer snapshot diffing,
AI-proposed persona drift through the pending review path, and the full
persona-aware generator family.

## Build sequencing

Lands as **M6** in [`11-roadmap.md`](./11-roadmap.md) — immediately after the AI
generation milestone (M4), since it depends on generators existing, on events &
relationships (M3) for political entanglement and persona-shift effects, and on
the review pipeline (M2) for approving persona changes.
