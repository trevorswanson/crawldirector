-- ADR 0004 — event time model, slice 2: typed `timeRef`.
-- `Event.inGameTime` stays `Jsonb`; only its *shape* changes. Pre-slice-2 rows
-- held `{ floor?, label? }`; the typed `TimeRef` adds a `basis` (and optional
-- `offset`/`unit`/`anchorEventId`). Backfill the basis from the data we have: a
-- floor implies FLOOR_START (time after the floor opened — the only flavor the
-- old shape could express), otherwise UNSCHEDULED. The old free `label` is
-- preserved verbatim as the optional phrasing override, so nothing renders
-- differently on day one.
--
-- Data-only migration: `rank` already landed in slice 1 and no column changes
-- here, so this is invisible to the schema/drift check.
UPDATE "Event"
SET "inGameTime" = "inGameTime" || jsonb_build_object(
  'basis',
  CASE WHEN ("inGameTime" ? 'floor') THEN 'FLOOR_START' ELSE 'UNSCHEDULED' END
)
WHERE jsonb_typeof("inGameTime") = 'object'
  AND NOT ("inGameTime" ? 'basis');
