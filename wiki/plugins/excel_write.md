# excel.write

Write a 2D array of values to an .xlsx file. The first row is treated
as the column headers (rendered bold); the rest are data rows.

`data` is intentionally a typeless single-line input — wire it to a 2D
array built upstream by a `transform` node. The previous multi-sheet /
`rows` / `headers` / `sheets` form was collapsed into this single input.
For multiple sheets, run multiple `excel.write` nodes (or build a
custom plugin).

## Prerequisites
* **Write permissions** on the destination directory.
* When `FILE_ROOT` is set, the path must resolve inside it.
* **Input shape:** a 2D array, headers in row 0:
  ```
  [
    ["sku", "qty", "price"],   // headers
    ["a-1", 3, 1.50],
    ["b-2", 7, 9.99]
  ]
  ```

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. Where to write the .xlsx file. | `./exports/report.xlsx` |
| `sheet` | Worksheet name. Default `Sheet1`. | `Summary` |
| `data` | Required. `${var}` reference to a 2D array. | `${matrix}` |
| `mkdir` | Create parent dirs if missing. Default `false`. | `true` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute path of the written file. | `/app/exports/report.xlsx` |
| `sheet` | Name of the worksheet written. | `Sheet1` |
| `rowCount` | Number of data rows written (excludes the header row). | `2` |

`primaryOutput`: `path`.

## Sample workflow

A `transform` node assembles the 2D matrix; `excel.write` writes the workbook.

```json
{
  "name": "export-sales-to-xlsx",
  "description": "Build a 2D matrix from sales data and write it to disk.",
  "data": {
    "salesData": [
      { "Date": "2026-05-01", "Total": 500 },
      { "Date": "2026-05-02", "Total": 720 }
    ]
  },
  "nodes": [
    {
      "name": "to_matrix",
      "action": "transform",
      "inputs": {
        "expression": "[[\"Date\", \"Total\"]] + [for r in data.salesData return [r.Date, r.Total]]"
      },
      "outputs": { "value": "matrix" }
    },
    {
      "name": "generate_excel",
      "action": "excel.write",
      "inputs": {
        "path":  "./reports/Sales.xlsx",
        "sheet": "Sales",
        "data":  "${matrix}",
        "mkdir": true
      },
      "outputs": { "path": "fullPath" }
    },
    {
      "name": "log_result",
      "action": "log",
      "inputs": { "message": "Report generated at ${fullPath}" }
    }
  ],
  "edges": [
    { "from": "to_matrix",      "to": "generate_excel" },
    { "from": "generate_excel", "to": "log_result" }
  ]
}
```

## Expected output

```json
{
  "path":     "/home/user/project/reports/Sales.xlsx",
  "sheet":    "Sales",
  "rowCount": 2
}
```

## Troubleshooting
* **`data must resolve to a non-empty 2D array`.** Same advice as `csv.write` — confirm the upstream `transform` expression and the variable reference.
* **`first row of data must be an array of column names`.** Wrap your headers in an array: `[["id", "name"]]`.
* **`every data row must be an array — got a non-array row`.** Map your records to arrays in the upstream `transform`.
* **File locked.** If the target file is open in Excel/Numbers, the write will fail with a permission error. Close it first.
* **Large datasets.** For 100k+ rows, prefer `csv.write` (much lower memory).

## Library
* `exceljs` — workbook generation.
* `node:fs/promises` — directory creation.

## Reference
* [ExcelJS documentation](https://github.com/exceljs/exceljs)
