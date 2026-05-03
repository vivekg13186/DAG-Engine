import yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { dagSchema } from "./schema.js";
import { ValidationError } from "../utils/errors.js";

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(dagSchema);

/**
 * Parse + validate a YAML DAG.
 * Returns the parsed object, or throws a ValidationError listing every issue.
 */
export function parseDag(yamlText) {
  let parsed;
  try {
    parsed = yaml.load(yamlText);
  } catch (e) {
    throw new ValidationError("Invalid YAML", [{ path: "", message: e.message }]);
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
