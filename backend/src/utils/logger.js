// Tiny JSON logger.
//
// Every emitted line is automatically tagged with the active OTel
// span's trace_id + span_id when one is in scope. That correlates log
// lines with the trace tree in Tempo / Jaeger / Grafana so a "find me
// the trace that produced this log line" jump is one click. Lines
// emitted outside any active span (boot-time, top-level catches) stay
// untagged — same shape as before.

import { trace } from "@opentelemetry/api";

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = levels[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 20;

function emit(level, msg, meta) {
  if (levels[level] < minLevel) return;
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext?.();
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(ctx?.traceId ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {}),
    ...(meta || {}),
  };
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + "\n");
}

export const log = {
  debug: (m, meta) => emit("debug", m, meta),
  info: (m, meta) => emit("info", m, meta),
  warn: (m, meta) => emit("warn", m, meta),
  error: (m, meta) => emit("error", m, meta),
};
