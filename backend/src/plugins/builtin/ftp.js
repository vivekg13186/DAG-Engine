// ftp — FTP / FTPS operations over a per-call connection.
//
// Operations: list / upload / download / delete / rename / mkdir / rmdir.
//
// Auth: workspace `generic` config with host / port / username /
// password and an optional `secure` flag (true = FTPS over TLS).
// Plain FTP is still useful inside private networks; FTPS adds the
// TLS handshake on the control + data channels.
//
// SFTP is NOT served by this plugin — use the `ssh` plugin's upload /
// download operations instead. They share auth + connection semantics
// with the `exec` op and only need the SSH config you already have.
//
// In-memory size cap: 1 MB per file. Larger transfers should be split
// across multiple operations or moved over to a future streaming path.

import { Client } from "basic-ftp";
import { Buffer } from "node:buffer";
import { Readable, Writable } from "node:stream";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS     = 30 * 60 * 1000;
const MAX_FILE_BYTES     = 1024 * 1024;

export default {
  name: "ftp",
  description:
    "FTP / FTPS file operations: list, upload, download, delete, " +
    "rename, mkdir, rmdir. Auth via a workspace `ftp` config " +
    "(host / port / username / password, set secure=true for FTPS). " +
    "For SFTP use the `ssh` plugin instead.",

  inputSchema: {
    type: "object",
    required: ["operation"],
    properties: {
      operation: {
        type: "string",
        enum: ["list", "upload", "download", "delete", "rename", "mkdir", "rmdir"],
        description: "Which FTP operation to perform.",
      },
      config: {
        type: "string",
        description: "Name of a workspace `ftp` config with host / port / username / password / secure. Default: 'ftp'.",
      },

      remotePath: {
        type: "string",
        description: "Remote path. Required by every op except list (which defaults to '.').",
      },
      newPath: {
        type: "string",
        description: "Destination path for rename.",
      },
      content: {
        type: "string",
        description: "Local content to upload (string). Required by upload.",
      },
      encoding: {
        type: "string",
        enum: ["utf8", "base64"],
        default: "utf8",
        description: "How to encode/decode file content. Use 'base64' for binary.",
      },

      timeoutMs: { type: "integer", minimum: 1, maximum: MAX_TIMEOUT_MS, default: DEFAULT_TIMEOUT_MS },
    },
  },

  primaryOutput: "result",

  outputSchema: {
    type: "object",
    properties: {
      result:  { description: "Operation-specific payload (file listing array, file content, ack object)." },
      bytes:   { type: "integer", description: "upload / download — bytes transferred." },
    },
  },

  async execute(input, ctx, _hooks, opts = {}) {
    const { operation, config = "ftp", timeoutMs = DEFAULT_TIMEOUT_MS } = input || {};
    if (!operation) throw new Error("`operation` is required");

    const auth = loadFtpAuth(ctx, config);
    const client = new Client(timeoutMs);
    // basic-ftp logs verbosely by default. Silence — workflow logs are
    // the source of truth.
    client.ftp.verbose = false;

    // Wire engine abort → client.close so a workflow cancel during
    // a transfer tears the connection down promptly.
    const onAbort = () => { try { client.close(); } catch { /* fine */ } };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      await client.access({
        host:     auth.host,
        port:     auth.port,
        user:     auth.username,
        password: auth.password,
        secure:   auth.secure,
      });

      switch (operation) {
        case "list":     return await opList(client, input);
        case "upload":   return await opUpload(client, input);
        case "download": return await opDownload(client, input);
        case "delete":   return await opDelete(client, input);
        case "rename":   return await opRename(client, input);
        case "mkdir":    return await opMkdir(client, input);
        case "rmdir":    return await opRmdir(client, input);
        default: throw new Error(`unknown operation "${operation}"`);
      }
    } catch (e) {
      throw new Error(`ftp ${operation} failed: ${e.message}`);
    } finally {
      opts.signal?.removeEventListener?.("abort", onAbort);
      try { client.close(); } catch { /* fine */ }
    }
  },
};

// ── auth ────────────────────────────────────────────────────────────

function loadFtpAuth(ctx, configName) {
  const cfg = ctx?.config?.[configName];
  if (!cfg) {
    throw new Error(
      `FTP config "${configName}" not found in workspace. Create a generic ` +
      `config with host, port, username, password, and optional secure flag.`,
    );
  }
  if (!cfg.host)     throw new Error(`FTP config "${configName}" missing host.`);
  if (!cfg.username) throw new Error(`FTP config "${configName}" missing username.`);
  return {
    host:     String(cfg.host),
    port:     Number(cfg.port) || 21,
    username: String(cfg.username),
    password: cfg.password ? String(cfg.password) : "",
    secure:   cfg.secure === true || cfg.secure === "true",
  };
}

// ── operation handlers ─────────────────────────────────────────────

async function opList(client, { remotePath = "." }) {
  const entries = await client.list(remotePath);
  // basic-ftp returns FileInfo objects with `.type`, `.name`, `.size`,
  // `.rawModifiedAt`, etc. Slim them down to a plain shape so the result
  // serialises cleanly into ctx without dragging in non-JSON-friendly
  // bits.
  const result = entries.map(f => ({
    name:       f.name,
    type:       f.isDirectory ? "directory" : (f.isSymbolicLink ? "symlink" : "file"),
    size:       f.size,
    modifiedAt: f.rawModifiedAt || null,
    permissions: f.permissions || null,
  }));
  return { result };
}

async function opUpload(client, { remotePath, content = "", encoding = "utf8" }) {
  if (!remotePath) throw new Error("operation=upload requires remotePath");
  const buf = Buffer.from(String(content), encoding === "base64" ? "base64" : "utf8");
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error(`upload payload ${buf.length} bytes exceeds limit of ${MAX_FILE_BYTES} bytes`);
  }
  // basic-ftp wants a Readable; wrap the in-memory buffer.
  const stream = Readable.from(buf);
  await client.uploadFrom(stream, remotePath);
  return { result: { remotePath, uploaded: true }, bytes: buf.length };
}

async function opDownload(client, { remotePath, encoding = "utf8" }) {
  if (!remotePath) throw new Error("operation=download requires remotePath");

  // Buffer the response into memory. A future streaming variant could
  // hand the file off to a workspace blob store; for now we keep the
  // workflow data flow simple and uniform with the SSH plugin.
  const chunks = [];
  let bytes = 0;
  let overflow = false;
  const sink = new Writable({
    write(chunk, _enc, cb) {
      const rem = MAX_FILE_BYTES - bytes;
      if (chunk.length <= rem) {
        chunks.push(chunk);
        bytes += chunk.length;
      } else {
        overflow = true;
        if (rem > 0) {
          chunks.push(chunk.subarray(0, rem));
          bytes = MAX_FILE_BYTES;
        }
      }
      cb();
    },
  });
  await client.downloadTo(sink, remotePath);
  if (overflow) {
    throw new Error(`download exceeded ${MAX_FILE_BYTES} bytes — refusing to load into ctx`);
  }
  const buf = Buffer.concat(chunks, bytes);
  const content = encoding === "base64" ? buf.toString("base64") : buf.toString("utf8");
  return { result: { remotePath, content }, bytes };
}

async function opDelete(client, { remotePath }) {
  if (!remotePath) throw new Error("operation=delete requires remotePath");
  await client.remove(remotePath);
  return { result: { remotePath, deleted: true } };
}

async function opRename(client, { remotePath, newPath }) {
  if (!remotePath) throw new Error("operation=rename requires remotePath");
  if (!newPath)    throw new Error("operation=rename requires newPath");
  await client.rename(remotePath, newPath);
  return { result: { from: remotePath, to: newPath, renamed: true } };
}

async function opMkdir(client, { remotePath }) {
  if (!remotePath) throw new Error("operation=mkdir requires remotePath");
  await client.ensureDir(remotePath);
  return { result: { remotePath, created: true } };
}

async function opRmdir(client, { remotePath }) {
  if (!remotePath) throw new Error("operation=rmdir requires remotePath");
  // basic-ftp's removeDir works on empty AND non-empty directories
  // (recursive). For a "only-if-empty" variant we could parse list
  // first; for now match n8n's "Remove" semantics.
  await client.removeDir(remotePath);
  return { result: { remotePath, deleted: true } };
}
