# csv.read

Parse CSV from either a local file (`path`) or an inline string (`text`).
Auto-casts numbers and booleans by default, returns either an array of
keyed objects (when headers:true) or an array of arrays.

## Prerequisites
* **Read permissions** for the target file (when using `path`).
* **Format:** any CSV / TSV / pipe-delimited text. The default delimiter is `,`.
* For testing, the inline `text` form works without any filesystem access:
  `id,name\n1,Alice\n2,Bob`.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Path to the CSV file. Either this or `text` is required. | `./data/users.csv` |
| `text` | Inline CSV content. Wins over `path` if both are set; renders as a textarea. | `name,age\nJohn,30` |
| `delimiter` | Character separating values. Default `,`. | `,` |
| `headers` | Use the first row as keys (objects) or not (arrays). Default `true`. | `true` |
| `skipEmpty` | Skip blank lines. Default `true`. | `true` |
| `cast` | Auto-cast numeric / boolean strings. Default `true`. | `true` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute resolved path (only when `path` was set). | `/app/data/users.csv` |
| `rows` | Array of records (objects when `headers:true`, arrays otherwise). | `[{"id": 1, "name": "Alice"}]` |
| `rowCount` | Number of records parsed. | `150` |
| `columns` | Detected column names. With headers, it's the first row; without, synthetic `col1` / `col2` / … | `["id", "name"]` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "process-inventory-csv",
  "description": "Read inventory.csv and log a summary of what we got.",
  "nodes": [
    {
      "name": "read_inventory",
      "action": "csv.read",
      "inputs": {
        "path":    "./imports/inventory.csv",
        "headers": true,
        "cast":    true
      },
      "outputs": { "rows": "items", "rowCount": "totalItems" }
    },
    {
      "name": "summarize",
      "action": "log",
      "inputs": {
        "message": "CSV load complete. Found ${totalItems} items. Top item: ${items[0].productName}"
      }
    }
  ],
  "edges": [
    { "from": "read_inventory", "to": "summarize" }
  ]
}
```

## Expected output

```json
{
  "path":     "/absolute/path/to/imports/inventory.csv",
  "rowCount": 2,
  "columns":  ["id", "productName", "stock"],
  "rows": [
    { "id": 1, "productName": "Widget A", "stock": 50 },
    { "id": 2, "productName": "Widget B", "stock": 12 }
  ]
}
```

## Troubleshooting
* **File not found.** `path` is wrong; remember it's resolved relative to `FILE_ROOT` (when set) or the worker's `cwd`.
* **Wrong delimiter.** Some files use `;` or `\t` — set `delimiter` explicitly.
* **Cast eating your data.** If a column contains strings that look like numbers but should stay as strings (e.g. ZIP codes), set `cast: false`.
* **Malformed quotes.** `relax_quotes` is enabled internally so most odd quoting still parses, but a single rogue stray quote can still break a line.

## Library
* `csv-parse/sync` — synchronous CSV parser.
* `node:fs/promises` — file reading.

## Reference
* [csv-parse documentation](https://csv.js.org/parse/)
* [RFC 4180 (CSV)](https://datatracker.ietf.org/doc/html/rfc4180)
