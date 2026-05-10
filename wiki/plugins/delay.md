# delay

A simple utility plugin that pauses workflow execution for a specified
duration. Useful for rate-limiting external calls, waiting for an
asynchronous background process, or spacing out retries.

## Prerequisites
* **No external dependencies** — this is a logic-only plugin.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `ms` | Duration to sleep in milliseconds (max 24 hours = 86 400 000). | `5000` |

For longer waits, use a `schedule` trigger instead — a sleeping `delay` node holds a worker concurrency slot the whole time.

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `slept` | The amount of time paused, in milliseconds. | `5000` |

`primaryOutput`: `slept`.

## Sample workflow

```json
{
  "name": "Delay Test",
  "description": "Wait two minutes, then print Hi.",
  "nodes": [
    {
      "name": "wait",
      "action": "delay",
      "inputs": { "ms": 120000 }
    },
    {
      "name": "Print-After-2min",
      "action": "log",
      "inputs": { "message": "Hi" }
    }
  ],
  "edges": [
    { "from": "wait", "to": "Print-After-2min" }
  ]
}
```

## Expected output

```json
{ "slept": 120000 }
```

## Troubleshooting
* **Maximum duration:** capped at 24 h. Anything longer should be a `schedule` trigger that fires the downstream nodes on its own clock.
* **Non-blocking:** the worker's event loop is free during the wait, but the workflow branch holds its concurrency slot until the timer resolves.

## Library
* **Native:** standard JavaScript `setTimeout` wrapped in a Promise.

## Reference
* [MDN setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/setTimeout)
