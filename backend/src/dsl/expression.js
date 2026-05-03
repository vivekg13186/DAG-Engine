// Resolves ${expr} placeholders in DSL values.
//
// Two expression flavors are supported inside ${...}:
//   1. A path lookup like  data.users.0.email   or   nodes.fetch.output.id
//   2. A JS-ish arithmetic / boolean expression evaluated by expr-eval
//      (no function calls or property access into prototypes).
//
// We try the path lookup first because most expressions are just lookups,
// and fall back to expr-eval for things like   ${nodes.fetch.output.count > 0}.

import { Parser } from "expr-eval";

const exprParser = new Parser({
  operators: {
    logical: true,
    comparison: true,
    add: true, subtract: true, multiply: true, divide: true, remainder: true, power: true,
    concatenate: true, in: true, conditional: true,
  },
});

const PLACEHOLDER = /\$\{([^}]+)\}/g;

function getPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function evalSingle(expr, ctx) {
  const trimmed = expr.trim();

  // Pure path? (letters, digits, _, ., -)
  if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(trimmed)) {
    return getPath(ctx, trimmed);
  }

  // Otherwise hand to expr-eval. Build a flat scope for it (it doesn't
  // dot-walk natively in older versions, so we pre-resolve obvious paths).
  try {
    const compiled = exprParser.parse(trimmed);
    const vars = compiled.variables({ withMembers: true });
    const scope = {};
    for (const v of vars) scope[v] = getPath(ctx, v);
    return compiled.evaluate(scope);
  } catch (e) {
    throw new Error(`Failed to evaluate expression "${trimmed}": ${e.message}`);
  }
}

/**
 * Resolve any ${...} placeholders inside a value.
 * Strings: replaced piece by piece. If the entire string IS a single
 * placeholder, the original (typed) value is returned (so numbers / booleans /
 * objects stay as their original types).
 * Objects/arrays: recursed.
 */
export function resolve(value, ctx) {
  if (value == null) return value;
  if (typeof value === "string") {
    const matches = [...value.matchAll(PLACEHOLDER)];
    if (matches.length === 0) return value;
    if (matches.length === 1 && matches[0][0] === value) {
      return evalSingle(matches[0][1], ctx);
    }
    return value.replace(PLACEHOLDER, (_, expr) => {
      const v = evalSingle(expr, ctx);
      return v == null ? "" : String(v);
    });
  }
  if (Array.isArray(value)) return value.map(v => resolve(v, ctx));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, ctx);
    return out;
  }
  return value;
}

/** Evaluate a boolean expression like   ${nodes.fetch.output.count > 0}. */
export function evalCondition(expr, ctx) {
  if (!expr) return true;
  const resolved = resolve(expr, ctx);
  return Boolean(resolved);
}
