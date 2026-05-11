# Self-healing — diagnose on demand (PR A)

Self-healing in Daisy is being built in stages. **PR A** (this page)
ships *diagnosis on demand* — the LLM-driven analysis half. **No
automated action** happens; the only new behaviour is a "Diagnose
this failure" button on the InstanceViewer that classifies the
failure and recommends actions. Humans still click.

Subsequent PRs add policy (B), the action executor (C), the feedback
loop (D), and proactive anomaly detection (E). The roadmap lives at
the bottom of this page.

## What it does

When a workflow execution fails, an admin or editor can:

1. Open the InstanceViewer at `/instanceViewer/:id`.
2. Hit **Diagnose this failure** in the "Self-heal diagnosis" panel.
3. ~2 seconds later the LLM returns a structured analysis:
   - **Confidence** (0–100%) the diagnosis is correct.
   - **Category** — transient / config / code / external / unknown.
   - **Root cause** — one or two sentences in plain English.
   - **Recommended actions** with per-action confidence — retry,
     retry-with-timeout, skip, retry-with-inputs, escalate.

The diagnosis is cached in `execution_diagnoses` so revisiting the
same execution doesn't re-fire the LLM. A **Re-diagnose** button
forces a fresh call.

## Why diagnosis-first, automation-later

The dangerous part of self-healing is the action, not the analysis.
An LLM that's 70% right at classifying failures is useful as a
co-pilot. An LLM that's 70% right at *taking action* fires off
30% wrong actions on its own. Order matters:

1. **Ship diagnosis** (PR A). Live with it for a few weeks.
2. Watch *what humans actually do* after seeing each diagnosis.
   Accept rate, override rate, action-correctness rate.
3. *That data* tells you what thresholds + categories are safe to
   automate. Building the autonomous version without it is guessing.

## Privacy posture

The LLM call sees:

- Workflow name + the failed node's name + action type (e.g. `http.request`).
- The error message (truncated to 1200 chars).
- The last 5 attempts at the same node across recent executions
  (status + attempts + truncated error + timestamp).
- The last 5 audit-log entries for the workflow in the last 7 days
  (action name + actor email + timestamp).

The LLM does **not** see:

- `resolved_inputs` of failed nodes (often contains PII / payloads).
- `output` of any node (might contain raw API responses).
- Config or env values (already redacted from runtime ctx, but
  explicit here as policy).
- `data` field on the execution.

For deployments that need to tighten further (e.g. error messages
contain regulated data), set `RATE_LIMIT_AI_PER_MIN=0` or override
the model selector to a self-hosted provider via the existing
`ai.provider` config mechanism.

## API

```
POST /executions/:id/diagnose         (admin + editor)
POST /executions/:id/diagnose?force=1 (regenerate even when cached)
```

Response:

```json
{
  "cached": false,
  "diagnosis": {
    "execution_id":         "...",
    "confidence":           0.85,
    "category":             "transient",
    "root_cause":           "HTTP 502 from upstream; 23 successful calls in the last hour.",
    "recommended_actions": [
      { "action": "retry", "confidence": 0.9, "rationale": "...", "params": { } }
    ],
    "evidence": { "recentSuccessCount": 23 },
    "model":                "claude-haiku-4-5-20251001",
    "input_tokens":         842,
    "output_tokens":        212,
    "status":               "completed",
    "created_at":           "..."
  }
}
```

The GET `/executions/:id` response now folds `diagnosis` in
automatically when a cached one exists, so the InstanceViewer
renders it without an extra round-trip on page load.

## Audit

Every diagnose call is logged at `selfheal.diagnose` in
`audit_logs` with metadata `{ cached, regenerated, category }`.
That gives operators a "who asked the bot about which failure"
trail — useful when a chain of automated actions land in the
later PRs.

## Cost

Each call is ~1k input + ~300 output tokens. At Anthropic's
current Haiku pricing that's roughly **$0.0008 per diagnosis**.
For 1000 failed executions per month, that's $0.80. Caching
means a re-visit on the InstanceViewer is free.

You can pin a different model via `AI_MODEL` in env if you'd like
something even cheaper (4o-mini, Haiku, Llama-3.1-8b-instruct via
a proxy).

## Failure modes

The diagnose call can fail for two distinct reasons. Both are
caught + persisted so the UI shows a clear error rather than
spinning:

- **AI provider unconfigured** — no `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY`. The endpoint returns a clear 5xx and the
  panel shows the message.
- **LLM returned non-JSON** — happens with smaller models that
  ignore the "JSON only" instruction. The parser catches it, the
  failure is stored, the UI offers a "Retry" button.

## File map

| File | Role |
|------|------|
| `backend/migrations/017_diagnoses.sql` | `execution_diagnoses` table |
| `backend/src/selfheal/diagnose.js` | gather context, prompt, parse, persist |
| `backend/src/api/executions.js` | `POST /executions/:id/diagnose` + fold cached diagnosis into GET |
| `backend/test/selfheal-diagnose.test.js` | prompt + parser tests |
| `frontend/src/api/client.js` | `Executions.diagnose()` |
| `frontend/src/pages/InstanceViewer.vue` | the panel + button + state |
| `wiki/15-self-healing.md` | this page |

## Roadmap — PRs B–E

The earlier design discussion laid these out; tracking them here
so the path forward is visible.

| PR | Adds | Effort |
|----|------|--------|
| **B** | A `selfHeal: disabled \| suggest \| auto-low-risk \| auto` DSL flag on workflows + nodes. `suggest` mode posts diagnoses to a configured contact point (Slack/audit log). No action execution yet. | ~3 days |
| **C** | Action executor. Implements retry / retry-with-timeout / skip / retry-with-inputs / disable-trigger / escalate as deterministic actions. Wires a BullMQ on-failure listener that runs `auto-*` policies. Every action audit-logged. | ~4–5 days |
| **D** | Feedback loop. Track whether each healing attempt succeeded; auto-downgrade policies that fall below a configurable success-rate floor. | ~2–3 days |
| **E** | Proactive anomaly detection. Background scanner over recent executions / traces; LLM-generated digest to a Slack channel. | ~3–4 days |

Each PR is ship-on-its-own; you don't have to commit to the full
sequence to land an improvement.
