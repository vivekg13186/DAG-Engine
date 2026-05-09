// Transform: evaluate a FEEL expression and store the result on the
// runtime context under a user-chosen variable name.
//
// Why this shape (not the old `value` + outputs-mapping form):
//   • Users coming from FEEL-aware tools expect to type `user.firstName +
//     " " + user.lastName` directly, not wrap it in `${…}`.
//   • Having two explicit fields (expression / outputVar) means the
//     property panel can render the expression as a real multi-line
//     textarea, and removes the chore of wiring a separate `outputs:
//     { value: "<name>" }` mapping just to use the result downstream.
//
// The plugin still returns `{ value }` so flows that prefer the
// `nodes.<name>.output.value` reference path keep working.
//
// Note on resolution order: the engine resolves `${…}` placeholders in
// every input before calling execute(). For the `expression` field
// users should NOT wrap it in `${…}` — type FEEL straight in. If
// somebody does wrap it in `${…}`, the engine pre-evaluates that
// (potentially producing a non-string), and we use that value verbatim
// instead of double-evaluating.

import { evaluate as feelEvaluate } from "feelin";

export default {
  name: "transform",
  description:
    "Evaluates a FEEL expression and writes the result to the named " +
    "ctx variable (no outputs mapping needed).",

  inputSchema: {
    type: "object",
    required: ["expression", "outputVar"],
    properties: {
      expression: {
        type: "string",
        // The property panel renders strings tagged textarea as multi-line.
        format: "textarea",
        description:
          "FEEL expression evaluated against the runtime context. " +
          "Examples: user.firstName + \" \" + user.lastName · " +
          "[for o in orders return o.total] · " +
          "if x > 0 then \"positive\" else \"non-positive\"",
      },
      outputVar: {
        type: "string",
        description:
          "ctx variable name the result is written to. Downstream " +
          "nodes can reference it as ${<outputVar>}.",
        pattern: "^[A-Za-z_][A-Za-z0-9_]*$",
      },
    },
  },

  outputSchema: {
    type: "object",
    properties: { value: {} },
  },

  async execute({ expression, outputVar }, ctx) {
    let value;
    if (typeof expression === "string") {
      try {
        value = feelEvaluate(expression, ctx);
      } catch (e) {
        throw new Error(`transform: failed to evaluate FEEL expression — ${e.message}`);
      }
    } else {
      // The engine already produced a non-string value (user wrapped the
      // input in `${…}` or supplied an object literal). Pass it through.
      value = expression;
    }

    if (outputVar) {
      // Mutate the live ctx so other nodes in this run see the new var
      // immediately as `${outputVar}` — no extra `outputs:` mapping needed.
      ctx[outputVar] = value;
    }

    return { value };
  },
};
