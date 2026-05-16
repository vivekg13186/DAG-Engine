// ssh — run a remote command or transfer a file over SSH/SFTP.
//
// Operations:
//   • exec       — run a command on the remote host, capture stdout/
//                  stderr/exit code (+ optional stdin).
//   • upload     — push a file to the remote via SFTP. `content`
//                  (in-memory string), `remotePath` (where on the
//                  remote it lands).
//   • download   — pull a remote file via SFTP, returned as the
//                  `content` output (utf-8 string by default; set
//                  `encoding: "base64"` for binary).
//
// Auth: workspace `generic` config with host / port / username plus
// EITHER password OR privateKey (+ optional passphrase). Both auth
// methods supported on the same connection — ssh2 tries them in turn.
//
// Each operation opens a fresh connection and closes it cleanly in a
// `finally`, so a transient network hiccup never leaks fds. For high-
// throughput batch flows, this is wasteful (~50ms TCP handshake per
// call). If that becomes a problem we can keep a per-config keepalive
// pool — out of scope here.

import { Client } from "ssh2";
import { Buffer } from "node:buffer";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS     = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES   = 1024 * 1024;        // 1 MB per stream

export default {
  name: "ssh",
  description:
    "Run a remote command or move files over SSH/SFTP. Auth via a " +
    "workspace `ssh` config (host, port, username, and either password " +
    "or privateKey + optional passphrase).",

  inputSchema: {
    type: "object",
    required: ["operation"],
    properties: {
      operation: {
        type: "string",
        enum: ["exec", "upload", "download"],
        description: "Which SSH/SFTP operation to perform.",
      },
      config: {
        type: "string",
        description: "Name of a workspace `ssh` config with host / port / username / password | privateKey. Default: 'ssh'.",
      },

      // exec
      command: { type: "string", description: "Shell command to run on the remote. Required by exec." },
      stdin:   { type: "string", description: "Optional stdin to pipe into the remote command." },

      // upload / download
      remotePath: { type: "string", description: "Remote path. Required by upload / download." },
      content:    { type: "string", description: "Local content to upload (string). Required by upload." },
      encoding:   {
        type: "string",
        enum: ["utf8", "base64"],
        default: "utf8",
        description: "How to encode/decode file content. Use 'base64' for binary.",
      },

      timeoutMs: { type: "integer", minimum: 1, maximum: MAX_TIMEOUT_MS, default: DEFAULT_TIMEOUT_MS },
    },
  },

  primaryOutput: "stdout",

  outputSchema: {
    type: "object",
    properties: {
      stdout:   { type: "string",  description: "exec only — captured stdout." },
      stderr:   { type: "string",  description: "exec only — captured stderr." },
      exitCode: { type: "integer", description: "exec only — process exit code." },
      content:  { type: "string",  description: "download only — the file's content." },
      bytes:    { type: "integer", description: "upload / download — number of bytes transferred." },
    },
  },

  async execute(input, ctx, _hooks, opts = {}) {
    const { operation, config = "ssh", timeoutMs = DEFAULT_TIMEOUT_MS } = input || {};
    if (!operation) throw new Error("`operation` is required");

    const auth = loadSshAuth(ctx, config);

    switch (operation) {
      case "exec":     return await withConn(auth, opts.signal, timeoutMs, (conn) => sshExec(conn, input));
      case "upload":   return await withConn(auth, opts.signal, timeoutMs, (conn) => sftpUpload(conn, input));
      case "download": return await withConn(auth, opts.signal, timeoutMs, (conn) => sftpDownload(conn, input));
      default: throw new Error(`unknown operation "${operation}"`);
    }
  },
};

// ── auth + connection ───────────────────────────────────────────────

function loadSshAuth(ctx, configName) {
  const cfg = ctx?.config?.[configName];
  if (!cfg) {
    throw new Error(
      `SSH config "${configName}" not found in workspace. Create a generic ` +
      `config with host, port, username, and password OR privateKey.`,
    );
  }
  if (!cfg.host)     throw new Error(`SSH config "${configName}" missing host.`);
  if (!cfg.username) throw new Error(`SSH config "${configName}" missing username.`);
  if (!cfg.password && !cfg.privateKey) {
    throw new Error(`SSH config "${configName}" needs password or privateKey.`);
  }
  return {
    host:       String(cfg.host),
    port:       Number(cfg.port) || 22,
    username:   String(cfg.username),
    password:   cfg.password   ? String(cfg.password)   : undefined,
    privateKey: cfg.privateKey ? Buffer.from(String(cfg.privateKey).replace(/\\n/g, "\n")) : undefined,
    passphrase: cfg.passphrase ? String(cfg.passphrase) : undefined,
  };
}

// Open a connection, run `fn(conn)`, tear it down. timeoutMs / abort
// fire either side: a workflow cancel during a long SFTP transfer
// closes the socket cleanly.
function withConn(auth, signal, timeoutMs, fn) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const settle = (err, value) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* fine */ }
      err ? reject(err) : resolve(value);
    };

    const timer = setTimeout(
      () => settle(new Error(`ssh timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    const onAbort = () => settle(new Error(`ssh aborted: ${signal?.reason?.message || "engine cancel"}`));
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    conn.on("ready", async () => {
      try {
        const result = await fn(conn);
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
        settle(null, result);
      } catch (e) {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
        settle(e);
      }
    });
    conn.on("error", (err) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      settle(new Error(`ssh connect error: ${err.message}`));
    });
    try { conn.connect(auth); }
    catch (e) { settle(new Error(`ssh connect failed: ${e.message}`)); }
  });
}

// ── operation handlers ─────────────────────────────────────────────

function sshExec(conn, { command, stdin }) {
  if (!command) throw new Error("operation=exec requires command");

  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(new Error(`ssh exec failed: ${err.message}`));

      let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
      let oOverflow = false, eOverflow = false;

      stream.on("data", (chunk) => {
        const rem = MAX_OUTPUT_BYTES - stdout.length;
        if (chunk.length <= rem) stdout = Buffer.concat([stdout, chunk]);
        else if (rem > 0)        { stdout = Buffer.concat([stdout, chunk.subarray(0, rem)]); oOverflow = true; }
        else                     oOverflow = true;
      });
      stream.stderr.on("data", (chunk) => {
        const rem = MAX_OUTPUT_BYTES - stderr.length;
        if (chunk.length <= rem) stderr = Buffer.concat([stderr, chunk]);
        else if (rem > 0)        { stderr = Buffer.concat([stderr, chunk.subarray(0, rem)]); eOverflow = true; }
        else                     eOverflow = true;
      });
      stream.on("close", (code) => {
        const result = {
          stdout:   stdout.toString("utf8") + (oOverflow ? "\n…[stdout truncated]" : ""),
          stderr:   stderr.toString("utf8") + (eOverflow ? "\n…[stderr truncated]" : ""),
          exitCode: typeof code === "number" ? code : 0,
        };
        // We surface non-zero just like local shell.exec — fail the
        // node so workflows can rely on success-equals-success
        // semantics without inspecting exitCode every time.
        if (result.exitCode !== 0) {
          const e = new Error(`ssh exec exited with code ${result.exitCode}: ${result.stderr.trim().slice(0, 200) || "no stderr"}`);
          e.result = result;
          return reject(e);
        }
        resolve(result);
      });

      if (stdin != null && stdin !== "") stream.stdin.write(String(stdin));
      stream.stdin.end();
    });
  });
}

function sftpUpload(conn, { remotePath, content = "", encoding = "utf8" }) {
  if (!remotePath) throw new Error("operation=upload requires remotePath");

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(new Error(`sftp open failed: ${err.message}`));
      const buf = Buffer.from(String(content), encoding === "base64" ? "base64" : "utf8");
      const stream = sftp.createWriteStream(remotePath);
      stream.on("error", (e) => reject(new Error(`sftp upload failed: ${e.message}`)));
      stream.on("close", () => resolve({ bytes: buf.length }));
      stream.end(buf);
    });
  });
}

function sftpDownload(conn, { remotePath, encoding = "utf8" }) {
  if (!remotePath) throw new Error("operation=download requires remotePath");

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(new Error(`sftp open failed: ${err.message}`));
      const stream = sftp.createReadStream(remotePath);
      let buf = Buffer.alloc(0);
      let overflow = false;
      stream.on("data", (chunk) => {
        const rem = MAX_OUTPUT_BYTES - buf.length;
        if (chunk.length <= rem) buf = Buffer.concat([buf, chunk]);
        else if (rem > 0)        { buf = Buffer.concat([buf, chunk.subarray(0, rem)]); overflow = true; }
        else                     overflow = true;
      });
      stream.on("error", (e) => reject(new Error(`sftp download failed: ${e.message}`)));
      stream.on("end", () => {
        if (overflow) {
          return reject(new Error(`sftp download exceeded ${MAX_OUTPUT_BYTES} bytes — refusing to load into ctx`));
        }
        const content = encoding === "base64" ? buf.toString("base64") : buf.toString("utf8");
        resolve({ content, bytes: buf.length });
      });
    });
  });
}
