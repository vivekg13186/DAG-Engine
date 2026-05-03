export default {
  name: "delay",
  description: "Sleeps for `ms` milliseconds.",
  inputSchema: {
    type: "object",
    required: ["ms"],
    properties: { ms: { type: "integer", minimum: 0, maximum: 60000 } },
  },
  outputSchema: {
    type: "object",
    required: ["slept"],
    properties: { slept: { type: "integer" } },
  },
  async execute({ ms }) {
    await new Promise(r => setTimeout(r, ms));
    return { slept: ms };
  },
};
