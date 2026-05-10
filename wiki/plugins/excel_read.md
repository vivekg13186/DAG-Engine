# excel.read

Read data from a Microsoft Excel (.xlsx) file. Supports a specific sheet
(by name) or all sheets at once, and renders rich cell types (formulas,
hyperlinks, dates) into plain JSON-friendly values.

## Prerequisites
* **Read permissions** for the target file.
* **Format:** `.xlsx` only — legacy `.xls` (binary) is not supported.
* For testing, build a small workbook in Google Sheets or LibreOffice and download as .xlsx.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. Path to the .xlsx file. | `./imports/report.xlsx` |
| `sheet` | Sheet name to read. Defaults to the first sheet. | `Sales Data` |
| `headers` | Use the first row as keys (objects). Default `true`. | `true` |
| `allSheets` | Return data from every sheet at once. Default `false`. | `false` |

## Outputs

Single-sheet mode:

| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute path. | `/app/imports/report.xlsx` |
| `sheet` | Name of the sheet that was read. | `Sheet1` |
| `columns` | Detected column names (when `headers:true`). | `["id", "name"]` |
| `rows` | Array of records. | `[{"id": 1, "name": "Alice"}]` |
| `rowCount` | Number of records. | `25` |

Multi-sheet mode (`allSheets: true`):

| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute path. | `/app/imports/report.xlsx` |
| `sheets` | Array of `{ sheet, columns, rows, rowCount }` per worksheet. | `[{"sheet": "Q1", "rows": [...]}]` |

`primaryOutput`: `rows`.

## Sample workflow

```json
{
  "name": "process-monthly-excel",
  "description": "Read the Financials sheet, log how many rows came back.",
  "nodes": [
    {
      "name": "read_excel",
      "action": "excel.read",
      "inputs": {
        "path":    "./data/monthly_report.xlsx",
        "sheet":   "Financials",
        "headers": true
      },
      "outputs": { "rows": "financeRows", "rowCount": "totalRecords" }
    },
    {
      "name": "report_summary",
      "action": "log",
      "inputs": {
        "message": "Excel processing complete. ${totalRecords} rows imported from Financials."
      }
    }
  ],
  "edges": [
    { "from": "read_excel", "to": "report_summary" }
  ]
}
```

## Expected output

```json
{
  "path":     "/absolute/path/to/monthly_report.xlsx",
  "sheet":    "Financials",
  "columns":  ["TransactionID", "Amount", "Status"],
  "rows": [
    { "TransactionID": "TXN001", "Amount": 1500.50, "Status": "Paid" },
    { "TransactionID": "TXN002", "Amount":  200.00, "Status": "Pending" }
  ],
  "rowCount": 2
}
```

## Troubleshooting
* **Sheet not found.** The `sheet` name doesn't match (it's case-sensitive and trims aren't forgiven). Open the workbook and check the tab label.
* **Rich cell quirks.** Formulas yield their last calculated `result`; hyperlinks become their text; dates become ISO strings (UTC). If you need the raw cell, drop into a custom plugin.
* **Large workbooks.** Very big files can spike worker memory. Consider splitting the source, or read sheet-by-sheet rather than `allSheets: true`.

## Library
* `exceljs` — workbook reading / writing.

## Reference
* [ExcelJS documentation](https://github.com/exceljs/exceljs)
