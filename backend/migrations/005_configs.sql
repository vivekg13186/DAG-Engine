-- Shared key-value config store. Workflows reference these as ${config.<key>}.
-- Useful for environment-specific values (URLs, timeouts) and secrets that
-- shouldn't live inside individual graph YAML.
CREATE TABLE IF NOT EXISTS configs (
  id          UUID PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  value       JSONB NOT NULL DEFAULT 'null'::jsonb,
  description TEXT,
  secret      BOOLEAN NOT NULL DEFAULT FALSE,   -- masks value in API list responses
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_configs_key ON configs (key);
