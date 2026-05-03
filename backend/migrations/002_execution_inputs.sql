-- The user-supplied JSON input that started the execution.
-- (Distinct from `context`, which is the *final* engine context after the run
-- finishes — that one accumulates output mappings and node records.)
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS inputs JSONB NOT NULL DEFAULT '{}'::jsonb;
