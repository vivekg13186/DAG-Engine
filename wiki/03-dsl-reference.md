# DSL reference

Workflows are JSON documents. (Earlier revisions used YAML; that format
is gone end-to-end — the engine, API, and editor all speak JSON now.)
You normally don't write the DSL by hand: the visual editor builds it
from the canvas + property panel, and the JSON tab shows what's saved.
This page documents the shape so you can read and import it.

The smallest valid workflow looks like this:

```json
{
  "name": "hello-world",
  "nodes": [
    {
      "name": "greet",
      "action": "log",
      "inputs": { "message": "Hello!" }
    }
  ]
}
```

## Top-level fields

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Flow name. Stored in the database; unique among non-deleted rows. |
| `description` | no | Free text. |
| `data` | no | Object of constants merged into the runtime context root. Acts as defaults that user-supplied JSON input can override. |
| `meta` | no | Editor-only metadata. The canvas uses `meta.positions` to remember each node's `(x, y)`; the AI assistant stores its prompt history in `meta.prompt`. Free-form, ignored by the engine. |
| `nodes` | yes | List of node definitions (≥ 1). |
| `edges` | no | List of `{ from, to }` edges. Implicit empty if not provided. |

> **No `version` field.** Versioning was removed; the editor's Archive
> button explicitly snapshots the current state into `archived_graphs`
> when you want a checkpoint, and Restore brings any snapshot back.
> Legacy DSLs that still carry a `version` key continue to validate;
> the value is dropped on re-serialise.

## Nodes

```json
{
  "name": "fetch",
  "action": "http.request",
  "description": "...",
  "inputs":  { "url": "${url}" },
  "outputs": { "body": "responseBody" },
  "executeIf": "${data.run == true}",
  "retry": 3,
  "retryDelay": "500ms",
  "onError":  "continue",
  "batchOver":"${ids}",
  "outputVar":"primaryResult"
}
```

| Field | Notes |
|-------|-------|
| `name` | Required. Pattern `^[A-Za-z_][A-Za-z0-9_.-]*$`. Unique per flow. |
| `action` | Required. Plugin id (e.g. `log`, `sql.select`). |
| `description` | Optional free text. The editor shows it in the property panel. |
| `inputs` | Object. Each key matches a key in the plugin's input schema. The visual editor renders the inputs panel directly off that schema, so what you can fill in here is what's listed under the plugin's "Inputs" panel. |
| `outputs` | Object that maps a plugin output field (dot path ok) to a ctx variable. `"body": "responseBody"` writes `pluginOutput.body` to `ctx.responseBody`. |
| `executeIf` | FEEL boolean expression wrapped in `${...}`. False → node is `skipped`, descendants reachable only through this node also cascade to `skipped`. |
| `retry` | Integer ≥ 0 (default 0). Extra attempts on plugin error. |
| `retryDelay` | Integer ms or duration string (e.g. `"500ms"`, `"2s"`). |
| `onError` | `"terminate"` (default) or `"continue"`. |
| `batchOver` | FEEL expression resolving to an array. Plugin runs once per element; output becomes `{ items: [...], count: N }`. |
| `outputVar` | Optional ctx variable name. The engine writes the plugin's `primaryOutput` (declared per plugin) to `ctx.<outputVar>` after a successful run, so downstream nodes can read it as `${<outputVar>}` without an explicit `outputs` mapping. |

**Status values** that show up in the execution viewer / WebSocket events:
`pending`, `running`, `retrying`, `success`, `failed`, `skipped`.

### `inputs` array form (legacy)

The DSL also accepts an array of single-key maps, normalised on parse:

```json
"inputs": [
  { "url":    "${url}" },
  { "method": "GET" }
]
```

Object form is canonical; the editor always emits objects. Duplicate keys throw a validation error.

### `outputs` mapping

Maps `pluginField → ctxVarName`. Dot paths into the plugin output are supported on the left:

```json
"outputs": {
  "body.title": "postTitle",
  "status":     "httpStatus"
}
```

`ctx.postTitle = pluginOutput.body.title`, `ctx.httpStatus = pluginOutput.status`.

Whatever you map, the full plugin output is also kept under `nodes.<name>.output`, so you can always reach it via `${nodes.fetch.output.body.title}`.

The visual editor renders this panel as a key/value list with placeholders **node output** (left) → **var name** (right).

### `executeIf`

```json
"executeIf": "${nodes.fetch.output.status = 200}"
```

If the FEEL expression evaluates to false, the node is marked `skipped`. The engine then **cascades** that status to any descendants that are reachable *only* through this node (so a parallel branch upstream of the same downstream node still has a chance to make it run). Use `executeIf` instead of a separate condition node — the dedicated condition plugin was removed.

### Retries

```json
"retry": 3,
"retryDelay": "1s"
```

Up to N extra attempts per node (4 total at `retry: 3`). `retryDelay` accepts plain numbers (ms) or duration strings: `"500ms"`, `"2s"`, `"1m"`.

Retry only applies to plugin-thrown errors. `executeIf` failures, input-resolution errors, and `batchOver` resolution errors don't retry.

### Batch fan-out (`batchOver`)

```json
{
  "name": "fetch-each",
  "action": "http.request",
  "batchOver": "${ids}",
  "inputs": { "url": "https://api/${item}" }
}
```

The plugin runs once per element; `${item}` is the current element and `${index}` is its index. The node's output is `{ items: [...], count: N }`.

### `onError`

- `terminate` (default) — first failure aborts the DAG. Remaining unrun nodes are marked `skipped`.
- `continue` — failed nodes are recorded, but downstream nodes still run. Final execution status is `partial`.

## Edges

```json
"edges": [
  { "from": "greet", "to": "pause" },
  { "from": "pause", "to": "done"  }
]
```

A node with no incoming edges is a *root*. Every referenced name must exist; cycles are rejected at validation time. The visual editor draws edges as you connect handles, so this list is normally maintained for you.

## Expressions

Anywhere a string value contains `${...}`, the contents are evaluated against the runtime context using **FEEL** (Friendly Enough Expression Language; the same evaluator used by DMN). The engine wraps the FEEL evaluator with a couple of practical conveniences:

### Path lookup

The simplest expression is a path. Pure paths skip the FEEL parser for speed:

```json
"url": "${data.url}",
"url": "${url}",
"url": "${nodes.fetch.output.body.id}"
```

`data` is flattened to root, so `${url}` and `${data.url}` resolve to the same value.

### Type passthrough

If the entire string is a single `${path}` placeholder, the typed value is returned verbatim (number, boolean, array, object). Otherwise the result is interpolated as a string.

```json
"ms":  "${data.timeoutMs}",   // → number 5000
"url": "id=${data.id}"        // → string "id=5"
```

### FEEL expressions

When the expression isn't a pure path, it's evaluated as FEEL. Comparison uses `=` (not `==`), boolean logic is `and` / `or` / `not`, and you have list comprehensions, ternaries (`if … then … else …`), `for` loops, ranges, and the FEEL builtins (`string()`, `count()`, `sum()`, etc.).

```json
"executeIf": "${nodes.fetch.output.status = 200}",
"executeIf": "${count > 0 and active}"
```

JS-style operators (`==`, `!=`, `&&`, `||`) are translated through to their FEEL equivalents on the way in, so existing flows keep working.

### Helpers injected into FEEL

The engine adds a small set of helpers to the FEEL evaluation context for convenience:

- `toJson(value)` / `toJsonPretty(value)` — JSON.stringify (compact / 2-space).
- `parseJson(text)` — JSON.parse.

### Recursive resolution

`inputs:` is walked recursively — strings, arrays, and nested objects all get resolved.

```json
"inputs": {
  "body": {
    "user": "${data.user}",
    "tags": ["beta", "${data.env}"]
  }
}
```

## Runtime context

The runtime `ctx` object the engine maintains looks like this for a non-batch run with input `{ "ids": [1,2,3] }`:

```js
ctx = {
  // (1) parsed.data fields, flattened to root, overlaid with the user input.
  ids: [1, 2, 3],

  // (2) per-node summary, populated as nodes complete.
  nodes: {
    fetch: {
      status: "success",
      output: { /* full plugin output */ },
      startedAt:  "2026-...",
      finishedAt: "2026-...",
      attempts: 1
    }
    // ...
  },

  // (3) typed configurations (plaintext at runtime; never written back to DB).
  config: {
    prodDb:  { engine: "postgres", host: "...", username: "...", password: "..." },
    sendgrid:{ host: "smtp.sendgrid.net", port: 587, username: "apikey", password: "..." }
  },

  // (4) env-flavoured projection of `config` for script-style consumers.
  env: {
    CONFIG_PRODDB_HOST:    "...",
    CONFIG_SENDGRID_USER:  "...",
    // ...
  }
}
```

Inside a node running under `batchOver`:

```js
{ ...ctx, item: <current array element>, index: <integer> }
```

After a node finishes successfully, its `outputs:` mapping copies pluginField values onto root-level ctx vars before downstream nodes run. If `outputVar` is set, the plugin's primary output is also written there.

> **Persistence note.** When the worker writes the final ctx into
> `executions.context`, it strips `config` and `env` first — secrets stay
> in the live runtime only and never make it to the JSONB column.

## Validation

`POST /graphs/validate` (and the editor's **Validate** action) check:

- JSON parses.
- Schema matches the DAG schema (top-level fields, node shape, edge shape, value types).
- Node names are unique and use the safe character set.
- Every edge's `from`/`to` references an existing node.
- The graph is acyclic (Kahn's algorithm).
- Each node's required inputs (declared in the plugin's `inputSchema.required`) are present, after `${…}` expressions are resolved.

Anything else (bad expressions, plugin-internal validation) surfaces at run time as a node failure with the error message attached.
