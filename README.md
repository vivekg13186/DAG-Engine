# DAG Workflow Engine

A production-ready DAG (Directed Acyclic Graph) workflow engine driven by a YAML DSL.
Validates, executes, and visualizes workflows with support for parallel execution,
retries, conditional branching, batch iteration, and pluggable actions.

## Stack

- **Backend** — Node.js (plain JS, ESM), Express, BullMQ + Redis, PostgreSQL (JSONB), `ws` for live updates.
- **Engine** — pure-JS DAG executor with a topological scheduler, parallel-layer execution, retries, conditional execution, batch input fan-out, and a pluggable action registry.
- **Frontend** — Vue 3 + Vite + Pinia + `@vue-flow/core` for graph rendering, CodeMirror for the YAML editor.
- **Infra** — `docker-compose.yml` brings up Postgres + Redis for local development.

## Repo layout

```
DAG Engine/
├── backend/            Node API, queue worker, engine, plugins, migrations
│   ├── src/
│   │   ├── api/        Express routes (graphs, executions, validate)
│   │   ├── db/         Postgres pool + migration runner
│   │   ├── dsl/        YAML parser, schema, expression evaluator, cycle check
│   │   ├── engine/     DAG scheduler / executor
│   │   ├── plugins/    Plugin registry + built-in actions
│   │   ├── queue/      BullMQ producer + worker
│   │   ├── ws/         WebSocket broadcaster
│   │   └── utils/      logger, errors
│   ├── migrations/     SQL files
│   └── samples/        Example DAG YAML files
├── frontend/           Vue 3 + Vite SPA
├── docker/             Dockerfiles
├── docker-compose.yml  Postgres + Redis + (optional) backend/frontend
└── docs/               Architecture, DSL reference, plugin guide
```

## Quick start

```bash
# 1. Spin up Postgres + Redis
docker compose up -d postgres redis

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev          # starts API (3000) + worker + websocket

# 3. Frontend
cd ../frontend
npm install
npm run dev          # http://localhost:5173
```

## DSL example

See `backend/samples/hello-world.yaml`:

```yaml
name: hello-world
version: "1.0"
data:
  who: "world"

nodes:
  - name: greet
    action: log
    inputs:
      message: "Hello, ${data.who}!"

  - name: pause
    action: delay
    inputs:
      ms: 200

  - name: done
    action: log
    inputs:
      message: "finished at ${nodes.pause.completedAt}"

edges:
  - { from: greet, to: pause }
  - { from: pause, to: done }
```

## API

| Method | Route                       | Purpose                           |
|--------|-----------------------------|-----------------------------------|
| POST   | `/graphs`                   | Create graph (new version)        |
| PUT    | `/graphs/:id`               | Update graph (bumps version)      |
| DELETE | `/graphs/:id`               | Soft-delete graph                 |
| GET    | `/graphs`                   | List graphs                       |
| GET    | `/graphs/:id`               | Fetch one graph                   |
| POST   | `/graphs/validate`          | Validate YAML without saving      |
| POST   | `/graphs/:id/execute`       | Enqueue execution                 |
| GET    | `/executions/:id`           | Execution + node logs             |
| GET    | `/executions?graphId=...`   | List executions                   |
| WS     | `/ws`                       | Live node-status events           |

See `docs/ARCHITECTURE.md` for component diagrams and execution algorithm.
