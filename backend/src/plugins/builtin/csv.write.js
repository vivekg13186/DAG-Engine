import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { resolveSafePath } from "../io/util.js";

export default {
  name: "csv.write",
  description:
    "Write a 2D array of values to a CSV file. The first row is treated as " +
    "the column headers; the rest are data rows. Pass `data` as a ${var} " +
    "reference to a 2D array built upstream (e.g. by a transform node).",

  inputSchema: {
    type: "object",
    required: ["data"],
    properties: {
      path: {
        type: "string",
        title: "File path",
        description:
          "Where to write the CSV. Leave blank to return the rendered text " +
          "on output.text instead.",
      },
      // `data` is type-less so the property panel renders a plain text input
      // (case 8 fallback). The user types a ${var} reference to a 2D array
      // built upstream — e.g. `${matrix}` produced by a transform node.
      data: {
        title: "Data",
        placeholder: "${matrix}",
        description:
          "Reference to a 2D array (use ${var}). First row = headers, rest = " +
          "rows. Build the array upstream with a transform node.",
      },
      delimiter: { type: "string",  title: "Delimiter", default: "," },
      mkdir:     { type: "boolean", title: "Create parent dirs", default: false },
    },
  },

  // What ctx[outputVar] receives when the node-level outputVar is set.
  primaryOutput: "path",

  outputSchema: {
    type: "object",
    required: ["rowCount"],
    properties: {
      path:     { type: "string" },
      text:     { type: "string" },
      rowCount: { type: "integer" },
    },
  },

  async execute({ path: p, data, delimiter = ",", mkdir: doMkdir = false }) {
    // Defensive: a literal JSON string (or, from the previous schema shape,
    // an array of stringified rows) still works.
    data = parseIfJsonString(data);
    if (Array.isArray(data)) {
      data = data.map(row => typeof row === "string" ? parseIfJsonString(row) : row);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(
        "csv.write: data must resolve to a non-empty 2D array. " +
        "Pass `${var}` referencing a 2D array (e.g. produced by transform).",
      );
    }
    const [headers, ...rows] = data;
    if (!Array.isArray(headers)) {
      throw new Error("csv.write: first row of data must be an array of column names");
    }
    if (rows.some(r => !Array.isArray(r))) {
      throw new Error("csv.write: every data row must be an array — got a non-array row");
    }

    const text = stringify(rows, {
      header:  true,
      columns: headers,
      delimiter,
    });
    if (!p) return { text, rowCount: rows.length };
    const abs = resolveSafePath(p);
    if (doMkdir) await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, text, "utf8");
    return { path: abs, rowCount: rows.length };
  },
};

/** Parse a JSON-shaped string; otherwise return the value unchanged. */
function parseIfJsonString(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!(t.startsWith("[") || t.startsWith("{"))) return v;
  try { return JSON.parse(t); }
  catch { return v; }
}
