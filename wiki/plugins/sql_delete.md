# sql.delete

Runs a parameterised DELETE against a stored database configuration.
Same `config + sql + params` shape as the rest of the SQL family.
Always include a `WHERE` clause — there's no engine-side guard any more
(the `unsafe` flag and structured-form fields were removed).

## Prerequisites
* **A stored database configuration** (Home → Configurations → type `database`).
* **DELETE permission** on the target table.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Stored database configuration name. | `prodDb` |
| `sql` | Required. The DELETE statement, with `$1`, `$2`, … placeholders. Add `RETURNING <cols>` if you want the deleted rows back. | `DELETE FROM sessions WHERE expires_at < NOW() RETURNING id` |
| `params` | Optional `${var}` reference to a values array. Omit when the SQL has no placeholders. | `${deleteParams}` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `rows` | Deleted rows when `RETURNING` is set; otherwise `[]`. | `[{"id": 45}, {"id": 92}]` |
| `rowCount` | Number of rows removed. | `2` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "cleanup-old-sessions",
  "description": "Sweep expired sessions hourly and log the count.",
  "nodes": [
    {
      "name": "delete_expired",
      "action": "sql.delete",
      "inputs": {
        "config": "prodDb",
        "sql":    "DELETE FROM sessions WHERE expires_at < NOW() RETURNING id"
      },
      "outputs": { "rowCount": "deletedCount", "rows": "deletedItems" }
    },
    {
      "name": "report_cleanup",
      "action": "log",
      "inputs": { "message": "Cleanup complete. Removed ${deletedCount} sessions." }
    }
  ],
  "edges": [
    { "from": "delete_expired", "to": "report_cleanup" }
  ]
}
```

## Expected output

```json
{
  "rows":     [{ "id": 45 }, { "id": 92 }],
  "rowCount": 2
}
```

## Troubleshooting
* **Accidental table-wipe.** A DELETE without `WHERE` will happily empty the table — there's no `unsafe` flag any more. Be deliberate.
* **`config "<name>" not found`.** The stored configuration doesn't exist or has a different name. Open Home → Configurations.
* **Foreign-key violation.** Postgres refuses to delete a parent row referenced by a child. Either delete the child rows first (chain two `sql.delete` nodes) or use `ON DELETE CASCADE` at schema level.

## Library
* `pg` — node-postgres pool.
* `../sql/util.js` — connection-string assembly + helpers.

## Reference
* [PostgreSQL DELETE](https://www.postgresql.org/docs/current/sql-delete.html)
