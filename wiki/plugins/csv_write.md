# csv.write

Serialise a 2D array of values to a CSV file (or to a returned string).
The first row is treated as the column headers; subsequent rows are data.

`data` is intentionally a typeless single-line input — you wire it to a
2D array built upstream by a `transform` node (or from a tabular plugin
output that's already in the right shape). The previous `rows` /
`headers` / `header` fields were collapsed into this single input.

## Prerequisites
* **Write permissions** on the destination directory (when `path` is set).
* When `FILE_ROOT` is set, the path must resolve inside it.
* **Input shape:** a 2D array, headers in row 0:
  ```
  [
    ["id", "name"],     // headers
    [1,    "Alice"],    // data row
    [2,    "Bob"]
  ]
  ```

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Optional. Where to write the .csv. Leave blank to return the rendered text on `output.text`. | `./exports/data.csv` |
| `data` | Required. `${var}` reference to a 2D array. The property panel shows this as a single-line text input — type the variable reference, the engine resolves it. | `${matrix}` |
| `delimiter` | Character separating values. Default `,`. | `,` |
| `mkdir` | Create parent dirs if missing. Default `false`. | `true` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute path of the written file (when `path` was set). | `/app/exports/data.csv` |
| `text` | Rendered CSV text (when `path` was omitted). | `id,name\n1,Alice\n` |
| `rowCount` | Number of data rows written (excludes the header row). | `100` |

`primaryOutput`: `path`.

## Sample workflow

A `transform` node builds the 2D matrix from a SELECT result; `csv.write` writes it to disk.

```json
{
  "name": "export-users-to-csv",
  "description": "Pull users, reshape to 2D array, write CSV.",
  "nodes": [
    {
      "name": "get_users",
      "action": "sql.select",
      "inputs": {
        "config": "prodDb",
        "sql":    "SELECT id, name, email FROM users ORDER BY id"
      },
      "outputs": { "rows": "userRows" }
    },
    {
      "name": "to_matrix",
      "action": "transform",
      "inputs": {
        "expression": "[[\"id\", \"name\", \"email\"]] + [for r in userRows return [r.id, r.name, r.email]]"
      },
      "outputs": { "value": "matrix" }
    },
    {
      "name": "write_csv",
      "action": "csv.write",
      "inputs": {
        "path":  "./output/reports/users_export.csv",
        "data":  "${matrix}",
        "mkdir": true
      },
      "outputs": { "path": "finalPath", "rowCount": "totalSaved" }
    },
    {
      "name": "notify",
      "action": "log",
      "inputs": { "message": "Exported ${totalSaved} users to ${finalPath}" }
    }
  ],
  "edges": [
    { "from": "get_users", "to": "to_matrix" },
    { "from": "to_matrix", "to": "write_csv" },
    { "from": "write_csv", "to": "notify" }
  ]
}
```

## Expected output

Writing to a file:

```json
{
  "path":     "/absolute/path/to/output/reports/users_export.csv",
  "rowCount": 50
}
```

Returning text (no `path`):

```json
{
  "text":     "id,name,email\n1,jdoe,john@example.com\n",
  "rowCount": 1
}
```

## Troubleshooting
* **`data must resolve to a non-empty 2D array`.** The `${var}` you wired didn't make it to a 2D array. Check the upstream `transform` expression and confirm the variable name; the JSON tab makes it easy to inspect what was saved.
* **`first row of data must be an array of column names`.** Row 0 is a single value or object instead of an array of strings. Wrap your headers in an array literal: `[["id", "name"]]`.
* **`every data row must be an array — got a non-array row`.** A subsequent row is an object or a scalar. Map your records to arrays in the upstream `transform` node.
* **Permission denied.** Ensure write access to the destination directory.

## Library
* `csv-stringify/sync` — synchronous CSV serialisation.
* `node:fs/promises` — file writes.

## Reference
* [csv-stringify documentation](https://csv.js.org/stringify/)
