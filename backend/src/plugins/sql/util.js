// Shared helpers for the SQL action plugins.
//
// Lives outside src/plugins/builtin/ so the plugin auto-loader doesn't try to
// register it as an action. All five sql.* plugins import from here.

import pg from "pg";
import { config } from "../../config.js";
import { log } from "../../utils/logger.js";

// One pool per distinct connection string — opens lazily, reused across calls.
const pools = new Map();

export function getPool(connectionString) {
  const cs = connectionString || config.databaseUrl;
  let pool = pools.get(cs);
  if (!pool) {
    pool = new pg.Pool({ connectionString: cs, max: 5 });
    pool.on("error", (e) => log.warn("sql pool error", { error: e.message }));
    pools.set(cs, pool);
  }
  return pool;
}

// Identifier (table / column / schema-qualified) — quoted as "name" with strict
// validation to keep it nowhere near user-controlled SQL.
const IDENT_PART = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function quoteIdent(name) {
  if (typeof name !== "string" || !name.length) {
    throw new Error(`Invalid identifier: ${JSON.stringify(name)}`);
  }
  const parts = name.split(".");
  for (const p of parts) {
    if (!IDENT_PART.test(p)) {
      throw new Error(`Invalid identifier: ${JSON.stringify(name)}`);
    }
  }
  return parts.map(p => `"${p}"`).join(".");
}

// `orderBy` is necessarily raw-ish, so we validate the shape: comma-separated
// list of column names (optionally schema-qualified), each followed by an
// optional ASC | DESC | NULLS FIRST | NULLS LAST. Everything else is rejected.
const ORDERBY_OK = /^[A-Za-z_][\w.]*(\s+(ASC|DESC))?(\s+NULLS\s+(FIRST|LAST))?(\s*,\s*[A-Za-z_][\w.]*(\s+(ASC|DESC))?(\s+NULLS\s+(FIRST|LAST))?)*$/i;
export function safeOrderBy(s) {
  if (s == null || s === "") return "";
  if (typeof s !== "string" || !ORDERBY_OK.test(s.trim())) {
    throw new Error(`Invalid orderBy: ${s}`);
  }
  return s.trim();
}

/**
 * Build a parameterized WHERE clause from a key-value object.
 *   { id: 1, status: "x" } → " WHERE \"id\" = $1 AND \"status\" = $2"
 *   { col: null }          → " WHERE \"col\" IS NULL"  (no param consumed)
 *   { col: ["a", "b"] }    → " WHERE \"col\" = ANY($1)"
 */
export function buildWhere(where, startIdx = 1) {
  if (!where || typeof where !== "object" || Array.isArray(where)) {
    return { sql: "", params: [] };
  }
  const keys = Object.keys(where);
  if (keys.length === 0) return { sql: "", params: [] };
  const params = [];
  let idx = startIdx;
  const parts = keys.map((k) => {
    const v = where[k];
    if (v === null) return `${quoteIdent(k)} IS NULL`;
    if (Array.isArray(v)) {
      params.push(v);
      return `${quoteIdent(k)} = ANY($${idx++})`;
    }
    params.push(v);
    return `${quoteIdent(k)} = $${idx++}`;
  });
  return { sql: ` WHERE ${parts.join(" AND ")}`, params };
}

/** Run a parameterized query and return { rows, rowCount }. */
export async function runQuery(connectionString, sql, params = []) {
  const pool = getPool(connectionString);
  const { rows, rowCount } = await pool.query(sql, params);
  return { rows, rowCount: rowCount ?? 0 };
}
