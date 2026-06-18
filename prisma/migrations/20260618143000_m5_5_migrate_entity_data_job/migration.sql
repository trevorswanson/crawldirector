-- ADR 0011 Part D: mechanical Entity.data schema migrations are recorded as
-- their own provenance source and run through the existing async Job queue.
ALTER TYPE "ChangeSource" ADD VALUE IF NOT EXISTS 'MIGRATION';
ALTER TYPE "JobKind" ADD VALUE IF NOT EXISTS 'MIGRATE_ENTITY_DATA';
