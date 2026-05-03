import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const Graphs = {
  list:     () => api.get("/graphs").then(r => r.data),
  get:      (id) => api.get(`/graphs/${id}`).then(r => r.data),
  create:   (yaml) => api.post("/graphs", { yaml }).then(r => r.data),
  update:   (id, yaml) => api.put(`/graphs/${id}`, { yaml }).then(r => r.data),
  remove:   (id) => api.delete(`/graphs/${id}`),
  validate: (yaml) => api.post("/graphs/validate", { yaml }).then(r => r.data),
  execute:  (id, context = {}) => api.post(`/graphs/${id}/execute`, { context }).then(r => r.data),
};

export const Executions = {
  list:   (graphId) => api.get("/executions", { params: { graphId } }).then(r => r.data),
  get:    (id) => api.get(`/executions/${id}`).then(r => r.data),
  remove: (id) => api.delete(`/executions/${id}`),
};

export const Plugins = {
  // Returns [{ name, description, inputSchema, outputSchema }]
  list: () => api.get("/plugins").then(r => r.data),
};

export const AI = {
  // { configured, provider, model }
  status: () => api.get("/ai/status").then(r => r.data),
  // messages: [{ role: "user"|"assistant", content: string }]
  chat:   (messages) => api.post("/ai/chat", { messages }).then(r => r.data),
};

export function openLiveExecution(executionId, onMessage) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?executionId=${executionId}`);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
  return ws;
}
