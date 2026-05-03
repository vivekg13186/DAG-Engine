import { runQuery, quoteIdent } from "../sql/util.js";

export default {
  name: "sql.execute",
  description: "Execute a stored procedure (CALL ...), a table-returning function (SELECT * FROM fn(...)), or any raw SQL statement.",
  inputSchema: {
    type: "object",
    properties: {
      connectionString: { type: "string" },
      // EITHER raw SQL ...
      query:     { type: "string" },
      params:    { type: "array" },
      // ... OR a stored proc to CALL ...
      procedure: { type: "string" },
      // ... OR a function to SELECT from.
      function:  { type: "string" },
      args:      { type: "array" },
    },
  },
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
    const args = Array.isArray(input.args) ? input.args : [];
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");

    if (input.procedure) {
      const sql = `CALL ${quoteIdent(input.procedure)}(${placeholders})`;
      return runQuery(input.connectionString, sql, args);
    }
    if (input.function) {
      const sql = `SELECT * FROM ${quoteIdent(input.function)}(${placeholders})`;
      return runQuery(input.connectionString, sql, args);
    }
    throw new Error("sql.execute requires one of: `query`, `procedure`, or `function`");
  },
};
