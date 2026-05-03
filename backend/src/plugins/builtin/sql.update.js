import { runQuery, quoteIdent, buildWhere } from "../sql/util.js";

export default {
  name: "sql.update",
  description: "UPDATE rows in a table. Provide raw `query` + `params`, or `table` + `set` + (recommended) `where`. Refuses unconditional updates unless `unsafe: true`.",
  inputSchema: {
    type: "object",
    properties: {
      connectionString: { type: "string" },
      query:     { type: "string" },
      params:    { type: "array" },
      table:     { type: "string" },
      set:       { type: "object", additionalProperties: true },
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
    if (!input.table || !input.set) {
      throw new Error("sql.update requires either `query` or `table` + `set`");
    }
    const setKeys = Object.keys(input.set);
    if (setKeys.length === 0) throw new Error("sql.update: empty `set`");
    if ((!input.where || Object.keys(input.where).length === 0) && !input.unsafe) {
      throw new Error("sql.update: refusing UPDATE without WHERE (set unsafe:true to override)");
    }

    const params = [];
    const setSql = setKeys.map((k) => {
      params.push(input.set[k]);
      return `${quoteIdent(k)} = $${params.length}`;
    }).join(", ");

    let sql = `UPDATE ${quoteIdent(input.table)} SET ${setSql}`;
    const { sql: whereSql, params: whereParams } = buildWhere(input.where, params.length + 1);
    sql += whereSql;
    params.push(...whereParams);
    if (input.returning && input.returning.length) {
      sql += ` RETURNING ${input.returning.map(quoteIdent).join(", ")}`;
    }
    return runQuery(input.connectionString, sql, params);
  },
};
