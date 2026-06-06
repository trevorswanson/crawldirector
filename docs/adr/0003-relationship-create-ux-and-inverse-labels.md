# ADR 0003 — Relationship create UX (target-first, ranked types) + typed inverse labels

- **Status:** accepted (delivered)
- **Date:** 2026-05-31
- **Milestone:** M3 (refinement of the connections panel)

## Context

> Delivery note: this ADR is implemented in
> [`src/lib/relationship-types.ts`](../../src/lib/relationship-types.ts) and the
> `ConnectionsPanel` target-first add/edit forms. The deferred items below remain
> intentionally out of scope.

The "Add connection" form on the entity detail page
([`src/components/entities/connections-panel.tsx`](../../src/components/entities/connections-panel.tsx))
currently presents two flat `<select>` dropdowns:

1. **Relationship type** — all 35 `RelationshipType` values
   ([`src/lib/validation.ts`](../../src/lib/validation.ts) `relationshipTypeValues`)
   in one ungrouped list, defaulting to `ALLY_OF`.
2. **Target entity** — every other entity in the campaign, in one ungrouped list.

Two problems:

- **Type overload.** Most of the 35 types are irrelevant for any given pairing.
  Picking `OWNS_ITEM` only makes sense when the target is an `ITEM`; `BOSS_OF`
  only when the target is a `FLOOR`; etc. The flat list forces the DM to scan all
  35 every time.
- **Target list won't scale.** A campaign with hundreds of entities makes the
  target `<select>` unusable.

Separately, the panel renders the **same type string in both directions**. From
the source's page you see `Carl --OWNS_ITEM--> Ring` (clear). From the target's
page the same edge reads `Ring <--OWNS_ITEM-- Carl`, which is awkward — on the
Ring's page the natural phrasing is `Ring --OWNED_BY--> Carl`.

### Constraint from the domain model

[`01-domain-model.md`](../01-domain-model.md) is deliberate that relationships are
**any-to-any** and that `RelationshipType` is "a semantic label, not a structural
constraint; the schema never forbids an edge by type." It explicitly wants the
weird edges DCC throws up (`guild RIVAL_OF a god`, `sponsor MANIPULATES the
System AI`) to remain expressible, and says:

> Type-appropriateness is handled softly in the UI (sensible defaults and
> warnings), never as a hard schema rule.

So any filtering UX must **rank, not forbid** — every type stays reachable.

## Decision

Introduce a single in-code **relationship-type metadata registry** that drives
three things at once: type grouping, applicability ranking, and directional
display labels. Then rework the create form to be target-first with ranked types,
and make the connections panel direction-aware.

**No database migration is required for either feature.** The `RelationshipType`
enum and the `Relationship` table are unchanged. Both features are pure
presentation/UX powered by the registry. (Inverse labels are *never* stored as
edges — `OWNED_BY` is a display string, not a new enum value.)

### 1. Relationship-type metadata registry

A new module (proposed: `src/lib/relationship-types.ts`) exports one descriptor
per `RelationshipType`:

```ts
type RelationshipGroup =
  | "AFFILIATION" | "POWER" | "SOCIAL" | "SPATIAL" | "GAME" | "NARRATIVE";

type RelationshipTypeMeta = {
  type: RelationshipType;
  group: RelationshipGroup;
  forwardLabel: string;       // shown on the SOURCE's connections panel
  inverseLabel: string;       // shown on the TARGET's connections panel
  symmetric?: boolean;        // reads the same both ways (inverse == forward)
  sourceTypes: EntityType[];  // typical source types; [] = any
  targetTypes: EntityType[];  // typical target types; [] = any
};
```

`relationshipTypeValues` in `validation.ts` stays the source of truth for the
enum; the registry is keyed off it (a compile-time check asserts every value has
exactly one descriptor).

**Applicability** is a soft predicate, not a gate:

```ts
isSuggested(meta, sourceType, targetType) =
  (meta.sourceTypes.length === 0 || meta.sourceTypes.includes(sourceType)) &&
  (meta.targetTypes.length === 0 || meta.targetTypes.includes(targetType))
```

Suggested types are ranked by **specificity** — +1 for each endpoint the type
names explicitly (vs. an "any" wildcard) — so `OWNS_ITEM` (CRAWLER→ITEM, score 2)
leads over `RIVAL_OF` (any→any, score 0). The top-ranked type is the preselected
default. All other types remain reachable. **Nothing is ever hidden** — this
honors the "ranked, not forbidden" constraint above.

### 2. Inverse (directional) display labels

Each descriptor carries both `forwardLabel` and `inverseLabel`. The connections
panel chooses which to show based on the edge's direction relative to the entity
whose page you're on:

- Outbound edge (current entity is the **source**) → `forwardLabel`.
- Inbound edge (current entity is the **target**) → `inverseLabel`.
- `symmetric: true` types use `forwardLabel` for both.

So Carl's page shows `OWNS_ITEM → Ring`; the Ring's page shows
`OWNED_BY → Carl` for the very same stored row. The arrow-rotation already in the
panel stays; only the label string changes.

Seed inverse labels (directed types):

| Type | forward | inverse |
| --- | --- | --- |
| `MEMBER_OF` | member of | has member |
| `LEADS` | leads | led by |
| `SPONSORS` | sponsors | sponsored by |
| `EMPLOYS` | employs | employed by |
| `PARENT_ORG_OF` | parent org of | subsidiary of |
| `USED_BY` | used by | uses |
| `MANIPULATES` | manipulates | manipulated by |
| `CONTROLS` | controls | controlled by |
| `DEFIES` | defies | defied by |
| `MENTOR_OF` | mentor of | mentored by |
| `MANAGES` | manages | managed by |
| `LOVES` | loves | loved by |
| `OWES` | owes | owed by |
| `LOCATED_ON` | located on | hosts |
| `PART_OF` | part of | contains |
| `CONTAINS` | contains | contained in |
| `BOSS_OF` | boss of | has boss |
| `SPAWNS_ON` | spawns on | spawn site for |
| `HAS_CLASS` | has class | class of |
| `HAS_SPECIES` | has species | species of |
| `OWNS_ITEM` | owns item | owned by |
| `KNOWS_SKILL` | knows skill | known by |
| `EARNED_ACHIEVEMENT` | earned | earned by |
| `HOLDS_TITLE` | holds title | held by |
| `APPEARS_ON` | appears on | features |
| `KNOWS_ABOUT` | knows about | known by |
| `BETRAYED` | betrayed | betrayed by |
| `KILLED` | killed | killed by |
| `SAVED` | saved | saved by |

Symmetric types (forward == inverse): `ALLIED_WITH`, `RIVAL_OF`, `AT_WAR_WITH`,
`ALLY_OF`, `ENEMY_OF`, `FAMILY_OF`.

Representative applicability seeds (`sourceTypes → targetTypes`):

- `OWNS_ITEM`: `CRAWLER, NPC, PARTY` → `ITEM`
- `HAS_CLASS`: `CRAWLER, NPC` → `CLASS`
- `MEMBER_OF`: `CRAWLER, NPC, PARTY` → `PARTY, GUILD, FACTION, ORGANIZATION`
- `BOSS_OF`: `BOSS` → `FLOOR`
- `SPONSORS`: `SPONSOR, FACTION, ORGANIZATION` → `CRAWLER, PARTY, GUILD, SHOW`
- `LOCATED_ON`: `LOCATION, NEIGHBORHOOD, BOSS, NPC` → `FLOOR`
- `KNOWS_ABOUT`: `[any]` → `[any]`

(Full table authored alongside the registry; values above set the shape.)

### 3. Reworked "Add connection" flow (target-first)

1. DM clicks **Add connection**.
2. **Entity search field** (typeahead over candidates) replaces the flat target
   `<select>`. The DM searches and picks the target. This scales and is the
   primary reordering of the flow — *target first*.
3. Once a target is chosen, its `EntityType` is known and the type control
   appears **collapsed to the Suggested group only** (specificity-ranked, with
   the top type preselected) plus a final **"Show all relationship types…"**
   option. Selecting it expands the picker to every type grouped by
   `RelationshipGroup` (Affiliation / Power / Social / Spatial / Game /
   Narrative), with a "Show suggested only" affordance to collapse back. This
   keeps the common case to a 3–4 item list while leaving everything one step
   away.
4. If the DM picks a type outside the suggested set, show a **soft inline note**
   ("Unusual pairing — allowed, just uncommon"), never a block.
5. Existing `secret` / `disposition` / `notes` inputs and submit are unchanged.

## Consequences

- **Zero schema churn.** `RelationshipType`, `Relationship`, and the
  `createRelationshipSchema` Zod validator are untouched. The server action still
  accepts any type for any pairing — the soft UX lives entirely client-side.
- **One registry, two features.** Grouping, applicability ranking, and inverse
  labels share a single source of truth, so adding a future relationship type
  means adding one descriptor (enforced by the exhaustiveness check).
- **Principle preserved.** Ranking-not-hiding keeps `01-domain-model.md`'s
  any-to-any intent intact; the registry encodes the "sensible defaults and
  warnings" the doc already called for.
- **Graph view alignment.** The same inverse-label logic should be reused by the
  campaign relationship-graph view (10-ui-ux.md) so edge labels read correctly
  from whichever node the DM inspects — noted for whoever builds that view.
- **Label authoring is subjective.** The seed forward/inverse strings are a
  starting point and will likely get wordsmithed; they live in one file, so that
  is cheap.

### Deferred (explicitly out of scope)

- **Per-edge display override.** A nullable `displayLabel` / `inverseLabel` on the
  `Relationship` row would let a DM hand-phrase one specific edge. This is the
  *only* part of either suggestion that would touch the schema. Type-level
  inverse labels cover the motivating case (Carl/Ring) fully, so we defer this;
  revisit only if real one-off phrasing needs appear.
- **Hard type constraints / validation by entity type.** Rejected on purpose —
  conflicts with any-to-any.

## References

- [`01-domain-model.md`](../01-domain-model.md) — relationships, any-to-any,
  "soft" type-appropriateness.
- [`09-data-schema.md`](../09-data-schema.md) — `RelationshipType`,
  `Relationship`, `EntityType`.
- [`10-ui-ux.md`](../10-ui-ux.md) — connections panel, relationship graph view.
- [`src/components/entities/connections-panel.tsx`](../../src/components/entities/connections-panel.tsx),
  [`src/lib/validation.ts`](../../src/lib/validation.ts) — current implementation.
