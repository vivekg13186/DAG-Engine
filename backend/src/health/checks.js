// Probe helpers shared by the API and worker health endpoints.
//
// Design contract:
//   • Each check returns { ok: boolean, ms: number, error?: string }.
//     `ms` is wall-clock for the check itself — surfaced in the
//     /readyz JSON so an operator can see "DB took 800ms" before
//     it actually fails. `error` is a short string, not a stack.
//
//   • Every check is bounded by a hard timeout (default 1.5s).
//     Readiness probes that take 30 seconds to fail are the worst
//     case — k8s thinks the pod is up while the LB is sending it
//     traffic that 504s.
//
//   • No side effects beyond a single round-trip. Don't write rows,
//     don't acquire long locks, don't enqueue jobs. Probes are hit
//     once per second by load balancers; cumulative cost matters.

import { pool } from "../db/pool.js";
import { redisConnection } from "../queue/queue.js";

const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Wrap a promise in a wall-clock timeout. On timeout the result
 * is `{ ok: false, error: "timed out" }` — same shape as a
 * connection failure so callers don't have to branch.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const racer = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, racer]).finally(() => clearTimeout(timer));
}

/**
 * Run `SELECT 1` against the pool with a strict statement_timeout
 * so a misconfigured / overloaded Postgres can't pin the probe.
 *
 * Returns { ok, ms, error? }.
 */
export async function pgPing(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();
  try {
    await withTimeout((async () => {
      const c = await pool.connect();
      try {
        // statement_timeout is local to this client session — won't
        // affect normal queries from other clients. The trailing
        // SELECT 1 is the actual probe.
        await c.query(`SET LOCAL statement_timeout = ${Math.max(100, timeoutMs - 200)}`);
        await c.query("SELECT 1");
      } finally {
        c.release();
      }
    })(), timeoutMs, "pgPing");
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: shortError(e) };
  }
}

/**
 * PING the Redis connection BullMQ is using. Reuses the live
 * connection so we don't open a fresh socket per probe (every-
 * second probes × N pods = a small but real burden on Redis).
 */
export async function redisPing(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();
  try {
    const reply = await withTimeout(redisConnection.ping(), timeoutMs, "redisPing");
    const ok = reply === "PONG";
    return { ok, ms: Date.now() - t0, ...(ok ? {} : { error: `unexpected reply: ${reply}` }) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: shortError(e) };
  }
}

function shortError(e) {
  const s = e?.message || String(e);
  // Trim absurd stacks / pg error chains so a JSON probe response
  // stays readable in `curl` output.
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

/**
 * Aggregate every check that matters for readiness. Used by both
 * the API's /readyz and the worker's /readyz. Returns:
 *
 *     { ok: bool, checks: { pg: {...}, redis: {...}, ...extra } }
 *
 * `extra` lets the worker tack on additional checks (e.g.
 * "BullMQ worker is running") without duplicating the helper.
 */
export async function readiness(extra = {}) {
  const [pg, redis] = await Promise.all([pgPing(), redisPing()]);
  const checks = { pg, redis, ...extra };
  const ok = Object.values(checks).every((c) => c?.ok);
  return { ok, checks };
}
