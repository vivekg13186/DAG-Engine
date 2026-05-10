-- Agent memory store — one table, two namespaces.
--
-- Layer 1 (KV memory):
--   namespace='kv', key=<user-defined>, seq=NULL, value=<JSONB>.
--   One row per (scope, scope_id, namespace, key) — partial unique index
--   only when seq IS NULL.
--
-- Layer 2 (conversation history):
--   namespace='history', key=<conversationId>, seq=1,2,3,…, value={role,content}.
--   Many rows per (scope, scope_id, namespace, key) — disambiguated by seq.
--
-- Scope vocabulary:
--   scope='workflow' + scope_id=<graph_id>   — per-workflow memory (the default)
--   scope='agent'    + scope_id=<agent_id>   — shared across all uses of an agent
--   scope='global'   + scope_id=NULL         — engine-wide singleton bag

CREATE TABLE IF NOT EXISTS memories (
  id           UUID PRIMARY KEY,
  scope        TEXT  NOT NULL,
  scope_id     UUID  NULL,
  namespace    TEXT  NOT NULL DEFAULT 'kv',
  key          TEXT  NOT NULL,
  seq          INTEGER,                  -- NULL for KV; 1..N for history rows
  value        JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KV uniqueness (only when seq IS NULL). NULL scope_id is collapsed to a
-- sentinel UUID so 'global' rows can also enforce a single row per key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_kv_unique
  ON memories (
    scope,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    namespace,
    key
  )
  WHERE seq IS NULL;

-- History uniqueness — multiple rows per key, disambiguated by seq.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_history_seq
  ON memories (
    scope,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    namespace,
    key,
    seq
  )
  WHERE seq IS NOT NULL;

-- "List all entries for this scope/namespace" lookup.
CREATE INDEX IF NOT EXISTS idx_memories_scope_ns
  ON memories (scope, scope_id, namespace);
