import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDag } from "../src/dsl/parser.js";
import { executeDag, NodeStatus } from "../src/engine/executor.js";
import { registry, loadBuiltins } from "../src/plugins/registry.js";

await loadBuiltins();

// Register a fake "fail-once" plugin used by the retry test.
let failOnceCount = 0;
registry.register({
  name: "fail-once",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  async execute() {
    failOnceCount++;
    if (failOnceCount === 1) throw new Error("transient");
    return { ok: true };
  },
});

test("executeDag runs a linear DAG successfully", async () => {
  const parsed = parseDag(`
name: t
version: "1.0"
nodes:
  - { name: a, action: log, inputs: { message: "hi a" } }
  - { name: b, action: log, inputs: { message: "hi b" } }
edges:
  - { from: a, to: b }
`);
  const r = await executeDag(parsed);
  assert.equal(r.status, "success");
  assert.equal(r.nodes.a.status, NodeStatus.SUCCESS);
  assert.equal(r.nodes.b.status, NodeStatus.SUCCESS);
});

test("executeDag retries failing nodes", async () => {
  failOnceCount = 0;
  const parsed = parseDag(`
name: t
version: "1.0"
nodes:
  - name: f
    action: fail-once
    retry: 2
    retryDelay: 1
    inputs: {}
`);
  const r = await executeDag(parsed);
  assert.equal(r.status, "success");
  assert.equal(r.nodes.f.status, NodeStatus.SUCCESS);
  assert.equal(r.nodes.f.attempts, 2);
});

test("executeIf=false skips a node", async () => {
  const parsed = parseDag(`
name: t
version: "1.0"
nodes:
  - { name: a, action: log, inputs: { message: hi }, executeIf: "false" }
`);
  const r = await executeDag(parsed);
  assert.equal(r.nodes.a.status, NodeStatus.SKIPPED);
});

test("onError=terminate aborts the DAG", async () => {
  registry.register({
    name: "always-fail",
    async execute() { throw new Error("nope"); },
  });
  const parsed = parseDag(`
name: t
version: "1.0"
nodes:
  - { name: a, action: always-fail, inputs: {} }
  - { name: b, action: log, inputs: { message: "should be skipped" } }
edges:
  - { from: a, to: b }
`);
  const r = await executeDag(parsed);
  assert.equal(r.status, "failed");
  assert.equal(r.nodes.a.status, NodeStatus.FAILED);
  assert.equal(r.nodes.b.status, NodeStatus.SKIPPED);
});
