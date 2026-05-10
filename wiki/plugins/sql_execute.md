# sql.execute

The escape hatch for SQL that doesn't fit the dedicated select/insert/
update/delete plugins — stored procedures (`CALL …`), table-returning
functions (`SELECT * FROM fn(…)`), DDL, multi-statement blocks, etc.

Same `config + sql + params` shape. The dedicated `procedure` /
`function` / `args` short-cuts and the per-call `connectionString` were
dropped — write the SQL directly.

## Prerequisites
* **A stored database configuration** (Home → Configurations → type `database`).
* **Permissions** appropriate to the statement: `EXECUTE` on procedures, `SELECT` on functions / views, etc.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Stored database configuration name. | `prodDb` |
| `sql` | Required. Any SQL statement. Use `$1`, `$2`, … for placeholders. | `CALL refresh_reports($1)` |
| `params` | Optional `${var}` reference to a values array. | `${args}` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `rows` | Result rows for SELECT-style statements; empty for plain CALL/DDL. | `[{"total_count": 450}]` |
| `rowCount` | Number of rows returned or affected. | `1` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "run-database-routine",
  "description": "Refresh a materialised view, then read back the latest summary.",
  "nodes": [
    {
      "name": "refresh_view",
      "action": "sql.execute",
      "inputs": {
        "config": "prodDb",
        "sql":    "CALL refresh_reports($1)",
        "params": ["fast_mode"]
      }
    },
    {
      "name": "get_summary",
      "action": "sql.execute",
      "inputs": {
        "config": "prodDb",
        "sql":    "SELECT * FROM get_daily_summary($1)",
        "params": ["2026-05-06"]
      },
      "outputs": { "rows": "summaryData" }
    },
    {
      "name": "log_summary",
      "action": "log",
      "inputs": {
        "message": "Today's summary: ${summaryData[0].total_count} items processed."
      }
    }
  ],
  "edges": [
    { "from": "refresh_view", "to": "get_summary" },
    { "from": "get_summary",  "to": "log_summary" }
  ]
}
```

## Expected output

For a function call or SELECT:

```json
{
  "rows":     [{ "total_count": 450, "avg_value": 12.5 }],
  "rowCount": 1
}
```

For a plain `CALL` or DDL: `{ "rows": [], "rowCount": 0 }`.

## Troubleshooting
* **`syntax error` near a $-placeholder.** Postgres parses `$1` only inside expressions; you can't substitute identifiers (table / column names) — only values. Use a separate node to compose the statement if you really need a dynamic identifier.
* **Multi-statement blocks.** node-postgres supports them, but only the last statement's result is returned. Split into multiple `sql.execute` nodes if you need each result.
* **`config "<name>" not found`.** No stored configuration with that name; open Home → Configurations.

## Library
* `pg` — node-postgres pool.
* `../sql/util.js` — connection-string assembly + helpers.

## Reference
* [PostgreSQL CALL](https://www.postgresql.org/docs/current/sql-call.html)
* [PostgreSQL functions](https://www.postgresql.org/docs/current/functions.html)
