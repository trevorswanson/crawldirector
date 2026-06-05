# ADR 0005 — Campaign current floor and floor-numbering on FLOOR entities

- **Status:** accepted (delivered 2026-06-05)
- **Date:** 2026-06-05
- **Milestone:** M3 (events, timeline, causality)

## Context

The Crawl Timeline was redesigned (per the Claude Design mockup) from a centered
documentation-style changelog into a floor-banded broadcast spine: events group
under big floor headers (`FLOOR 09 · LARRACOS · ON AIR`), a left rail ladders the
dungeon `F01 → FNN` as a navigable spine and provenance filter, and the floor the
crawl is "currently on" gets live/ON-AIR styling. See
[`13-design-language.md`](../13-design-language.md) and
[`10-ui-ux.md`](../10-ui-ux.md).

Two pieces of state the timeline needs did not exist in the model:

1. **A floor's name and theme.** An event's floor is its `orderKey` (an `Int`,
   derived from `inGameTime.floor` — see [ADR 0004](./0004-event-time-model-and-ordering.md)).
   But `orderKey` is just a number; nothing tied it to the floor's name
   ("Larracos") or one-line theme ("Castle siege · the moat runs red").
2. **Which floor is current.** The only floor-ish field was `Crawler.currentFloor`
   (per-crawler progress). There was no campaign-level notion of the floor the
   broadcast is on, so "ON AIR" had nowhere to read from.

## Decision

**Floor metadata lives on FLOOR-type entities, in `Entity.data`.** A FLOOR entity
carries `data.floorNumber` (the integer that matches event `orderKey`) and
`data.theme`. This reuses the existing `Entity.data` JSON convention for
type-specific attributes (mirrors `data.itemTypeId` for ITEM entities) rather
than adding a typed sub-model. Floors per campaign are few (~18), so an index is
unnecessary. The timeline maps each floor band's `orderKey` to its FLOOR entity
by `floorNumber`; a floor with no FLOOR entity (or no number) still bands its
events under a number-only header (`FLOOR 0N`).

Like any `data.*` field, `floorNumber`/`theme` are authored through the review
pipeline (registered in `dataFields` and the entity create/update appliers in
[`review.ts`](../../src/server/services/review.ts)) and editable on the FLOOR
entity's detail page.

**The campaign references its current floor by entity.** `Campaign.currentFloorId`
is a nullable FK to the chosen FLOOR `Entity` (`onDelete: SetNull`).
`setCampaignCurrentFloor` ([`campaigns.ts`](../../src/server/services/campaigns.ts))
is a direct, audited campaign setting — not canon, not routed through review
(parallel to `setEventLock`) — DM/co-DM only. The current floor *number* is
resolved from that entity's `data.floorNumber`.

`listCampaignFloors` ([`events.ts`](../../src/server/services/events.ts)) stitches
these together for the timeline: the dungeon **ladder** (`1 → deepest known`,
with `reached`/`logged`/`current` flags), named/themed floor **descriptors**, the
**current floor**, and the **live event** (newest event on the current floor).
Everything is visibility-scoped — players never see secret events or DM-only
FLOOR entities, so their ladder counts and floor names reflect only what they can
see.

## Consequences

- The timeline reads as a descent with no schema gymnastics: floor order is still
  the derived `orderKey` (ADR 0004); names/themes are just resolved metadata.
- Without an explicit current floor, the ladder's "reached" line falls back to the
  deepest floor that has events, so the descent still renders sensibly.
- A DM gets the full picture by (a) creating FLOOR entities and setting their
  number/theme, then (b) picking the current floor from the timeline rail.
- `data.floorNumber` is not unique-constrained; if two FLOOR entities claim the
  same number the first one wins for band naming. Acceptable for a small, DM-
  curated set; can be tightened later if it bites.
- **Inferred floor day-ranges** are computed client-side from events on the
  *absolute* time axis only (`COLLAPSE` / `ABSOLUTE_DAY`, where day = offset).
  Floor-relative anchors (`FLOOR_START` / `FLOOR_COLLAPSE`) are intentionally not
  converted — ADR 0004 is explicit that the two axes can't be mixed without
  floor-duration data we don't model. A floor with no absolute-dated events shows
  no range. The natural extension is a `data.startDay` ("floor opens" anchor) on
  FLOOR entities — the same `data.*` plumbing as `floorNumber` — which would let
  `FLOOR_START` offsets resolve to absolute days and the floor-1→N chain fill in.
  Deferred as a follow-up.
