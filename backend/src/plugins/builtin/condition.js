// Evaluates a boolean from input.expr (already resolved by the engine) and
// returns it as output.result so downstream nodes can use ${nodes.X.output.result}.
export default {
  name: "condition",
  description: "Returns a boolean — handy to gate downstream nodes via executeIf.",
  inputSchema: {
    type: "object",
    required: ["value"],
    properties: { value: {} },
  },
  outputSchema: {
    type: "object",
    required: ["result"],
    properties: { result: { type: "boolean" } },
  },
  async execute({ value }) {
    return { result: Boolean(value) };
  },
};
