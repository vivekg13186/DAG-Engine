import Ajv from "ajv";
import addFormats from "ajv-formats";
import { dagSchema } from "./schema.js";
import { ValidationError } from "../utils/errors.js";
import { registry } from "../plugins/registry.js";

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(dagSchema);

/**
 * Parse + validate a JSON DAG.
 *
 * The DSL is now JSON. Earlier revisions of this engine accepted YAML; the
 * on-disk + on-the-wire format has switched to JSON so the same blob the
 * frontend pretty-prints is what the engine and the API consume.
 *
 * Accepts either:
 *   - a JSON string (calls JSON.parse), or
 *   - an already-parsed object (used by the worker which can read straight
 *     from `graphs.parsed` JSONB and skip the round-trip).
 *
 * Returns the validated object, or throws a ValidationError listing every
 * issue.
 */
export function parseDag(input) {
  let parsed;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      throw new ValidationError("Invalid JSON", [{ path: "", message: e.message }]);
    }
  } else {
    parsed = input;
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ValidationError("DAG must be an object");
  }

  if (!validateSchema(parsed)) {
    throw new ValidationError(
      "DAG schema validation failed",
      validateSchema.errors.map(e => ({
        path: e.instancePath || e.schemaPath,
        message: e.message,
        params: e.params,
      })),
    );
  }

  // Normalize inputs/outputs: collapse array-of-single-key-objects to a flat object.
  for (const n of parsed.nodes) {
    n.inputs  = normalizeKeyValueList(n.inputs,  `node ${n.name}.inputs`);
    n.outputs = normalizeKeyValueList(n.outputs, `node ${n.name}.outputs`);
  }

  // Ensure node names are unique.
  const seen = new Set();
  for (const n of parsed.nodes) {
    if (seen.has(n.name)) {
      throw new ValidationError(`Duplicate node name "${n.name}"`);
    }
    seen.add(n.name);
  }

  // Every edge endpoint must reference an existing node.
  const nodeNames = new Set(parsed.nodes.map(n => n.name));
  for (const e of parsed.edges) {
    if (!nodeNames.has(e.from)) {
      throw new ValidationError(`Edge references unknown source node "${e.from}"`);
    }
    if (!nodeNames.has(e.to)) {
      throw new ValidationError(`Edge references unknown target node "${e.to}"`);
    }
    if (e.from === e.to) {
      throw new ValidationError(`Self-loop on node "${e.from}" is not allowed`);
    }
  }

  // Per-node plugin-input validation.
  //
  // The DAG schema above only validates structure. Each plugin's own
  // inputSchema is enforced at runtime when registry.invoke() runs, but
  // by then the user has already saved a half-finished flow that will
  // simply break on Run. Catch the most common failure modes — missing
  // required inputs, action that doesn't exist — at save time.
  //
  // We deliberately don't run the full Ajv pass here: input values may
  // contain `${…}` placeholders that defeat strict type checks (e.g.
  // an integer field bound to "${count}"). Required-presence is the
  // useful subset that doesn't false-positive on templated values.
  //
  // The plugin registry might be empty (e.g. inside tests that skip
  // loadBuiltins). In that case we silently skip — the engine will
  // still surface a clear error at run-time.
  for (const n of parsed.nodes) {
    let plugin = null;
    try { plugin = registry.get(n.action); }
    catch { continue; }                  // unknown action → tolerate, fail at run-time

    const required = plugin.inputSchema?.required || [];
    for (const key of required) {
      const v = n.inputs?.[key];
      if (v === undefined || v === null || v === "") {
        throw new ValidationError(
          `node "${n.name}" missing required input "${key}"`,
          [{
            path: `nodes.${n.name}.inputs.${key}`,
            message: `required for action "${n.action}"`,
          }],
        );
      }
    }
  }

  // Cycle check (Kahn's algorithm).
  const indegree = new Map(parsed.nodes.map(n => [n.name, 0]));
  const adj = new Map(parsed.nodes.map(n => [n.name, []]));
  for (const e of parsed.edges) {
    adj.get(e.from).push(e.to);
    indegree.set(e.to, indegree.get(e.to) + 1);
  }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([n]) => n);
  let visited = 0;
  while (queue.length) {
    const n = queue.shift();
    visited++;
    for (const next of adj.get(n)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (visited !== parsed.nodes.length) {
    throw new ValidationError("DAG contains a cycle");
  }

  return parsed;
}

/**
 * Accept either { k: v } or [{ k1: v1 }, { k2: v2 }] and return a plain object.
 * Per the DSL spec, the array form is the canonical authoring style — but the
 * engine wants object form. Duplicate keys throw.
 */
function normalizeKeyValueList(value, where) {
  if (value == null) return {};
  if (!Array.isArray(value)) return value;
  const out = {};
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ValidationError(`${where}: array entries must be single-key objects`);
    }
    for (const [k, v] of Object.entries(item)) {
      if (k in out) throw new ValidationError(`${where}: duplicate key "${k}"`);
      out[k] = v;
    }
  }
  return out;
}
