// git — drive the local `git` binary from a workflow.
//
// Operations: clone / pull / push / fetch / status / log /
//             add / commit / checkout / branch / tag.
//
// Auth model: optional `config` input names a workspace `git` config
// (or any `generic` config) holding a `token` field. For HTTPS remotes
// (github.com, gitlab.com, etc.) the token is injected into the URL as
//   https://x-access-token:<token>@<host>/<repo>.git
// before any clone/pull/push, then redacted from the result so the
// token never appears in stdout/stderr that lands in execution logs.
// Optional `authorName` / `authorEmail` fields are used by commit when
// the node doesn't supply its own author override.
//
// Implementation: spawn the `git` binary directly (no `simple-git`
// dependency — the binary is already present in the backend image).
// stdout/stderr captured up to 1 MB per stream and a per-call
// timeoutMs ceiling. Engine abort signal honoured.

import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS     = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES   = 1024 * 1024;

export default {
  name: "git",
  description:
    "Run a git operation. Pick the action with the `operation` input. " +
    "Workflows can clone / pull / push / commit / log / etc. Auth via a " +
    "workspace `git` config (token + optional authorName/authorEmail). " +
    "The token is injected for HTTPS remotes only and is redacted from " +
    "the returned stdout/stderr.",

  inputSchema: {
    type: "object",
    required: ["operation"],
    properties: {
      operation: {
        type: "string",
        enum: [
          "clone", "pull", "push", "fetch",
          "status", "log",
          "add", "commit",
          "checkout", "branch", "tag",
        ],
        description: "Which git command to run.",
      },

      config: {
        type: "string",
        description: "Name of a workspace `git` (or `generic`) config holding a `token` field for HTTPS auth. Optional for public repos.",
      },

      // Common — most ops accept a working directory.
      cwd: { type: "string", description: "Working directory (the repo). Required for everything except clone." },

      // clone
      url:    { type: "string", description: "Repo URL (HTTPS or SSH). Required by clone." },
      dir:    { type: "string", description: "Local directory to clone into. Defaults to the last segment of `url`." },
      depth:  { type: "integer", minimum: 1, description: "Shallow-clone depth. Omit for a full clone." },

      // shared by clone/pull/push/checkout/branch
      branch:    { type: "string", description: "Branch name." },
      remote:    { type: "string", description: "Remote name (default: origin)." },

      // log
      maxCount:  { type: "integer", minimum: 1, maximum: 1000, default: 20, description: "Number of commits returned by log." },

      // add
      files:     { type: "array", items: { type: "string" }, description: "Files to add. Default: ['.']." },

      // commit
      message:   { type: "string", description: "Commit message. Required by commit." },
      authorName:  { type: "string", description: "Override commit author name." },
      authorEmail: { type: "string", description: "Override commit author email." },

      // tag
      tagName:    { type: "string", description: "Tag name. Required by tag." },
      tagMessage: { type: "string", description: "Annotated-tag message. Omit for a lightweight tag." },

      // push
      force:      { type: "boolean", default: false, description: "Force-push (push only)." },
      pushTags:   { type: "boolean", default: false, description: "Push tags as well (push only)." },

      timeoutMs:  { type: "integer", minimum: 1, maximum: MAX_TIMEOUT_MS, default: DEFAULT_TIMEOUT_MS },
    },
  },

  primaryOutput: "stdout",

  outputSchema: {
    type: "object",
    required: ["exitCode"],
    properties: {
      stdout:     { type: "string" },
      stderr:     { type: "string" },
      exitCode:   { type: "integer" },
      durationMs: { type: "integer" },
      // log returns parsed commits as well
      commits:    { type: "array",  description: "Parsed commit list (operation=log only)." },
    },
  },

  async execute(input, ctx, _hooks, opts = {}) {
    const { operation, config, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = input || {};
    if (!operation) throw new Error("`operation` is required");

    // Token + commit-author defaults from the config row. Read once so
    // we don't dig into ctx.config N times. Node-level overrides win
    // when both are set.
    const cfg = config && ctx?.config?.[config] ? ctx.config[config] : null;
    const token = cfg?.token ? String(cfg.token) : null;
    if (operation === "commit") {
      if (!rest.authorName  && cfg?.authorName)  rest.authorName  = cfg.authorName;
      if (!rest.authorEmail && cfg?.authorEmail) rest.authorEmail = cfg.authorEmail;
    }

    const runner = (args, run = {}) => runGit(args, {
      cwd:       run.cwd || rest.cwd,
      timeoutMs,
      signal:    opts.signal,
      sensitive: run.sensitive,
    });

    switch (operation) {
      case "clone":    return await doClone(rest, runner, token);
      case "pull":     return await doPull(rest, runner, token);
      case "push":     return await doPush(rest, runner, token);
      case "fetch":    return await doFetch(rest, runner, token);
      case "status":   return await doStatus(rest, runner);
      case "log":      return await doLog(rest, runner);
      case "add":      return await doAdd(rest, runner);
      case "commit":   return await doCommit(rest, runner);
      case "checkout": return await doCheckout(rest, runner);
      case "branch":   return await doBranch(rest, runner);
      case "tag":      return await doTag(rest, runner);
      default: throw new Error(`unknown operation "${operation}"`);
    }
  },
};

// ── operation handlers ──────────────────────────────────────────────

async function doClone({ url, dir, branch, depth, cwd }, run, token) {
  if (!url) throw new Error("operation=clone requires url");
  const args = ["clone"];
  if (depth)  args.push("--depth", String(depth));
  if (branch) args.push("--branch", branch);
  args.push(injectToken(url, token));
  if (dir) args.push(dir);
  return run(args, { cwd, sensitive: [token] });
}

async function doPull({ remote = "origin", branch }, run, token) {
  // Pull with an in-URL token works only on HTTPS clones whose origin
  // URL we don't want to rewrite permanently. Use an http extraheader
  // override for this single call: gives auth without polluting the
  // repo's stored remote.
  const args = withAuthHeader(["pull", remote, branch].filter(Boolean), token);
  return run(args, { sensitive: [token] });
}

async function doPush({ remote = "origin", branch, force = false, pushTags = false }, run, token) {
  const args = withAuthHeader(["push", remote, branch].filter(Boolean), token);
  if (force)    args.push("--force");
  if (pushTags) args.push("--tags");
  return run(args, { sensitive: [token] });
}

async function doFetch({ remote = "origin", branch }, run, token) {
  const args = withAuthHeader(["fetch", remote, branch].filter(Boolean), token);
  return run(args, { sensitive: [token] });
}

async function doStatus(_rest, run) {
  return run(["status", "--porcelain=v1", "-b"]);
}

async function doLog({ maxCount = 20, branch }, run) {
  // Stable-ish JSON-ish format: ASCII Unit Separators between fields
  // and Record Separators between commits. Cleaner than --format=json
  // (which doesn't escape user-supplied commit messages), zero risk of
  // a `"` in a commit message breaking the parse.
  const FS = "\x1f";
  const RS = "\x1e";
  const FMT = ["%H", "%an", "%ae", "%aI", "%s"].join(FS) + RS;
  const args = ["log", `--max-count=${maxCount}`, `--format=${FMT}`];
  if (branch) args.push(branch);
  const r = await run(args);
  const commits = r.stdout.split(RS).filter(Boolean).map(line => {
    const [hash, name, email, date, message] = line.split(FS);
    return { hash, author: { name, email }, date, message };
  });
  return { ...r, commits };
}

async function doAdd({ files = ["."] }, run) {
  return run(["add", "--", ...files]);
}

async function doCommit({ message, authorName, authorEmail }, run) {
  if (!message) throw new Error("operation=commit requires message");
  const args = ["commit", "-m", message];
  if (authorName && authorEmail) {
    args.push("--author", `${authorName} <${authorEmail}>`);
  }
  return run(args);
}

async function doCheckout({ branch }, run) {
  if (!branch) throw new Error("operation=checkout requires branch");
  return run(["checkout", branch]);
}

async function doBranch({ branch }, run) {
  // No branch arg → list branches. With branch → create.
  return run(branch ? ["branch", branch] : ["branch", "--list"]);
}

async function doTag({ tagName, tagMessage }, run) {
  if (!tagName) throw new Error("operation=tag requires tagName");
  return run(tagMessage ? ["tag", "-a", tagName, "-m", tagMessage] : ["tag", tagName]);
}

// ── helpers ─────────────────────────────────────────────────────────

// Insert a personal-access token into an HTTPS URL so HTTP basic auth
// works against GitHub / GitLab / Bitbucket. SSH URLs are untouched.
function injectToken(url, token) {
  if (!token) return url;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    u.username = "x-access-token";
    u.password = token;
    return u.toString();
  } catch { return url; }
}

// For pull/push/fetch we don't want to permanently rewrite the stored
// `origin` URL (that'd leak the token into .git/config). Pass auth as a
// one-shot HTTP extraheader instead.
function withAuthHeader(args, token) {
  if (!token) return args;
  const b64 = Buffer.from(`x-access-token:${token}`).toString("base64");
  return ["-c", `http.extraheader=Authorization: Basic ${b64}`, ...args];
}

async function runGit(args, { cwd, timeoutMs, signal, sensitive }) {
  const ac = new AbortController();
  const timeoutTimer = setTimeout(
    () => ac.abort(new Error(`git timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const onUpstreamAbort = () => ac.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener("abort", onUpstreamAbort, { once: true });
  }

  const started = Date.now();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("git", args, {
        cwd:    cwd || undefined,
        env:    { ...process.env, GIT_TERMINAL_PROMPT: "0" },   // never interactively prompt
        signal: ac.signal,
        stdio:  ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      clearTimeout(timeoutTimer);
      if (signal) signal.removeEventListener?.("abort", onUpstreamAbort);
      return reject(new Error(`git spawn failed: ${e.message}`));
    }

    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
    let oOverflow = false, eOverflow = false;
    child.stdout.on("data", (c) => {
      const rem = MAX_OUTPUT_BYTES - stdout.length;
      if (c.length <= rem) stdout = Buffer.concat([stdout, c]);
      else if (rem > 0)   { stdout = Buffer.concat([stdout, c.subarray(0, rem)]); oOverflow = true; }
      else                oOverflow = true;
    });
    child.stderr.on("data", (c) => {
      const rem = MAX_OUTPUT_BYTES - stderr.length;
      if (c.length <= rem) stderr = Buffer.concat([stderr, c]);
      else if (rem > 0)   { stderr = Buffer.concat([stderr, c.subarray(0, rem)]); eOverflow = true; }
      else                eOverflow = true;
    });

    child.on("error", (err) => {
      clearTimeout(timeoutTimer);
      if (signal) signal.removeEventListener?.("abort", onUpstreamAbort);
      reject(new Error(`git error: ${err.message}`));
    });
    child.on("close", (code, sig) => {
      clearTimeout(timeoutTimer);
      if (signal) signal.removeEventListener?.("abort", onUpstreamAbort);
      const out = redact(stdout.toString("utf8") + (oOverflow ? "\n…[stdout truncated]" : ""), sensitive);
      const err = redact(stderr.toString("utf8") + (eOverflow ? "\n…[stderr truncated]" : ""), sensitive);
      const result = {
        stdout: out,
        stderr: err,
        exitCode: typeof code === "number" ? code : -1,
        durationMs: Date.now() - started,
      };
      if (sig) {
        const e = new Error(`git killed (${sig}): ${err.trim().slice(0, 200)}`);
        e.result = result;
        return reject(e);
      }
      if (result.exitCode !== 0) {
        const e = new Error(`git exited with code ${result.exitCode}: ${err.trim().slice(0, 200)}`);
        e.result = result;
        return reject(e);
      }
      resolve(result);
    });
  });
}

// Redact secrets that might have ended up in git's output. Specifically
// any token we passed in goes through Authorization headers, but git
// occasionally echoes credentials in error messages (e.g. "fatal:
// Authentication failed for 'https://x-access-token:abcd…@…'").
function redact(text, sensitive) {
  if (!text || !sensitive?.length) return text;
  let out = text;
  for (const s of sensitive) {
    if (!s) continue;
    out = out.split(s).join("***");
  }
  return out;
}
