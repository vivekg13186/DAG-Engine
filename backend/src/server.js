// MUST stay at the top — telemetry.js starts the OpenTelemetry SDK on
// import, and the auto-instrumentations only hook modules loaded AFTER
// sdk.start(). Anything imported above this line wouldn't be traced.
import "./telemetry.js";

import http from "node:http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { log } from "./utils/logger.js";
import { HttpError } from "./utils/errors.js";
import { loadBuiltins } from "./plugins/registry.js";
import { readiness } from "./health/checks.js";
import authRouter from "./api/auth.js";
import usersRouter from "./api/users.js";
import workspacesRouter from "./api/workspaces.js";
import graphsRouter from "./api/graphs.js";
import executionsRouter from "./api/executions.js";
import pluginsRouter from "./api/plugins.js";
import aiRouter from "./api/ai.js";
import triggersRouter from "./api/triggers.js";
import webhooksRouter from "./api/webhooks.js";
import configsRouter from "./api/configs.js";
import agentsRouter  from "./api/agents.js";
import memoryRouter  from "./api/memory.js";
import { attachWss } from "./ws/broadcast.js";

await loadBuiltins();

const app = express();
// Cookie-aware CORS: when the frontend lives on a different origin
// (dev: 5173 vs API on 3000) we have to mirror the Origin header back
// + send Access-Control-Allow-Credentials:true, otherwise the browser
// silently drops Set-Cookie on the refresh-cookie response.
app.use(cors({
  origin: (origin, cb) => cb(null, origin || true),  // reflect any origin (dev-friendly; tighten in prod)
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("tiny"));

// ──────────────────────────────────────────────────────────────────────
// Health probes — public (no auth) by design. K8s, load balancers,
// and uptime monitors hit these on a tight cadence and don't carry
// auth headers.
//
//   GET /health     legacy summary; kept for back-compat with anything
//                   that already polls it.
//   GET /healthz    liveness — returns 200 as long as the process is
//                   responding. Used by k8s to decide "should I
//                   restart the container?". Must be cheap and never
//                   fail because of a transient downstream blip; a
//                   liveness flap = a restart loop.
//   GET /readyz     readiness — returns 200 only when the process can
//                   actually serve traffic (DB + Redis reachable in
//                   bounded time). 503 with a JSON body otherwise so
//                   the LB can take the instance out of rotation.
// ──────────────────────────────────────────────────────────────────────
app.get("/health",  (_req, res) => res.json({ ok: true, env: config.env }));
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/readyz",  async (_req, res) => {
  const { ok, checks } = await readiness();
  res.status(ok ? 200 : 503).json({ ok, checks });
});

// Auth lives BEFORE the protected routes — and is itself unprotected
// at the router level (login/refresh are public; /me uses requireUser
// inline).
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/workspaces", workspacesRouter);

app.use("/graphs", graphsRouter);
app.use("/executions", executionsRouter);
app.use("/plugins", pluginsRouter);
app.use("/ai", aiRouter);
app.use("/triggers", triggersRouter);
app.use("/configs",  configsRouter);
app.use("/agents",   agentsRouter);
app.use("/memory",   memoryRouter);
// Public webhook endpoint — bypasses /api proxy in dev because the path is
// absolute (/webhooks/<id>). External services hit it directly.
app.use("/webhooks", webhooksRouter);

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  log.error("unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "INTERNAL", message: err.message });
});

const server = http.createServer(app);
attachWss(server);

server.listen(config.port, () => {
  log.info("api listening", { port: config.port });
});

// In dev, also spin up an in-process worker so a single `npm run dev` boots everything.
if (config.env !== "production") {
  await import("./worker.js");
}
