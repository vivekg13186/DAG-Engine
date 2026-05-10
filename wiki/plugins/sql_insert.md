# sql.insert

Runs a parameterised INSERT against a stored database configuration. The
plugin shape mirrors the rest of the SQL family: `config` + `sql` +
`params`. Add a `RETURNING` clause to get the newly-inserted rows back.

The structured-form helpers (`table`, `values`, `returning`,
`onConflict`) and the per-call `connectionString` were dropped — write
the SQL directly.

## Prerequisites
* **A stored database configuration** (Home → Configurations → type `database`).
* **Insert permission** on the target table.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Name of a stored database configuration. | `prodDb` |
| `sql` | Required. The INSERT statement, with `$1`, `$2`, … placeholders. Add `RETURNING <cols>` if you need the inserted rows back. | `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id` |
| `params` | Optional `${var}` reference to an array of values. Build it upstream with a `transform` node. | `${userParams}` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `rows` | Inserted rows when `RETURNING` is set; otherwise `[]`. | `[{"id": 101}]` |
| `rowCount` | Number of rows inserted. | `1` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "register-new-user",
  "description": "Insert a single user, return its id, log the result.",
  "data": {
    "newUser": { "name": "Alice", "email": "alice@example.com" }
  },
  "nodes": [
    {
      "name": "build_params",
      "action": "transform",
      "inputs": { "expression": "[data.newUser.name, data.newUser.email]" },
      "outputs": { "value": "userParams" }
    },
    {
      "name": "insert_user",
      "action": "sql.insert",
      "inputs": {
        "config": "prodDb",
        "sql":    "INSERT INTO users (name, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email",
        "params": "${userParams}"
      },
      "outputs": { "rows": "createdRecords", "rowCount": "totalInserted" }
    },
    {
      "name": "log_summary",
      "action": "log",
      "executeIf": "${totalInserted > 0}",
      "inputs": { "message": "Inserted user ${createdRecords[0].email} as id ${createdRecords[0].id}." }
    }
  ],
  "edges": [
    { "from": "build_params", "to": "insert_user" },
    { "from": "insert_user",  "to": "log_summary" }
  ]
}
```

For a bulk insert, expand the placeholder list:

```sql
INSERT INTO users (name, email) VALUES ($1, $2), ($3, $4), ($5, $6) RETURNING id
```

…and feed `params` a flat array `[name1, email1, name2, email2, ...]` (a `transform` node makes this easy).

## Expected output

```json
{
  "rows":     [{ "id": 101, "email": "alice@example.com" }],
  "rowCount": 1
}
```

## Troubleshooting
* **Unique constraint violation.** Use `ON CONFLICT DO NOTHING` (or `ON CONFLICT … DO UPDATE`) directly in the SQL — there's no `onConflict` flag any more.
* **Bulk insert mismatched columns.** Postgres requires every tuple to have the same arity as the column list. Build the params via `transform` so length is deterministic.
* **`config "<name>" not found`.** The stored configuration doesn't exist. Open Home → Configurations.

## Library
* `pg` — node-postgres pool.
* `../sql/util.js` — connection-string assembly + helpers.

## Reference
* [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)
* [PostgreSQL ON CONFLICT clause](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
