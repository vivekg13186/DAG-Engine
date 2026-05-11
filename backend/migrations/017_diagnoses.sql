-- Self-healing diagnoses — cached LLM analysis of a failed execution.
--
-- One row per execution. If a user re-runs diagnose (force=1), the
-- existing row is overwritten — there's no version history. The cost
-- of an extra LLM call to regenerate is small; the storage cost of
-- keeping every attempt is not, and the metadata (recommendedActions
-- + confidence) is what callers actually care about.
--
-- Cascades on execution delete so retention prunes free.
--
-- workspace_id is denormalised from the execution so the
-- /executions/:id/diagnose API can authorise without joining.

CREATE TABLE IF NOT EXISTS execution_diagnoses (
  execution_id          UUID PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL,

  confidence            NUMERIC(3, 2),                   -- 0.00 - 1.00
  category              TEXT,                            -- transient|config|code|external|unknown
  root_cause            TEXT,
  recommended_actions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- LLM cost accounting — useful for "what's self-heal costing us"
  -- dashboards. Tokens captured directly from the provider response;
  -- cost_usd is computed by the caller against current rates.
  model                 TEXT,
  input_tokens          INT,
  output_tokens         INT,

  status                TEXT NOT NULL DEFAULT 'completed',  -- completed | failed
  error                 TEXT,                            -- only when status='failed'

  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_diagnoses_status_chk
    CHECK (status IN ('completed', 'failed')),
  CONSTRAINT execution_diagnoses_category_chk
    CHECK (category IS NULL OR category IN
      ('transient', 'config', 'code', 'external', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_execution_diagnoses_workspace_created
  ON execution_diagnoses (workspace_id, created_at DESC);

COMMENT ON TABLE execution_diagnoses IS
  'Cached LLM diagnosis of a failed execution. One row per execution; regenerate via force=1.';
