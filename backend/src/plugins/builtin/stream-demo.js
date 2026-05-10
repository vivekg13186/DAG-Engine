export default {
  name: "stream.demo",
  description: "Streams a fake progress bar — use to verify the streaming hook is wired without burning tokens.",
  inputSchema: { type: "object", properties: { steps: { type: "integer", default: 10 } } },
  primaryOutput: "steps",
  outputSchema: { type: "object", properties: { steps: { type: "integer" } } },
  async execute({ steps = 10 }, _ctx, hooks) {
    hooks?.stream?.log("info", `Starting work for ${steps} steps`);
    for (let i = 1; i <= steps; i++) {
      hooks?.stream?.text(`step ${i}/${steps}\n`);
      await new Promise(r => setTimeout(r, 250));
    }
    hooks?.stream?.log("info", "Done");
    return { steps };
  },
};