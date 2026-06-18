-- M5.5 (ADR 0011) slice 1 — stamp existing versioned-kind rows with `data._v = 1`.
--
-- `readKindData` already treats an absent/legacy `_v` as version 1, so the app is
-- correct without this. This is *convergence*, not correctness: it makes the
-- stored shape explicit so a future `schemaVersion` bump's MIGRATE_ENTITY_DATA job
-- (Part D) can find stale rows by comparing `_v`, rather than re-touching every
-- never-edited row forever. Only FLOOR and ITEM have entity-kind descriptors today
-- (the only types that carry versioned bespoke `data` fields); a type with no kind
-- is intentionally left unstamped. Idempotent: rows already carrying `_v` are
-- skipped, so a re-run (or a fresh DB whose seeds already wrote `_v` through the
-- indexed create path) is a no-op.
UPDATE "Entity"
SET "data" = jsonb_set("data", '{_v}', '1'::jsonb, true)
WHERE "type" IN ('FLOOR', 'ITEM')
  AND jsonb_typeof("data") = 'object'
  AND NOT ("data" ? '_v');
