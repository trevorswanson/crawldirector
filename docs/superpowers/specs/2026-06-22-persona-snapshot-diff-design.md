# Persona Snapshot Diff Design

## Goal

Make the Persona Studio show how the selected System AI snapshot changed from
the immediately preceding snapshot, so a DM can read the persona arc without
manually comparing forms or compiled prompts.

## Scope

This is the next incremental M6 slice: richer snapshot diffing. It changes only
the DM-only Persona Studio read surface. It does not add a schema migration,
write path, new generator, or new event-effect behavior.

## User experience

The existing console-shell Persona Studio and snapshot timeline stay in place.
The selected snapshot remains the focus of the page; the selected snapshot is
the active one by default, as it is today.

Directly below the studio introduction and above the editor, a compact panel
appears when the selected snapshot has a predecessor. Its heading is:

```
CHANGED SINCE <predecessor label>
```

The predecessor is the next older snapshot in the entity's chronological
history. The service continues returning the timeline newest-first, so the page
uses the following item in that ordered list. Snapshot labels fall back to
"Untitled snapshot" in headings and timeline entries.

Only changed fields render. Dial rows use before/after values rather than a
signed delta:

```
Compliance  57 → 42
Resentment  43 → 63
```

Known dials render in `PERSONA_DIAL_KEYS` order. A non-standard stored dial, if
present, follows the known dials in lexical order. A dial introduced or removed
between snapshots displays `— → value` or `value → —`; this keeps historic,
generic profile data legible without treating absence as zero.

The panel includes an **Agendas** section only when agenda membership changed.
Added agendas display with the existing `--add` token and a `+`; removed agendas
display with `--del` and a `-`. Overt and secret agendas are compared independently:
an agenda text changing visibility is rendered as one removal and one addition,
never leaked into a player surface. This is a concise explanation of why a
persona has changed, not a generated causal narrative.

The same panel renders concise before/after rows when any of the following
fields change: label, values, resources, knowledge scope, voice guide,
constraints, compiled prompt, locked, or prompt-locked state. List-like fields
use additions/removals; scalar fields use `before → after`; resources compare by
key and show added, removed, or changed values. Long prose values are truncated
in the summary and retain their complete text in an accessible `title`/
description so the panel remains scan-friendly. The compiled-prompt row is a
changed/unchanged indicator, not a full prompt diff—the stored prompt panel is
already the canonical full-text view.

For the oldest snapshot, the panel says that it is the first recorded snapshot
and has no earlier snapshot to compare. It renders no empty field sections.
For a new unsaved snapshot, the diff panel does not render.

## Architecture

A new pure module owns the typed comparison result and never imports Prisma or
React. It accepts two `PersonaSnapshotView`-compatible values and returns a
stable display model: dial before/after rows, agenda additions/removals split by
visibility, resource rows, scalar rows, and the boolean that determines whether
the panel has meaningful changes.

`getPersonaStudio` remains the DM-only service boundary and requires no new
query: it already returns every non-archived snapshot for the selected System
AI entity newest-first. The server page selects the predecessor for the selected
snapshot and calls the pure comparator. A focused presentational component
renders the comparison model with the established Persona Studio console
primitives and existing CSS tokens (`--add`, `--del`, `--line`, `--ink-*`). It
does not hardcode colors.

## Error handling and safety

The comparator normalizes stored JSON through the existing persona normalizers.
Malformed legacy JSON produces an empty normalized collection rather than an
exception. Equality is deterministic: trimmed agenda and list strings compare
by value, resource keys compare literally, and all output ordering is stable.
The UI is DM-only because the existing Persona Studio page is DM-gated; no new
route, action, or data projection is introduced. Secret agendas are displayed
only inside that existing DM-only surface.

## Tests

Pure tests prove canonical dial ordering, before/after rendering data,
introduced/removed values, agenda additions/removals (including a secret/overt
visibility change), resources, changed scalar fields, no-op snapshots, and
malformed data normalization.

Service/page tests prove that the selected snapshot receives its immediate
chronological predecessor, the first snapshot receives the explicit empty
state, and a new unsaved snapshot receives no diff. Component tests assert
token-backed addition/removal semantics, accessible labels, no unchanged rows,
and the exact `before → after` presentation.

## Out of scope

- Arbitrary two-snapshot comparison controls.
- A multi-snapshot trend or arc dashboard.
- AI-generated explanations for persona shifts.
- AI-proposed persona drift, event-consequence generation, or additional
  persona-aware generator families.
- Changes to persona canon, review operations, provenance, locks, or schema.
