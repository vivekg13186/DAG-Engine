import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { resolveSafePath } from "../io/util.js";

export default {
  name: "csv.read",
  description:
    "Parse a CSV file (or inline `text`) into rows. With headers:true (default) " +
    "returns array of objects keyed by header; otherwise array of arrays. " +
    "Wire `rows` to a downstream variable through the Outputs panel " +
    "(rows → <var name>).",

  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        title: "File path",
        description: "Path to a CSV file on disk. Either this or `text` is required.",
      },
      text: {
        type: "string",
        // The property panel renders strings tagged textarea as multi-line.
        format: "textarea",
        title: "CSV text input",
        description: "Inline CSV content. Useful when the data is already in ctx (e.g. from http.request).",
      },
      delimiter: { type: "string",  title: "Delimiter",  default: "," },
      headers:   { type: "boolean", title: "Has header row", default: true },
      skipEmpty: { type: "boolean", title: "Skip empty lines", default: true },
      // Cast numbers / booleans / ISO dates into native JS types.
      cast:      { type: "boolean", title: "Cast values to native types", default: true },
    },
  },

  // What gets written to ctx when the node-level outputVar is set
  // (advanced; only reachable from the JSON tab today).
  primaryOutput: "rows",

  outputSchema: {
    type: "object",
    required: ["rows", "rowCount"],
    properties: {
      path:     { type: "string" },
      rows:     { type: "array" },
      rowCount: { type: "integer" },
      columns:  { type: "array", items: { type: "string" } },
    },
  },

  async execute({ path: p, text, delimiter = ",", headers = true, skipEmpty = true, cast = true }) {
    if (!p && text == null) throw new Error("csv.read requires either `path` or `text`");
    let abs = null, raw = text;
    if (p) {
      abs = resolveSafePath(p);
      raw = await readFile(abs, "utf8");
    }
    const rows = parse(raw, {
      delimiter,
      columns: headers,            // true → use first row as keys → emits objects
      skip_empty_lines: skipEmpty,
      trim: true,
      cast,
      cast_date: false,            // keep dates as strings (parsing varies)
      relax_quotes: true,
    });
    const columns = headers && rows.length
      ? Object.keys(rows[0])
      : (Array.isArray(rows[0]) ? rows[0].map((_, i) => `col${i+1}`) : []);
    return { path: abs, rows, rowCount: rows.length, columns };
  },
};
