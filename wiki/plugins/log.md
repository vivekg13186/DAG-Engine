# log

Outputs a message to the worker's stdout / log file. Essential for
debugging workflows, tracking execution progress, and capturing state
information at specific nodes.

## Prerequisites
* **Environment:** No external servers are required. The plugin uses the engine's built-in JSON logger (`backend/src/utils/logger.js`).
* **Access:** You need access to the worker's stdout/stderr (or `backend/logs/node-events.log`) to see the output.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `message` | The text to log. May contain `${...}` placeholders. | `Processing started...` |
| `level`   | Severity: `debug`, `info`, `warn`, or `error`. Defaults to `info`. | `info` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `message` | The rendered message — useful as a downstream expression source. | `Processing started...` |

`primaryOutput`: `message`. Setting `outputVar` on the node copies the rendered message onto `ctx[<outputVar>]`.

## Sample workflow

```json
{
  "name": "simple-logger-test",
  "description": "Different log levels passed through three nodes.",
  "nodes": [
    {
      "name": "start_info",
      "action": "log",
      "inputs": { "message": "Workflow initiated successfully.", "level": "info" }
    },
    {
      "name": "warning_check",
      "action": "log",
      "inputs": { "message": "Low disk space detected (mock warning)", "level": "warn" }
    },
    {
      "name": "debug_data",
      "action": "log",
      "inputs": { "message": "Internal state: { id: 101, status: 'active' }", "level": "debug" }
    }
  ],
  "edges": [
    { "from": "start_info",    "to": "warning_check" },
    { "from": "warning_check", "to": "debug_data" }
  ]
}
```

The visual editor builds this for you — drag three `log` nodes onto the canvas, fill in the property panel, wire the handles. The JSON above is what gets saved.

## Expected output

In the worker console:

```
[plugin:log] Workflow initiated successfully.
```

The recorded node output:

```json
{ "message": "Workflow initiated successfully." }
```

## Troubleshooting
* **Logs not appearing:** Check `LOG_LEVEL` in `.env`. If it's set to `info`, `debug` messages are filtered out.
* **Variable resolution:** If `${path}` references a value missing from `ctx`, the rendered string contains `undefined`. Use `${data.foo}` (data fields are flattened to root) or wire the value from an upstream node's output.

## Library
* `../../utils/logger.js` — the engine's tiny JSON logger.

## Reference
* [Node.js Console API](https://nodejs.org/api/console.html)
