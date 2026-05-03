import { WebSocketServer } from "ws";
import { redisConnection } from "../queue/queue.js";
import { log } from "../utils/logger.js";
import IORedis from "ioredis";
import { config } from "../config.js";

const CHANNEL = "dag.events";

let wss;
const subscribersByExecution = new Map(); // executionId -> Set<WebSocket>

/** Attach the WS server to an existing HTTP server. */
export function attachWss(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://x");
    const executionId = url.searchParams.get("executionId");
    if (executionId) {
      if (!subscribersByExecution.has(executionId)) subscribersByExecution.set(executionId, new Set());
      subscribersByExecution.get(executionId).add(ws);
      ws.on("close", () => subscribersByExecution.get(executionId)?.delete(ws));
    }
    ws.send(JSON.stringify({ type: "hello", executionId }));
  });

  // Subscribe once to the Redis pub/sub channel so any worker can update us.
  const sub = new IORedis(config.redisUrl);
  sub.subscribe(CHANNEL).catch(e => log.error("redis subscribe failed", { error: e.message }));
  sub.on("message", (_ch, raw) => {
    let evt; try { evt = JSON.parse(raw); } catch { return; }
    const targets = subscribersByExecution.get(evt.executionId);
    if (!targets) return;
    const data = JSON.stringify(evt);
    for (const ws of targets) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  });

  log.info("ws server attached at /ws");
}

/** Publish from anywhere (API or worker). */
export async function publish(event) {
  await redisConnection.publish(CHANNEL, JSON.stringify(event));
}
