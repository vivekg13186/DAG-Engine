export default {
  name: "http.request",
  description: "Performs an HTTP request via fetch and returns status + body.",
  inputSchema: {
    type: "object",
    required: ["url"],
    properties: {
      url:     { type: "string", format: "uri" },
      method:  { type: "string", enum: ["GET","POST","PUT","PATCH","DELETE","HEAD"], default: "GET" },
      headers: { type: "object", additionalProperties: { type: "string" } },
      body:    {},
      timeoutMs: { type: "integer", minimum: 1, maximum: 60000, default: 15000 },
    },
  },
  // What ctx[outputVar] receives when the node-level outputVar is set.
  primaryOutput: "body",

  outputSchema: {
    type: "object",
    required: ["status"],
    properties: {
      status:  { type: "integer" },
      headers: { type: "object" },
      body:    {},
    },
  },
  async execute({ url, method = "GET", headers = {}, body, timeoutMs = 15000 }) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
        signal: ac.signal,
      });
      const text = await res.text();
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: parsed,
      };
    } finally {
      clearTimeout(t);
    }
  },
};
