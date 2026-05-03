// Tiny JSON logger — no extra deps.
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = levels[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 20;

function emit(level, msg, meta) {
  if (levels[level] < minLevel) return;
  const line = { t: new Date().toISOString(), level, msg, ...(meta || {}) };
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + "\n");
}

export const log = {
  debug: (m, meta) => emit("debug", m, meta),
  info: (m, meta) => emit("info", m, meta),
  warn: (m, meta) => emit("warn", m, meta),
  error: (m, meta) => emit("error", m, meta),
};
