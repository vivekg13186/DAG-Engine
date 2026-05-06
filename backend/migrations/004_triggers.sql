-- Triggers fire workflow runs from external events (cron / MQTT / IMAP / etc).
-- The trigger manager loads enabled rows on worker startup, opens long-lived
-- subscriptions, and enqueues an execution per fire.
CREATE TABLE IF NOT EXISTS triggers (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  graph_id      UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,             -- 'schedule', 'mqtt', 'email'
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  last_fired_at TIMESTAMPTZ,
  last_error    TEXT,
  fire_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triggers_graph    ON triggers (graph_id);
CREATE INDEX IF NOT EXISTS idx_triggers_enabled  ON triggers (enabled) WHERE enabled = TRUE;
