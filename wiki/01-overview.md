# Overview

DAG Engine is a workflow runner. You design a Directed Acyclic Graph of tasks visually — drag nodes from a palette, wire them together, fill in a property panel — and the engine executes them in dependency order, parallelizing whatever can run at the same time. The graph is stored as JSON; if you ever need to read or copy it raw, the editor has a JSON tab.

## What you can do with it

- Wire HTTP calls, SQL queries, file/CSV/Excel I/O, web scraping, MQTT publish, and email sends together into a single pipeline.
- Pass data between steps with `${...}` placeholders backed by [FEEL](https://kiegroup.github.io/dmn-feel-handbook/) expressions.
- Retry transient failures, skip nodes by condition (`executeIf`), fan a workflow out across an array of inputs (`batchOver`).
- Save workflows in Postgres, run them on demand from the UI, watch live per-node status as the worker advances.
- Snapshot the current state of a workflow into an archive history before making risky edits — restore in one click.
- Centralise credentials in typed **Configurations** (mail.smtp / mail.imap / mqtt / database / generic). Plugins reference them by name, never by inline secrets.
- Wire **triggers** (schedule / webhook / email / mqtt) so workflows run on external events rather than a manual click.
- Get help authoring workflows from a built-in AI assistant that knows your installed plugins and emits ready-to-import JSON.

## How the pieces fit together

```
                ┌─────────────────────────────────┐
                │         Vue 3 + Quasar          │
                │  • Flow / execution list pages  │
                │  • Visual canvas (Vue Flow)     │
                │  • Schema-driven property panel │
                │  • Read-only JSON tab           │
                │  • Configurations + Triggers UI │
                │  • Ask-AI dialog                │
                └──────────────┬──────────────────┘
                               │ REST + WS
                ┌──────────────▼──────────────────┐
                │       Express API server        │
                │  /graphs   /graphs/:id/archives │
                │  /executions   /plugins         │
                │  /configs   /triggers   /ai     │
                │  /ws        (live updates)      │
                └────┬─────────────────────────┬──┘
                     │ enqueue                 │ persist
              ┌──────▼──────┐           ┌──────▼──────┐
              │   BullMQ    │           │  PostgreSQL │
              │   (Redis)   │           │   graphs    │
              └──────┬──────┘           │ archived_   │
                     │                  │  graphs     │
              ┌──────▼──────┐           │ executions  │
              │   Worker    │  ── pluggable actions ──┐
              │  ┌────────┐ │           │ configs     │
              │  │ Engine │ │           │ triggers    │
              │  └────────┘ │           └─────────────┘
              └─────────────┘  log / delay / transform / http /
                                web.scrape / sql.* / email.send /
                                mqtt.publish / file.* / csv.* / excel.*
```

## Components

**Backend** — Node.js (ESM), Express API, BullMQ + Redis worker queue, PostgreSQL for graphs/executions/configs/triggers. Plugins auto-load from `backend/src/plugins/builtin/`; trigger drivers from `backend/src/triggers/builtin/`.

**Frontend** — Vue 3 + Quasar (light theme). The canvas is built on Vue Flow with a schema-driven property panel that renders inputs, validation, and "what-this-plugin-returns" docs straight off the plugin's JSON Schema. The JSON tab is read-only — you edit through the canvas and property panel.

**Engine** — pure-JS DAG executor: topological layered scheduler, parallel `Promise.all` per layer, per-node retries with delay, `executeIf` skipping with cascade-to-descendants, `batchOver` fan-out, `onError: continue|terminate`. Expressions are FEEL via [`feelin`](https://github.com/nikku/feelin); `${path}` is the placeholder syntax that wraps a FEEL expression.

**Configurations** — encrypted-at-rest typed config store. Secret fields go through AES-256-GCM (keyed by `CONFIG_SECRET`); the engine pre-loads decrypted configs into `ctx.config.<name>.<field>` for use in expressions, and projects them as `ctx.env.CONFIG_<NAME>_<FIELD>` for script-style access. Plugins like `email.send`, `mqtt.publish`, and the `sql.*` family take a config name and look the rest up themselves.

**Triggers** — event sources that enqueue a workflow run. Built-ins: `schedule` (cron / interval), `webhook` (HTTP endpoint), `email` (IMAP IDLE), `mqtt` (broker subscribe). Each trigger references a configuration by name where applicable.

**AI assistant** — optional. With `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set, the **Prompt** tab in the flow editor lets you describe what you want and get a ready-to-paste workflow JSON; the assistant knows the live plugin list.

## Data model

| Table | Purpose |
|-------|---------|
| `graphs` | Live workflow definitions. Single-row-per-flow (the `id` is stable across saves). Stores both the canonical JSON `dsl` and a `parsed` JSONB cache. |
| `archived_graphs` | Explicit user-initiated snapshots of `graphs` rows. Created via the toolbar's Archive button; restored with one click from the History drawer. |
| `executions` | One row per run: status, timestamps, original `inputs`, final redacted `context`. |
| `configs` | Typed, named configurations with secret fields encrypted at rest. |
| `triggers` | Event sources with their per-driver config. Enabled/disabled live. |

Per-node lifecycle history is appended to `backend/logs/node-events.log` as JSON lines (one event per line, each tagged with `executionId` / `graphId`). The execution row's `context.nodes` always carries the post-run summary the UI needs.

## Where to start

- **Just want to try it?** → [Setup](./02-setup.md), then open the UI, click **+ New flow**, drag a `log` node from the left palette, fill in the message, click **Save** and **Run**.
- **Building a real workflow?** → [DSL reference](./03-dsl-reference.md) explains the JSON shape that lives behind the canvas plus FEEL expression syntax.
- **Looking for the right plugin?** → [Plugin reference](./04-plugins.md).
