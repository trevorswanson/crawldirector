# 06 — Entity Agents & Multi-Agent Simulation (signature feature)

> The [System AI persona engine](./05-system-ai-persona.md) gives one entity a
> set of values + a voice that drive generation. This feature **generalizes that
> machinery to every major entity** — factions, sponsors, corporations, gods/Old
> Ones, show hosts, and crawlers — and adds a **simulation runtime**: subagents
> that role-play each entity and **propose believable actions and events based on
> that entity's values**.
>
> Like everything else, agent output is never canon. Each simulated action lands
> as a **PENDING proposal** (events, relationship shifts, state deltas, causal
> links) the DM reviews, edits, and approves. This is how a DM populates an
> enormous, interconnected world without hand-authoring every move — while still
> owning every outcome.

This is built directly on the [review pipeline](./03-review-pipeline.md), the
[events & causality graph](./01-domain-model.md), the [AI
integration](./04-ai-integration.md), and the persona model from doc 05. The
System AI is simply the flagship agent; the same parts power the rest.

## Two layers

1. **Agent profile** *(who an entity is)* — a generalized persona: values,
   goals, dispositions, resources, voice, constraints. A versioned, reviewable,
   lockable snapshot attached to any entity (the same `PersonaSnapshot` model as
   doc 05, broadened). Cheap to add; useful even without simulation, because it
   documents motivation and feeds persona-aware flavor generation.
2. **Agent runtime** *(what an entity does)* — subagents that, given a profile +
   scoped world context + a trigger, propose in-character actions and the events
   they cause. Heavier; the simulation engine.

## The agent profile (generalized persona)

Applies to any "actor" entity. The dial/value set is **per entity type** (stored
as flexible JSON; suggested schemas live in `/src/lib/agentProfiles`):

- **Faction** — ambition, aggression, loyalty/cohesion, ideology, resources,
  risk tolerance, current standing/score.
- **Sponsor / Corporation** (e.g. Borant) — profit motive, brand image,
  ruthlessness, risk appetite, regulatory exposure, solvency pressure.
- **Deity / Old One** — alienness, capriciousness, patience, domain/sphere,
  interest in crawlers, what it wants from the dungeon.
- **Show host** (e.g. the Maestro, Odette) — showmanship, sadism/benevolence,
  audience focus, favoritism, network agenda.
- **Crawler (NPC)** — bravery, morality, loyalty, ambition, self-preservation,
  fame-seeking. (PCs are usually player/DM-driven; simulation is opt-in per
  crawler — handy for absent players or background rivals.)
- **System AI** — the doc-09 dial set, plus its unique role of also driving
  global generation prompts.

Every profile also carries: **goals** (overt + secret/DM-only), **resources /
capabilities** (what the entity can actually do), **constraints** (hard rules
the DM never wants violated), **voice**, and a **knowledge scope** setting (see
fog of war below). Profiles are `PersonaSnapshot`s — versioned over campaign
time, reviewable, and lockable.

## The agent runtime (subagents)

An **agent action run** = one or more LLM calls behind the provider abstraction
([`04-ai-integration.md`](./04-ai-integration.md)), where the model is briefed to
*be* the entity:

```
input:  active profile snapshot
      + scoped world context (its relationships, resources, recent relevant
        events, active goals)            // respecting knowledge scope + locks
      + trigger ("what do you do next?" | "how do you react to event E?")
      + campaign style guide + constraints
output: structured proposed actions  →  a Change Set (PENDING)
        - new Event(s) with this entity as ACTOR (+ participants)
        - relationship / disposition shifts (e.g. RIVAL_OF strengthens)
        - state deltas (resources spent, standing changed)
        - optional PERSONA_SHIFT on itself
        - causal links (causedBy the trigger event)
```

- **Provider-agnostic.** An "agent" is a briefed generation call. With providers
  that support it (e.g. the Claude Agent SDK), multiple entity-agents can run as
  **parallel subagents**, each sandboxed to one entity's perspective; with others
  the orchestrator runs them sequentially. The abstraction hides the difference.
- **Structured output + validation** as elsewhere; parse failures retry then
  surface, never partial canon.
- **Provenance** records the acting entity, its profile snapshot version, prompt
  template version, run id, and model — so a DM can see "this betrayal was
  proposed by the Faction-X agent under its ‘desperate, losing the war' profile."

### Run modes

1. **Single act** — "What does Faction X / the Maestro / this god do next?" One
   agent, one proposal.
2. **Reactive cascade** — when an event is approved, optionally prompt the
   *affected* entity-agents (via participant + relationship edges) to react,
   producing follow-on events linked `causedBy` the trigger. This is how the
   causality web grows organically — but **bounded**.
3. **World tick** — advance the world one step: a DM-selected set of agents each
   act (aware of each other, either simultaneously or seeing prior actions in the
   tick). Produces a batch of proposed events + shifts reviewed as one run.
4. **Scenario / "what-if"** — run a hypothetical (e.g. "simulate week one of the
   Floor-9 Faction Wars") to brainstorm; results are flagged experimental.

### Fog of war (knowledge scoping)

For realism, an agent's context can be restricted to **what its entity plausibly
knows** — derived from `KNOWS_ABOUT` edges, shared/visible canon, and events it
witnessed — so a faction doesn't scheme using secrets it could never have. The DM
toggles **omniscient** (sees all canon) vs. **in-character** knowledge per run.
This is distinct from player visibility; it shapes *believable* behavior.

## Guardrails (must hold)

- **Nothing is canon.** Every agent action is a PENDING proposal; the DM
  approves/edits/rejects. (The whole point — restated.)
- **Bounded cascades.** Reactive runs and world ticks have max depth, max actions
  per run, and a fan-out cap; large/expensive runs require DM confirmation and
  respect spend caps. No runaway simulation.
- **Locks respected.** Agents never silently modify locked targets; such changes
  surface as *blocked* operations.
- **Consistency.** Agents receive canon + style guide + constraints; the
  non-mutating consistency-check generator (M8) can sweep a run for
  contradictions and propose fixes.
- **Determinism/repro.** Provenance captures profile snapshot, prompt version,
  temperature/seed, and run id so a run can be understood and re-created.
- **Player boundaries.** NPC agents enrich what players experience; profiles,
  values, goals, and secrets are DM-only (visibility projection). PC crawlers are
  not auto-simulated unless the DM opts in.

## Why this is powerful for DCC specifically

DCC's drama *is* the interplay of motivated actors at scale: nine factions
warring over Larracos, corporations gaming the broadcast, gods meddling, hosts
manufacturing spectacle, the System AI scheming. Modeling each as a values-driven
agent and letting them propose actions turns "I need to invent what everyone is
doing this week" into "review what my world's actors plausibly did" — with the
causal web populating itself, under the DM's control.

## Data model touchpoints

- `PersonaSnapshot` generalized to any entity (add `values`, `resources`,
  `knowledgeScope`; `agendas` already covers goals; dials are per-type JSON).
- `Entity.agentEnabled` flag to mark which entities participate in simulation.
- Simulation runs use the `Job` table (`kind: AGENT_SIM | WORLD_TICK | SCENARIO`)
  and emit Change Sets; actions become `Event`s (actor via `EventParticipant`)
  with `EventCausality` links — no fundamentally new tables. See
  [`07-data-schema.md`](./07-data-schema.md).

## Build sequencing

- **M5** lays the *generic* profile foundation (persona snapshots usable by any
  entity, authored in the studio), shipped alongside the System AI flagship.
- **M9** delivers the *runtime*: agent action runs, reactive cascades, world
  ticks, and fog-of-war — since it depends on events/relationships (M3), AI
  generation (M4), profiles (M5), and pairs naturally with the event-consequence
  generator (M8). See [`09-roadmap.md`](./09-roadmap.md).
