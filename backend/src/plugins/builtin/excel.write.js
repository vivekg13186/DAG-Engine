import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveSafePath } from "../io/util.js";

export default {
  name: "excel.write",
  description:
    "Write a 2D array of values to an .xlsx file. The first row is treated " +
    "as the column headers (rendered bold); the rest are data rows. Pass " +
    "`data` as a ${var} reference to a 2D array built upstream " +
    "(e.g. by a transform node).",

  inputSchema: {
    type: "object",
    required: ["path", "data"],
    properties: {
      path: {
        type: "string",
        title: "File path",
        description: "Where to write the .xlsx file.",
      },
      sheet: {
        type: "string",
        title: "Sheet name",
        default: "Sheet1",
      },
      // `data` is type-less so the property panel renders a plain text input.
      // The user types a ${var} reference; the engine resolves it to the
      // actual 2D array before this plugin runs.
      data: {
        title: "Data",
        placeholder: "${matrix}",
        description:
          "Reference to a 2D array (use ${var}). First row = headers, rest = " +
          "rows. Build the array upstream with a transform node.",
      },
      mkdir: { type: "boolean", title: "Create parent dirs", default: false },
    },
  },

  // What ctx[outputVar] receives when the node-level outputVar is set.
  primaryOutput: "path",

  outputSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path:     { type: "string" },
      sheet:    { type: "string" },
      rowCount: { type: "integer" },
    },
  },

  async execute({ path: p, sheet = "Sheet1", data, mkdir: doMkdir = false }) {
    data = parseIfJsonString(data);
    if (Array.isArray(data)) {
      data = data.map(row => typeof row === "string" ? parseIfJsonString(row) : row);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(
        "excel.write: data must resolve to a non-empty 2D array. " +
        "Pass `${var}` referencing a 2D array (e.g. produced by transform).",
      );
    }
    const [headers, ...rows] = data;
    if (!Array.isArray(headers)) {
      throw new Error("excel.write: first row of data must be an array of column names");
    }
    if (rows.some(r => !Array.isArray(r))) {
      throw new Error("excel.write: every data row must be an array — got a non-array row");
    }

    const abs = resolveSafePath(p);
    if (doMkdir) await mkdir(path.dirname(abs), { recursive: true });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheet);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r);

    await wb.xlsx.writeFile(abs);
    return { path: abs, sheet, rowCount: rows.length };
  },
};

function parseIfJsonString(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!(t.startsWith("[") || t.startsWith("{"))) return v;
  try { return JSON.parse(t); }
  catch { return v; }
}
