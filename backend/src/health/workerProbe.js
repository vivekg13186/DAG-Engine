// Tiny HTTP probe server for the worker process.
//
// The worker is a separate process from the API in production, so
// k8s / docker need a way to ask "is the worker alive and able to
// pull jobs?" — the API's /readyz only proves the API is healthy,
// not that BullMQ is actually consuming the queue.
//
// What this serves:
//   GET /healthz   200 if the process is responding (liveness)
//   GET /readyz    200 iff pg ok + redis ok + the BullMQ Worker
//                  is currently running. 503 with details otherwise.
//
// Activation:
//   Opt-in via WORKER_HEALTH_PORT. Default = unset → no server.
//   In production deployments set WORKER_HEALTH_PORT=3100 (or
//   whatever your platform expects) so k8s/docker healthcheck
//   directives have somewhere to hit.
//
// Bare http.createServer instead of Express because:
//   • Two trivial routes; no need for the routing layer.
//   • Probes are hit constantly; the smaller the request path the
//     less CPU it eats.
//   • Independent of the API's express instance, so a stuck API
//     route doesn't shadow the probe.

import http from "node:http";
import { log } from "../utils/logger.js";
import { readiness } from "./checks.js";

let _server = null;

/**
 * Start the probe server.
 *
 * @param {object} opts
 *   - port:        number — required; the function bails when 0 / unset
 *   - worker:      BullMQ Worker instance — used to test "queue
 *                  consumer running" as part of readiness.
 *   - host:        bind address; defaults to 0.0.0.0 (in-container).
 */
export function startWorkerProbe({ port, worker, host = "0.0.0.0" } = {}) {
  if (!port || _server) return null;
  _server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/healthz") {
        return reply(res, 200, { ok: true });
      }
      if (req.url === "/readyz") {
        // Add a worker-specific check: BullMQ Worker has a
        // .isRunning() / .running flag depending on version.
        // Treat the absence of the method as "we can't tell, so
        // pass" — better to false-pass during a healthcheck than
        // to false-fail when BullMQ's API moves.
        const bullmqOk = workerIsRunning(worker);
        const extra = {
          bullmq: bullmqOk
            ? { ok: true, ms: 0 }
            : { ok: false, ms: 0, error: "worker not running" },
        };
        const { ok, checks } = await readiness(extra);
        return reply(res, ok ? 200 : 503, { ok, checks });
      }
      reply(res, 404, { ok: false, error: "not found" });
    } catch (e) {
      // Never let a probe handler throw — it would tear down the
      // node http server.
      reply(res, 500, { ok: false, error: e?.message || "probe handler crashed" });
    }
  });
  _server.listen(port, host, () => {
    log.info("worker probe listening", { port, host });
  });
  return _server;
}

export function stopWorkerProbe() {
  if (!_server) return;
  try { _server.close(); } catch { /* ignore */ }
  _server = null;
}

function reply(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function workerIsRunning(worker) {
  if (!worker) return false;
  // BullMQ v4+ exposes isRunning(); older revisions had a `running`
  // property. Treat both as the same signal.
  if (typeof worker.isRunning === "function") return !!worker.isRunning();
  if (typeof worker.running === "boolean")    return worker.running;
  if (typeof worker.isPaused === "function")  return !worker.isPaused();
  return true;     // can't introspect → trust that boot succeeded
}
