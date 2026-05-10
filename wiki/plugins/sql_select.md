# sql.select

Runs a parameterised SELECT against a stored database configuration.
The plugin shape is uniform across the SQL family: `config` (name of a
stored configuration) + `sql` (query text with `$1`, `$2`, … placeholders)
+ `params` (var-input that resolves to an array of bound values).

The structured-form helpers (`table`, `columns`, `where`, `orderBy`,
`limit`, `offset`) and the per-call `connectionString` were dropped.
Write the SQL yourself — you have full control, the engine pools the
connection per stored config.

## Prerequisites
* **A stored database configuration.** Home → **Configurations** → **+ New** → type **database**. Fill in `host`, `port`, `database`, `username`, `password`, `ssl`. The password is encrypted at rest.
* **Read permissions** on the target table for the configured user.
* **Mock setup:** a free Postgres tier from Neon, Supabase, or ElephantSQL works fine. Pagila / dvd_rental sample DBs are a good way to get realistic data.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Name of the stored database configuration. | `prodDb` |
| `sql` | Required. The SELECT statement, with `$1`, `$2`, … placeholders. Multi-line. | `SELECT id, email FROM users WHERE active = $1 ORDER BY id LIMIT $2` |
| `params` | Optional `${var}` reference to an array of values for the placeholders. Build it upstream with a `transform` node, or omit when the SQL has no placeholders. | `${queryParams}` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `rows` | Array of objects, keyed by column name. | `[{"id": 1, "email": "alice@example.com"}]` |
| `rowCount` | Number of rows returned. | `2` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "fetch-active-customers",
  "description": "Pull a paginated list of active customers, log a summary.",
  "data": { "limit": 50 },
  "nodes": [
    {
      "name": "build_params",
      "action": "transform",
      "inputs": { "expression": "[true, data.limit]" },
      "outputs": { "value": "queryParams" }
    },
    {
      "name": "get_customers",
      "action": "sql.select",
      "inputs": {
        "config": "prodDb",
        "sql":    "SELECT id, name, email FROM customers WHERE active = $1 ORDER BY last_login DESC LIMIT $2",
        "params": "${queryParams}"
      },
      "outputs": { "rows": "customerList", "rowCount": "count" }
    },
    {
      "name": "process_data",
      "action": "log",
      "executeIf": "${count > 0}",
      "inputs": {
        "message": "Found ${count} active customers. First: ${customerList[0].name}"
      }
    }
  ],
  "edges": [
    { "from": "build_params",  "to": "get_customers" },
    { "from": "get_customers", "to": "process_data" }
  ]
}
```

## Expected output

```json
{
  "rows": [
    { "id": 10, "name": "Alice", "email": "alice@example.com" },
    { "id": 15, "name": "Bob",   "email": "bob@example.com" }
  ],
  "rowCount": 2
}
```

## Troubleshooting
* **`config "<name>" not found`.** No stored configuration with that name. Open Home → Configurations and verify the row, or create one of type `database`.
* **`config "<name>" has no host set`.** The stored configuration is missing required fields. Re-open it and fill in `host` and `database`.
* **`params` must resolve to an array.** A typeless input — type a `${var}` reference. The engine resolves it before the plugin runs. Build the array upstream with a `transform` node (e.g. `[42, "active"]`).
* **Placeholder mismatch.** `$3` referenced but `params` only has two entries → Postgres throws. Make `params` length match the highest placeholder index.

## Library
* `pg` — node-postgres pool (one per distinct connection string).
* `../sql/util.js` — connection-string assembly + `runQuery` / `normalizeParams` helpers.

## Reference
* [PostgreSQL SELECT documentation](https://www.postgresql.org/docs/current/sql-select.html)
* [Parameterised queries in node-postgres](https://node-postgres.com/features/queries#parameterized-query)
