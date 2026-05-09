-- Drop multi-row versioning on graphs.
--
-- Old model: one row per save, version increments per name, list shows
-- DISTINCT ON (name) ORDER BY version DESC. The id changed on every save,
-- which churned URLs and required a "delete all versions" cascade option.
--
-- New model: one row per workflow. Updates are in-place (id stays
-- stable). A new `archived_graphs` table stores explicit user snapshots
-- (Archive button, restore-from-archive flow). Older graph versions
-- already in the DB get auto-migrated into archives so no history is
-- lost.

-- ──────────────────────────────────────────────────────────────────────
-- Archive table
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS archived_graphs (
  id           UUID PRIMARY KEY,
  source_id    UUID,                         -- live graph id at time of archive (may be null after the source is deleted)
  name         TEXT NOT NULL,
  dsl          TEXT NOT NULL,
  parsed       JSONB NOT NULL,
  archived_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_archived_graphs_source ON archived_graphs (source_id);
CREATE INDEX IF NOT EXISTS idx_archived_graphs_name   ON archived_graphs (name);

-- ──────────────────────────────────────────────────────────────────────
-- Re-point references to non-latest versions before we collapse them.
-- triggers.graph_id and executions.graph_id both ON DELETE CASCADE today;
-- if we let the cascade fire when removing the older version rows we'd
-- lose execution history that's still meaningful. Repoint them to the
-- "live" (latest non-deleted) row of the same name first.
-- ──────────────────────────────────────────────────────────────────────
WITH live AS (
  SELECT DISTINCT ON (name) id, name
  FROM graphs
  WHERE deleted_at IS NULL
  ORDER BY name, version DESC
)
UPDATE executions e
   SET graph_id = live.id
  FROM graphs g
  JOIN live ON live.name = g.name
 WHERE e.graph_id = g.id
   AND g.id <> live.id;

WITH live AS (
  SELECT DISTINCT ON (name) id, name
  FROM graphs
  WHERE deleted_at IS NULL
  ORDER BY name, version DESC
)
UPDATE triggers t
   SET graph_id = live.id
  FROM graphs g
  JOIN live ON live.name = g.name
 WHERE t.graph_id = g.id
   AND g.id <> live.id;

-- ──────────────────────────────────────────────────────────────────────
-- Move older versions into archived_graphs. We keep the original UUID
-- as the archive id for lineage continuity (the row will be deleted
-- from graphs immediately afterwards, so no PK conflict).
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO archived_graphs (id, source_id, name, dsl, parsed, archived_at, reason)
SELECT g.id,
       NULL,                                          -- source_id is null (older versions had no stable parent)
       g.name,
       g.dsl,
       g.parsed,
       COALESCE(g.created_at, NOW()),
       'migrated from versioned schema (v' || g.version || ')'
  FROM graphs g
  LEFT JOIN (
       SELECT DISTINCT ON (name) id
       FROM graphs
       WHERE deleted_at IS NULL
       ORDER BY name, version DESC
  ) live ON live.id = g.id
 WHERE live.id IS NULL          -- keep only the rows we're collapsing
   AND g.deleted_at IS NULL;

-- Soft-deleted older versions also collapse into archives (so the user can
-- still see them if desired) but we don't restore them as live rows.
INSERT INTO archived_graphs (id, source_id, name, dsl, parsed, archived_at, reason)
SELECT g.id, NULL, g.name, g.dsl, g.parsed,
       COALESCE(g.deleted_at, g.created_at, NOW()),
       'migrated from versioned schema (deleted v' || g.version || ')'
  FROM graphs g
 WHERE g.deleted_at IS NOT NULL;

-- Now safe to remove the non-live (or fully-deleted) rows. The triggers
-- and executions that pointed at them have already been re-pointed.
DELETE FROM graphs g
 WHERE g.id IN (
   SELECT id FROM archived_graphs WHERE source_id IS NULL
 );

-- ──────────────────────────────────────────────────────────────────────
-- Schema changes — version column gone, name unique among live rows.
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE graphs DROP CONSTRAINT IF EXISTS graphs_name_version_key;
ALTER TABLE graphs DROP COLUMN     IF EXISTS version;

CREATE UNIQUE INDEX IF NOT EXISTS idx_graphs_name_unique
  ON graphs (name)
  WHERE deleted_at IS NULL;
