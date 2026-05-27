# 08 — Live Session Mode & Recaps

> The rest of the plan is about *modeling* the world. This is about *running it
> at the table*. Session mode is a low-friction way to capture what happens
> during live play and turn the good bits into canon — and, because *Dungeon
> Crawler World* is a broadcast, to generate "previously on…" recaps that delight
> players and keep everyone oriented across a sprawling campaign.

## The workflow gap it fills

During a session a DM is busy running the game, not editing entities. They need
to **jot things down fast** ("Donut insulted the Maestro on air; +sponsor drama")
and reconcile them into the model **later**, deciding which moments are
canon-worthy. Without this, either nothing gets recorded or the DM context-
switches out of running the game.

## Sessions

A **Session** is a play session: date, the players/crawlers present, the
floor/area in focus, and freeform prep + notes. Sessions give the campaign a
human-scale spine (most DMs think in "last session / next session").

## The session log (capture)

- A **running log** of timestamped entries the DM (or co-DM) types during play —
  quick, freeform, optionally tagged to existing entities (`@Carl`, `#Floor7`).
- Entries are **scratch, not canon.** They don't enter the graph until promoted.
- **Promote to canon:** the DM turns a log entry (or several) into a canonical
  **Event** (with participants, causal links, effects) through the normal
  [review pipeline](./03-review-pipeline.md) — `source: DM`, auto-approved but
  fully provenanced. The AI can *assist*: "draft Events from this session log"
  produces PENDING proposals the DM curates.
- Unpromoted entries stay as session history — useful, never cluttering canon.

## Live reveal (sharing at the table)

- During a session the DM can **reveal** an entity or fact to players — flipping
  its visibility to `SHARED_WITH_PLAYERS`/`PLAYER_FACING` — and it appears in
  their crawler interface ([`10-ui-ux.md`](./10-ui-ux.md)) right away.
- Each reveal is **logged**: *what* players learned and *when*. This reveal
  history is the principled source for the player interface's "known world" and
  complements agent fog-of-war ([`06-entity-agents.md`](./06-entity-agents.md)) —
  the app always knows the gap between canon and what each table knows.
- Reveals are audited like any visibility change; nothing secret leaks by
  accident.

## Recaps & broadcasts (on-theme generation)

DCC is literally a TV show, so recaps aren't just utility — they're flavor.

- **Session recap** — generate a "previously on *Dungeon Crawler World*" summary
  from the session log + the events promoted that session.
- **Per-crawler recap** — a spotlight of what *that* player's crawler experienced
  (great for absent players and for immersion); respects visibility so it only
  includes what that player would know.
- **In-fiction broadcast** — optionally render the recap in a show voice — the
  System AI's announcements or a host's (the Maestro, Odette) commentary. This is
  a **persona-aware** generator ([`05-system-ai-persona.md`](./05-system-ai-persona.md),
  [`06-entity-agents.md`](./06-entity-agents.md)), so the recap *sounds like the
  show right now*.
- Recaps are generated content: a DM can keep them ephemeral, publish them to
  players (as a `SYSTEM_MESSAGE`/Show artifact via the review pipeline), or both.

## Guardrails

- **Capture is not canon.** Log entries never touch the graph until promoted
  through review — so the table's messy real-time notes never pollute canon.
- **Reveals are deliberate and audited.** Visibility only changes via explicit DM
  action, logged.
- **Recaps respect visibility.** Player-facing recaps are built from the
  player-visible projection; they cannot surface DM-only or pending content.

## Data model touchpoints

`Session` and `SessionLogEntry` (with an optional link to the promoted `Event`);
reveals recorded on the audit/reveal log; recaps optionally persisted as
generated artifacts. See [`09-data-schema.md`](./09-data-schema.md).

## Build sequencing

Lands as **M8** in [`11-roadmap.md`](./11-roadmap.md) — after the events graph
(M3), the player interface (M7), and the persona engine (M6, for in-voice
recaps). Basic capture + promote can come first; recaps and live reveal layer on.
