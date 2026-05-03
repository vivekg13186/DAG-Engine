import { runQuery, quoteIdent, buildWhere } from "../sql/util.js";

export default {
  name: "sql.delete",
  description: "DELETE rows from a table. Provide raw `query` + `params`, or `table` + `where`. Refuses to TRUNCATE-by-accident: an empty `where` requires `unsafe: true`.",
  inputSchema: {
    type: "object",
    properties: {
      connectionString: { type: "string" },
      query:     { type: "string" },
      params:    { type: "array" },
      table:     { type: "string" },
      where:     { type: "object", additionalProperties: true },
      returning: { type: "array", items: { type: "string" } },
      unsafe:    { type: "boolean", default: false },
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
    if (!input.table) {
      throw new Error("sql.delete requires either `query` or `table`");
    }
    if ((!input.where || Object.keys(input.where).length === 0) && !input.unsafe) {
      throw new Error("sql.delete: refusing DELETE without WHERE (set unsafe:true to override)");
    }

    let sql = `DELETE FROM ${quoteIdent(input.table)}`;
    const { sql: whereSql, params } = buildWhere(input.where);
    sql += whereSql;
    if (input.returning && input.returning.length) {
      sql += ` RETURNING ${input.returning.map(quoteIdent).join(", ")}`;
    }
    return runQuery(input.connectionString, sql, params);
  },
};
