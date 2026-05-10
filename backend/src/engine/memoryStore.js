// Memory store — backs both the KV plugins and the agent's conversation
// history. One Postgres table (`memories`), two namespaces ('kv' and
// 'history'), discriminated by a nullable `seq` column.
//
// Helpers here are intentionally thin — each maps to one or two SQL
// statements, with the JSON parsing handled by the pg driver.

import { v4 as uuid } from "uuid";
import { pool } from "../db/pool.js";

// ──────────────────────────────────────────────────────────────────────
// KV (Layer 1)
// ──────────────────────────────────────────────────────────────────────

/** Read a single KV value. Returns null if the row doesn't exist. */
export async function getKv({ scope = "workflow", scopeId, namespace = "kv", key }) {
  const { rows } = await pool.query(
    `SELECT value FROM memories
       WHERE scope=$1
         AND COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND namespace=$3 AND key=$4 AND seq IS NULL`,
    [scope, scopeId || null, namespace, key],
  );
  return rows[0]?.value ?? null;
}

/**
 * Upsert a KV row. Always sets seq=NULL.
 *
 * The ON CONFLICT target uses index-expression inference against the
 * partial unique index from migration 012 (which COALESCEs scope_id
 * with a sentinel UUID so 'global'-scope rows can also be unique by
 * key). Postgres requires index_expression entries to be wrapped in
 * an extra set of parentheses.
 */
export async function setKv({ scope = "workflow", scopeId, namespace = "kv", key, value }) {
  await pool.query(
    `INSERT INTO memories (id, scope, scope_id, namespace, key, seq, value)
       VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb)
     ON CONFLICT (
       scope,
       (COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)),
       namespace,
       key
     ) WHERE seq IS NULL
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [uuid(), scope, scopeId || null, namespace, key, JSON.stringify(value)],
  );
}

/**
 * Append an item to an array stored under a single KV row. If the row
 * doesn't exist we create it with `[item]`; if it does and the existing
 * value is an array, we push; otherwise we replace with `[item]` (the
 * caller signalled "I want this to be a list" by calling append).
 */
export async function appendKv({ scope = "workflow", scopeId, namespace = "kv", key, item }) {
  const cur = await getKv({ scope, scopeId, namespace, key });
  const next = Array.isArray(cur) ? [...cur, item] : [item];
  await setKv({ scope, scopeId, namespace, key, value: next });
  return next.length;
}

/** Delete a single KV row. Returns true if a row was removed. */
export async function deleteKv({ scope = "workflow", scopeId, namespace = "kv", key }) {
  const { rowCount } = await pool.query(
    `DELETE FROM memories
       WHERE scope=$1
         AND COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND namespace=$3 AND key=$4 AND seq IS NULL`,
    [scope, scopeId || null, namespace, key],
  );
  return rowCount > 0;
}

/**
 * Bulk-load every KV row for a scope. Used by the worker to preload
 * `ctx.memory` at execution start, so plugins / expressions can read
 * stored values via ${memory.<key>} without a per-call DB round-trip.
 *
 * Returns a flat object { <key>: <value> }.
 */
export async function loadKvForScope({ scope = "workflow", scopeId, namespace = "kv" }) {
  const { rows } = await pool.query(
    `SELECT key, value FROM memories
       WHERE scope=$1
         AND COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND namespace=$3 AND seq IS NULL`,
    [scope, scopeId || null, namespace],
  );
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Conversation history (Layer 2)
// ──────────────────────────────────────────────────────────────────────

/**
 * Append a single turn to a conversation. Each conversation lives under
 * key=<conversationId>, and turns are numbered with a monotonic `seq`.
 *
 * Atomicity: we compute MAX(seq)+1 inside a single SQL statement using
 * a sub-select, so two turns submitted in parallel against the same
 * conversation can't pick the same seq under typical pg isolation. If
 * a UNIQUE-violation does happen (two transactions racing for the same
 * seq), we retry once with a re-read — that handles the rare collision
 * without an explicit lock.
 */
export async function appendHistory({
  scope = "workflow", scopeId, conversationId, role, content,
}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await pool.query(
        `INSERT INTO memories (id, scope, scope_id, namespace, key, seq, value)
         SELECT $1, $2, $3, 'history', $4,
                COALESCE(MAX(seq), 0) + 1,
                $5::jsonb
           FROM memories
          WHERE scope=$2
            AND COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
            AND namespace='history' AND key=$4`,
        [uuid(), scope, scopeId || null, conversationId, JSON.stringify({ role, content })],
      );
      return;
    } catch (e) {
      if (e.code !== "23505") throw e;            // not a uniqueness collision
      if (attempt >= 1) throw e;                   // give up after one retry
    }
  }
}

/**
 * Load the most-recent N turns of a conversation, oldest first (so the
 * caller can pass the array straight to the LLM as `messages`).
 */
export async function loadHistory({
  scope = "workflow", scopeId, conversationId, limit = 20,
}) {
  const safeLimit = Math.max(0, Math.min(parseInt(limit, 10) || 0, 200));
  if (!safeLimit) return [];
  const { rows } = await pool.query(
    `WITH recent AS (
        SELECT seq, value
          FROM memories
         WHERE scope=$1
           AND COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)
               = COALESCE($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
           AND namespace='history' AND key=$3
         ORDER BY seq DESC
         LIMIT $4
     )
     SELECT value FROM recent ORDER BY seq ASC`,
    [scope, scopeId || null, conversationId, safeLimit],
  );
  return rows.map(r => r.value);
}

/** Delete every turn of a conversation. Returns the number of rows removed. */
export async function clearHistory({
  scope = "workflow", scopeId, conversationId,
}) {
  const { rowCount } = await pool.query(
    `DELETE FROM memories
       WHERE scope=$1
         AND COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND namespace='history' AND key=$3`,
    [scope, scopeId || null, conversationId],
  );
  return rowCount;
}

// ──────────────────────────────────────────────────────────────────────
// Generic listing — used by the REST endpoint.
// ──────────────────────────────────────────────────────────────────────

export async function listMemories({ scope, scopeId, namespace, prefix, limit = 200 }) {
  const params = [];
  const where = [];
  if (scope)    { params.push(scope);            where.push(`scope = $${params.length}`); }
  if (scopeId)  { params.push(scopeId);          where.push(`scope_id = $${params.length}::uuid`); }
  if (namespace){ params.push(namespace);        where.push(`namespace = $${params.length}`); }
  if (prefix)   { params.push(prefix + "%");     where.push(`key LIKE $${params.length}`); }
  params.push(Math.max(1, Math.min(parseInt(limit, 10) || 200, 1000)));
  const sql = `
    SELECT id, scope, scope_id, namespace, key, seq, value, created_at, updated_at
      FROM memories
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY scope, namespace, key, seq NULLS FIRST
      LIMIT $${params.length}`;
  const { rows } = await pool.query(sql, params);
  return rows;
}
