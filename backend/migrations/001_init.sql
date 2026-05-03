-- Graphs are stored versioned. Updating a graph by name creates a new row
-- with version = previous + 1; older versions remain queryable.
CREATE TABLE IF NOT EXISTS graphs (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  version      INTEGER NOT NULL,
  yaml         TEXT NOT NULL,
  parsed       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_graphs_name      ON graphs (name);
CREATE INDEX IF NOT EXISTS idx_graphs_active    ON graphs (name) WHERE deleted_at IS NULL;

-- One row per execution attempt of a graph.
CREATE TABLE IF NOT EXISTS executions (
  id            UUID PRIMARY KEY,
  graph_id      UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('queued','running','success','failed','partial','cancelled')),
  context       JSONB NOT NULL DEFAULT '{}'::jsonb,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executions_graph    ON executions (graph_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status   ON executions (status);

-- Per-node lifecycle log. Multiple rows per node when retries happen
-- (one row per attempt) plus a final aggregated row.
CREATE TABLE IF NOT EXISTS node_logs (
  id             UUID PRIMARY KEY,
  execution_id   UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_name      TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending','running','success','failed','skipped','retrying')),
  attempt        INTEGER NOT NULL DEFAULT 1,
  input          JSONB,
  output         JSONB,
  error          TEXT,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_node_logs_exec    ON node_logs (execution_id);
CREATE INDEX IF NOT EXISTS idx_node_logs_node    ON node_logs (execution_id, node_name);
