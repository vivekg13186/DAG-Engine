# Schedule Trigger Guide

Run a workflow on a schedule — either a cron expression or a fixed
interval. The simplest of the four trigger drivers; no external service
required.

## Trigger configuration

Set up via Home → **Triggers** → **+ New** → driver `schedule`. Provide
exactly one of:

### Mode A: Cron
For complex scheduling ("every Monday at 8 AM", "every 5 minutes").

| Field | Description |
| :--- | :--- |
| `cron` | Required. Cron expression in the [croner](https://github.com/Hexagon/croner) dialect (5 fields, optional 6th for seconds). |
| `timezone` | Optional. IANA timezone name. Defaults to system time. |

### Mode B: Interval
For "run every N milliseconds, regardless of wall clock":

| Field | Description |
| :--- | :--- |
| `intervalMs` | Required. Milliseconds between fires. |

## Cron syntax

```
┌──────────── seconds      (0–59, optional 6th field)
│ ┌────────── minutes      (0–59)
│ │ ┌──────── hours        (0–23)
│ │ │ ┌────── day of month (1–31)
│ │ │ │ ┌──── month        (1–12)
│ │ │ │ │ ┌── day of week  (0–7, 0 or 7 = Sunday)
* * * * * *
```

Common examples:
* `*/15 * * * * *` — every 15 seconds.
* `0 0 12 * * *` — every day at noon.
* `0 0 9 * * 1` — every Monday at 9 AM.
* `0 30 8 1 * *` — first day of every month at 8:30 AM.

[crontab.guru](https://crontab.guru/) is handy for sanity-checking expressions (note: it doesn't support the seconds field — drop the leading `*` if you paste from there).

## Workflow example

A nightly cleanup that deletes month-old logs.

```json
{
  "name": "nightly-db-cleanup",
  "description": "Wipes logs older than 30 days every night at midnight.",
  "nodes": [
    {
      "name": "delete_old_logs",
      "action": "sql.delete",
      "inputs": {
        "config": "prodDb",
        "sql":    "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days' RETURNING id"
      },
      "outputs": { "rowCount": "deleted" }
    },
    {
      "name": "notify_completion",
      "action": "log",
      "inputs": {
        "message": "Cleanup fired at ${firedAt}; ${deleted} rows removed."
      }
    }
  ],
  "edges": [
    { "from": "delete_old_logs", "to": "notify_completion" }
  ]
}
```

The trigger config (separately, on the Triggers table):

```json
{
  "type":   "schedule",
  "config": { "cron": "0 0 0 * * *", "timezone": "America/New_York" },
  "graph_id": "<id of the workflow above>",
  "enabled": true
}
```

## Payload structure

The trigger passes the following data as the workflow's user input
(reachable as flat `${...}` fields on `ctx`):

| Field | Description |
| :--- | :--- |
| `firedAt` | ISO timestamp when execution actually started. |
| `scheduledFor` | ISO timestamp the cron job was supposed to run (cron mode only). |
| `kind` | `"cron"` or `"interval"`. |

## Troubleshooting

### Cron not firing
* **Syntax.** Validate with [crontab.guru](https://crontab.guru/) (remembering the seconds field).
* **Timezone.** If your server runs in UTC and you expect EST, the job fires 5 hours "early" without an explicit `timezone` setting.

### Interval drift
The internal scheduler uses `setInterval`. Under heavy CPU load, fires can drift. For sub-second precision use a dedicated scheduler.

### Overlapping executions
A cron expression that fires every 5 minutes paired with a workflow that takes 10 minutes to run will pile up running instances. The trigger doesn't gate on prior runs — your workflow logic (DB locks, advisory locks, idempotent writes) needs to handle concurrency, or stretch the interval.

### Trigger not firing after enable
The trigger manager subscribes triggers on worker boot and on enable/disable. If you toggled the row but the worker process is still on an older snapshot, restart the worker.
