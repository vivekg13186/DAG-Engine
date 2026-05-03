// Identity-style transform: returns whatever is in `inputs.value`.
// Useful for re-shaping data using DSL ${...} expressions in inputs.
export default {
  name: "transform",
  description: "Returns the resolved `value` input. Use for re-shaping data with ${} expressions.",
  inputSchema: {
    type: "object",
    properties: { value: {} },
  },
  outputSchema: {
    type: "object",
    properties: { value: {} },
  },
  async execute({ value }) {
    return { value };
  },
};
