# sql.update

Runs a parameterised UPDATE against a stored database configuration.
Same `config + sql + params` shape as the rest of the SQL family. Always
include a `WHERE` clause unless you really do want to touch every row —
the `unsafe` flag is gone with the structured form.

## Prerequisites
* **A stored database configuration** (Home → Configurations → type `database`).
* **UPDATE permission** on the target table.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Stored database configuration name. | `prodDb` |
| `sql` | Required. The UPDATE statement with `$1`, `$2`, … placeholders. | `UPDATE users SET status = $1 WHERE email = $2 RETURNING id, status` |
| `params` | Optional `${var}` reference to a values array. | `${updateParams}` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `rows` | Updated rows when `RETURNING` is set; otherwise `[]`. | `[{"id": 123, "status": "active"}]` |
| `rowCount` | Number of rows modified. | `1` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "activate-user-account",
  "description": "Mark a user as active and confirm via the returning row.",
  "data": { "email": "john.doe@example.com" },
  "nodes": [
    {
      "name": "build_params",
      "action": "transform",
      "inputs": { "expression": "[\"active\", data.email]" },
      "outputs": { "value": "updateParams" }
    },
    {
      "name": "update_status",
      "action": "sql.update",
      "inputs": {
        "config": "prodDb",
        "sql":    "UPDATE users SET status = $1, last_verified = NOW() WHERE email = $2 RETURNING id, status",
        "params": "${updateParams}"
      },
      "outputs": { "rowCount": "updatedCount", "rows": "updatedRows" }
    },
    {
      "name": "log_success",
      "action": "log",
      "executeIf": "${updatedCount > 0}",
      "inputs": { "message": "Activated user ${updatedRows[0].id}." }
    }
  ],
  "edges": [
    { "from": "build_params",  "to": "update_status" },
    { "from": "update_status", "to": "log_success" }
  ]
}
```

## Expected output

```json
{
  "rows":     [{ "id": 123, "status": "active" }],
  "rowCount": 1
}
```

## Troubleshooting
* **Unintended bulk update.** Always include a `WHERE` clause. There's no engine-side guard any more — write the SQL deliberately.
* **Column case sensitivity.** Postgres folds unquoted identifiers to lowercase; quote them if you need exact case.
* **Empty SET.** `UPDATE … SET WHERE …` is invalid SQL. The plugin doesn't add columns for you — supply at least one assignment in the SQL itself.

## Library
* `pg` — node-postgres pool.
* `../sql/util.js` — connection-string assembly + helpers.

## Reference
* [PostgreSQL UPDATE](https://www.postgresql.org/docs/current/sql-update.html)
