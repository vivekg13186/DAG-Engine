import { runQuery, quoteIdent } from "../sql/util.js";

export default {
  name: "sql.insert",
  description: "INSERT one or more rows. Provide raw `query` + `params`, or `table` + `values` (object or array of objects). `returning` selects columns to return.",
  inputSchema: {
    type: "object",
    properties: {
      connectionString: { type: "string" },
      query:     { type: "string" },
      params:    { type: "array" },
      table:     { type: "string" },
      // values: object (single row) or array of objects (bulk). Schema kept loose.
      values:    {},
      returning: { type: "array", items: { type: "string" } },
      onConflict: { type: "string", enum: ["nothing", "error"], default: "error" },
    },
  },
  // What ctx[outputVar] receives when the node-level outputVar is set.
  primaryOutput: "rows",

  outputSchema: {
    type: "object",
    required: ["rows", "rowCount"],
    properties: {
      rows:     { type: "array" },
      rowCount: { type: "integer" },
    },
  },
  async execute(input) {
    if (input.query) {
      return runQuery(input.connectionString, input.query, input.params || []);
    }
    if (!input.table || input.values == null) {
      throw new Error("sql.insert requires either `query` or `table` + `values`");
    }

    const rowsArr = Array.isArray(input.values) ? input.values : [input.values];
    if (rowsArr.length === 0) throw new Error("sql.insert: empty `values`");

    // Use the first row's keys as the column list. Subsequent rows must match.
    const cols = Object.keys(rowsArr[0]);
    if (cols.length === 0) throw new Error("sql.insert: row has no columns");

    const params = [];
    const tuples = rowsArr.map((row) => {
      const ph = cols.map((c) => {
        params.push(row[c]);
        return `$${params.length}`;
      });
      return `(${ph.join(", ")})`;
    });

    let sql = `INSERT INTO ${quoteIdent(input.table)} (${cols.map(quoteIdent).join(", ")})`
            + ` VALUES ${tuples.join(", ")}`;
    if (input.onConflict === "nothing") sql += " ON CONFLICT DO NOTHING";
    if (input.returning && input.returning.length) {
      sql += ` RETURNING ${input.returning.map(quoteIdent).join(", ")}`;
    }
    return runQuery(input.connectionString, sql, params);
  },
};
