# Health probes

Daisy exposes two well-known endpoints for liveness + readiness, on
both the API process and (optionally) the worker. Use them from
Kubernetes liveness/readiness probes, Docker `HEALTHCHECK`
directives, or any external uptime monitor.

## The endpoints

| Path        | Where | Purpose | Body |
|-------------|-------|---------|------|
| `/health`   | API   | Legacy summary — kept so existing pollers don't break. | `{ ok, env }` |
| `/healthz`  | API + worker | **Liveness.** 200 as long as the process is responding. Doesn't touch DB/Redis. | `{ ok: true }` |
| `/readyz`   | API + worker | **Readiness.** 200 iff every dependency check passes (Postgres + Redis + on the worker, BullMQ consumer running). 503 with details otherwise. | `{ ok, checks: { pg, redis, ... } }` |

Both are public — no auth, no workspace filtering. Load balancers
and orchestrators don't send tokens.

## Why two endpoints

*Liveness* answers "should I restart this container?". Failing it
triggers a restart, so it must NEVER fail because of a transient
downstream blip — that's a restart loop. Hence /healthz is
intentionally dumb: process responding → 200.

*Readiness* answers "should I send traffic to this container?".
Failing it just takes the instance out of rotation; the orchestrator
retries the probe and re-adds the instance when it comes back. So
readyz can legitimately fail (briefly) if Postgres is restarting, a
Redis failover is in progress, etc. — the LB routes around until
it recovers.

## What /readyz actually checks

The API's /readyz hits two dependencies in parallel:

```
GET /readyz
{
  "ok": true,
  "checks": {
    "pg":    { "ok": true, "ms": 4 },
    "redis": { "ok": true, "ms": 1 }
  }
}
```

Each check is wall-clock bounded at 1.5 seconds — a stuck Postgres
shouldn't pin the probe. Postgres uses `SET LOCAL statement_timeout`
inside the probe's session so even a slow `SELECT 1` returns
quickly. Redis uses the same connection BullMQ does, so no extra
socket per probe.

The worker's /readyz adds one extra check:

```
{
  "ok": true,
  "checks": {
    "pg":     { "ok": true, "ms": 5 },
    "redis":  { "ok": true, "ms": 1 },
    "bullmq": { "ok": true, "ms": 0 }
  }
}
```

The `bullmq` check confirms the BullMQ Worker instance is actually
running (`worker.isRunning()`), not just that the process exists.
This catches the "process is up but BullMQ never recovered after
a Redis hiccup" failure mode.

## Worker probe activation

The probe HTTP server is **opt-in** on the worker via the
`WORKER_HEALTH_PORT` env. Set it to a free port (3100 is the
convention):

```bash
WORKER_HEALTH_PORT=3100
```

Unset → no server bound. In dev (where the worker runs in-process
under the API via `if (config.env !== 'production')` in server.js)
you can leave this empty; the API's /readyz already covers the
in-process worker indirectly.

## Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: daisy-api }
spec:
  template:
    spec:
      containers:
        - name: api
          image: daisy-dag-backend:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:  { path: /healthz, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds:       10
            failureThreshold:    3
          readinessProbe:
            httpGet:  { path: /readyz, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds:       5
            failureThreshold:    2
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: daisy-worker }
spec:
  template:
    spec:
      containers:
        - name: worker
          image: daisy-dag-backend:latest
          command: ["node", "src/worker.js"]
          env:
            - { name: WORKER_HEALTH_PORT, value: "3100" }
          ports:
            - containerPort: 3100
          livenessProbe:
            httpGet:  { path: /healthz, port: 3100 }
            initialDelaySeconds: 15
            periodSeconds:       10
          readinessProbe:
            httpGet:  { path: /readyz, port: 3100 }
            initialDelaySeconds: 10
            periodSeconds:       5
```

Numbers worth tweaking:

- `initialDelaySeconds` — gives the process time to load
  builtins + connect to Postgres/Redis. 5-15s is plenty;
  longer just delays auto-healing.
- `periodSeconds` — how often to probe. 5s for readiness, 10s
  for liveness is the standard ratio.
- `failureThreshold` — how many consecutive failures before
  acting. 2 for readiness (fast pull-out), 3 for liveness
  (avoid restart flapping).

## Docker Compose

The bundled `docker-compose.yml` already includes a `healthcheck:`
on the backend service pointing at `/readyz`. For the worker, add
the same pattern when you split it into its own service:

```yaml
worker:
  build: ./backend
  command: ["node", "src/worker.js"]
  environment:
    WORKER_HEALTH_PORT: "3100"
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:3100/readyz"]
    interval: 10s
    timeout:  3s
    retries:  3
    start_period: 20s
```

`docker ps` will then show `(healthy)` / `(unhealthy)` next to the
container name once enough probes have run.

## Manual verification

```bash
# API
curl -s http://localhost:3000/healthz
curl -s http://localhost:3000/readyz | jq

# Worker (if WORKER_HEALTH_PORT=3100)
curl -s http://localhost:3100/healthz
curl -s http://localhost:3100/readyz | jq

# Force a readiness failure: stop redis, probe again
docker compose stop redis
curl -i http://localhost:3000/readyz       # → 503 with details
docker compose start redis
curl -i http://localhost:3000/readyz       # → 200 within a second
```

## Common failure modes

- **`pg.error: "timed out after 1500ms"`** — Postgres is overloaded
  or unreachable. Check connections (`SELECT count(*) FROM pg_stat_activity`),
  CPU, and recent slow queries.
- **`redis.error: "Connection is closed"`** — the ioredis client
  has lost its connection. Usually recovers within a second when
  the network blips; if persistent, check the Redis pod's logs.
- **`bullmq.error: "worker not running"`** — the BullMQ Worker has
  paused itself (often after losing Redis). The worker process
  needs to restart; the orchestrator will do this automatically
  once liveness fails (or sooner via the readiness pull-out + your
  alerting catching it).

## File map

| File | Role |
|------|------|
| `backend/src/health/checks.js` | `pgPing`, `redisPing`, `readiness` |
| `backend/src/health/workerProbe.js` | tiny http server for the worker |
| `backend/src/server.js` | mounts `/healthz` + `/readyz` |
| `backend/src/worker.js` | starts the probe server when `WORKER_HEALTH_PORT` is set |
| `backend/.env.example` | `WORKER_HEALTH_PORT` docs |
| `docker-compose.yml` | backend `healthcheck:` directive |
