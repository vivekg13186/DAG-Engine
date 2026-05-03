import { runQuery, quoteIdent, buildWhere, safeOrderBy } from "../sql/util.js";

export default {
  name: "sql.select",
  description: "Run a SELECT against a Postgres-compatible DB. Either provide raw `query` + `params`, or use the structured form (`table` + optional `columns` + `where` + `orderBy` + `limit` + `offset`).",
  inputSchema: {
    type: "object",
    properties: {
      connectionString: { type: "string" },
      query:   { type: "string" },
      params:  { type: "array" },
      table:   { type: "string" },
      columns: { type: "array", items: { type: "string" } },
      where:   { type: "object", additionalProperties: true },
      orderBy: { type: "string" },
      limit:   { type: "integer", minimum: 1, maximum: 100000 },
      offset:  { type: "integer", minimum: 0 },
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
      throw new Error("sql.select requires either `query` or `table`");
    }
    const cols = (input.columns && input.columns.length)
      ? input.columns.map(quoteIdent).join(", ")
      : "*";
    let sql = `SELECT ${cols} FROM ${quoteIdent(input.table)}`;
    const { sql: whereSql, params } = buildWhere(input.where);
    sql += whereSql;
    const ord = safeOrderBy(input.orderBy);
    if (ord) sql += ` ORDER BY ${ord}`;
    if (input.limit  != null) sql += ` LIMIT ${parseInt(input.limit, 10)}`;
    if (input.offset != null) sql += ` OFFSET ${parseInt(input.offset, 10)}`;
    return runQuery(input.connectionString, sql, params);
  },
};
