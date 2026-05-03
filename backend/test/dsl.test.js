import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDag } from "../src/dsl/parser.js";
import { resolve, evalCondition } from "../src/dsl/expression.js";

test("parseDag accepts a valid linear DAG", () => {
  const yaml = `
name: t
version: "1.0"
nodes:
  - { name: a, action: log, inputs: { message: hi } }
  - { name: b, action: log, inputs: { message: hi } }
edges:
  - { from: a, to: b }
`;
  const parsed = parseDag(yaml);
  assert.equal(parsed.name, "t");
  assert.equal(parsed.nodes.length, 2);
});

test("parseDag rejects cycles", () => {
  const yaml = `
name: t
version: "1.0"
nodes:
  - { name: a, action: log, inputs: { message: hi } }
  - { name: b, action: log, inputs: { message: hi } }
edges:
  - { from: a, to: b }
  - { from: b, to: a }
`;
  assert.throws(() => parseDag(yaml), /cycle/i);
});

test("parseDag rejects unknown edge endpoints", () => {
  const yaml = `
name: t
version: "1.0"
nodes:
  - { name: a, action: log, inputs: { message: hi } }
edges:
  - { from: a, to: b }
`;
  assert.throws(() => parseDag(yaml), /unknown target node/i);
});

test("parseDag rejects duplicate node names", () => {
  const yaml = `
name: t
version: "1.0"
nodes:
  - { name: a, action: log, inputs: { message: hi } }
  - { name: a, action: log, inputs: { message: hi } }
`;
  assert.throws(() => parseDag(yaml), /Duplicate node name/);
});

test("resolve substitutes path expressions", () => {
  const ctx = { data: { name: "vivek" }, nodes: { a: { output: { id: 7 } } } };
  assert.equal(resolve("hi ${data.name}", ctx), "hi vivek");
  assert.equal(resolve("${nodes.a.output.id}", ctx), 7);          // typed passthrough
  assert.equal(resolve("id=${nodes.a.output.id}", ctx), "id=7");  // string interpolation
});

test("resolve walks objects and arrays", () => {
  const ctx = { data: { x: 5 } };
  const out = resolve({ a: "${data.x}", b: ["${data.x}", "lit"] }, ctx);
  assert.deepEqual(out, { a: 5, b: [5, "lit"] });
});

test("evalCondition handles boolean expressions", () => {
  const ctx = { nodes: { a: { output: { count: 3 } } } };
  assert.equal(evalCondition("${nodes.a.output.count > 0}", ctx), true);
  assert.equal(evalCondition("${nodes.a.output.count > 10}", ctx), false);
  assert.equal(evalCondition("", ctx), true);
});

test("parseDag normalizes array-form inputs/outputs", () => {
  const parsed = parseDag(`
name: t
version: "1.0"
data:
  url: "http://x"
nodes:
  - name: call
    action: http.request
    inputs:
      - url: "\${url}"
      - method: GET
    outputs:
      - body: bodyVar
      - status: statusVar
`);
  assert.deepEqual(parsed.nodes[0].inputs,  { url: "${url}", method: "GET" });
  assert.deepEqual(parsed.nodes[0].outputs, { body: "bodyVar", status: "statusVar" });
});

test("bare ${url} resolves from data block", () => {
  // data fields are flattened to root, so both styles work.
  const ctx = { url: "http://x", data: { url: "http://x" } };
  assert.equal(resolve("${url}", ctx), "http://x");
  assert.equal(resolve("${data.url}", ctx), "http://x");
});
