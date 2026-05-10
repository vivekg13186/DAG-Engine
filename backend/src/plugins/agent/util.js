// Shared helpers for the `agent` action plugin.
//
// Lives outside src/plugins/builtin/ so the plugin auto-loader doesn't
// register it as an action.

import { pool } from "../../db/pool.js";

/**
 * Look up the agent row + its linked ai.provider config from
 * ctx.config[config_name]. The configs map is loaded into ctx.config by
 * the worker at execution start, so the plaintext apiKey is available
 * here without us re-reading the DB.
 */
export async function loadAgent(ctx, title) {
  if (!title || typeof title !== "string") {
    throw new Error("agent: `agent` (title) is required");
  }
  const { rows } = await pool.query(
    "SELECT title, prompt, config_name FROM agents WHERE title = $1",
    [title],
  );
  if (rows.length === 0) {
    throw new Error(
      `agent: no agent titled "${title}". Create one on the Home page → Agents.`,
    );
  }
  const agent = rows[0];
  const cfg = ctx?.config?.[agent.config_name];
  if (!cfg || typeof cfg !== "object") {
    throw new Error(
      `agent "${title}": config "${agent.config_name}" not found. ` +
      `Create a configuration of type ai.provider on the Home page → Configurations.`,
    );
  }
  if (!cfg.apiKey) throw new Error(`agent "${title}": config "${agent.config_name}" has no apiKey set`);
  if (!cfg.model)  throw new Error(`agent "${title}": config "${agent.config_name}" has no model set`);
  if (!cfg.provider) throw new Error(`agent "${title}": config "${agent.config_name}" has no provider set`);
  return { agent, cfg };
}

/**
 * Drive a single LLM turn against the configured provider.
 *
 * Either pass `userText` (single user message — the legacy shape) OR
 * `messages` (full multi-turn array — used when conversation history
 * is being replayed). When both are present, `messages` wins.
 *
 * Returns
 *   { text:   <full response text>,
 *     usage:  { inputTokens, outputTokens } }
 *
 * If `onText` is supplied, text deltas are streamed via SSE.
 */
export async function callProvider({ cfg, system, userText, messages, maxTokens = 2048, onText }) {
  const finalMessages = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: "user", content: String(userText ?? "") }];

  if (cfg.provider === "anthropic") {
    return onText
      ? callAnthropicStreaming(cfg, system, finalMessages, maxTokens, onText)
      : callAnthropic(cfg, system, finalMessages, maxTokens);
  }
  return onText
    ? callOpenAIStreaming(cfg, system, finalMessages, maxTokens, onText)
    : callOpenAI(cfg, system, finalMessages, maxTokens);
}

async function callAnthropic(cfg, system, messages, maxTokens) {
  const baseUrl = (cfg.baseUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      cfg.model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`agent (anthropic): ${res.status} ${String(txt).slice(0, 500)}`);
  }
  const data = await res.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = blocks.filter(b => b.type === "text").map(b => b.text).join("");
  return {
    text,
    usage: {
      inputTokens:  data?.usage?.input_tokens  ?? 0,
      outputTokens: data?.usage?.output_tokens ?? 0,
    },
  };
}

async function callOpenAI(cfg, system, messages, maxTokens) {
  const baseUrl = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type":  "application/json",
      "authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model:    cfg.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`agent (openai): ${res.status} ${String(txt).slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return {
    text,
    usage: {
      inputTokens:  data?.usage?.prompt_tokens     ?? 0,
      outputTokens: data?.usage?.completion_tokens ?? 0,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Streaming variants — same providers, opened with `stream: true`,
// reading the SSE response and forwarding text deltas via `onText`.
// Final shape matches the blob variants exactly.
// ──────────────────────────────────────────────────────────────────────

async function callAnthropicStreaming(cfg, system, messages, maxTokens, onText) {
  const baseUrl = (cfg.baseUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      cfg.model,
      max_tokens: maxTokens,
      stream:     true,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`agent (anthropic): ${res.status} ${String(txt).slice(0, 500)}`);
  }

  let acc = "";
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const evt of parseSse(res.body)) {
    let parsed;
    try { parsed = JSON.parse(evt.data); } catch { continue; }

    // Anthropic streaming event shapes:
    //   message_start         → carries initial usage.input_tokens
    //   content_block_delta   → { delta: { type: "text_delta", text: "…" } }
    //   message_delta         → { usage: { output_tokens: N } } (cumulative)
    //   message_stop          → end of stream
    if (parsed.type === "message_start" && parsed.message?.usage) {
      usage.inputTokens  = parsed.message.usage.input_tokens  ?? usage.inputTokens;
      usage.outputTokens = parsed.message.usage.output_tokens ?? usage.outputTokens;
    } else if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      const delta = parsed.delta.text || "";
      if (delta) {
        acc += delta;
        try { onText(delta); } catch { /* never let a bad listener crash the stream */ }
      }
    } else if (parsed.type === "message_delta" && parsed.usage) {
      usage.outputTokens = parsed.usage.output_tokens ?? usage.outputTokens;
    }
  }

  return { text: acc, usage };
}

async function callOpenAIStreaming(cfg, system, messages, maxTokens, onText) {
  const baseUrl = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type":  "application/json",
      "authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model:      cfg.model,
      max_tokens: maxTokens,
      stream:     true,
      stream_options: { include_usage: true },     // makes the final chunk carry usage
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`agent (openai): ${res.status} ${String(txt).slice(0, 500)}`);
  }

  let acc = "";
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const evt of parseSse(res.body)) {
    if (evt.data === "[DONE]") break;
    let parsed;
    try { parsed = JSON.parse(evt.data); } catch { continue; }

    const delta = parsed.choices?.[0]?.delta?.content || "";
    if (delta) {
      acc += delta;
      try { onText(delta); } catch { /* see anthropic comment */ }
    }
    if (parsed.usage) {
      usage.inputTokens  = parsed.usage.prompt_tokens     ?? usage.inputTokens;
      usage.outputTokens = parsed.usage.completion_tokens ?? usage.outputTokens;
    }
  }

  return { text: acc, usage };
}

/**
 * Async-iterator over an SSE response body. Yields `{ event, data }`
 * objects, one per `\n\n`-delimited frame. `data` is the raw string
 * (we leave JSON parsing to the caller because Anthropic and OpenAI
 * use different envelope shapes).
 *
 * Tolerates partial frames split across network reads — we accumulate
 * a buffer until we see a `\n\n` terminator, then emit and trim.
 */
async function* parseSse(stream) {
  const decoder = new TextDecoder();
  let buffer = "";
  // Node's fetch returns a web ReadableStream; for-await iterates Uint8Array chunks.
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseFrame(frame);
      if (ev) yield ev;
    }
  }
  // Flush any trailing frame (no terminator received).
  buffer += decoder.decode();
  if (buffer.trim()) {
    const ev = parseFrame(buffer);
    if (ev) yield ev;
  }
}

function parseFrame(text) {
  let event = "message";
  let data  = "";
  for (const line of text.split("\n")) {
    if (line.startsWith(":"))            continue;          // SSE comment
    if (line.startsWith("event:"))       event = line.slice(6).trim();
    else if (line.startsWith("data:"))   data += line.slice(5).trim() + "\n";
  }
  data = data.replace(/\n$/, "");
  return data ? { event, data } : null;
}

/**
 * Try to parse the model's text response as JSON. Tolerates a leading /
 * trailing ``` fence (the most common deviation when models add
 * explanatory text). Returns the parsed value on success, or null when
 * nothing valid is found.
 */
export function tryParseJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strip a fenced code block if the response is wrapped in one.
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;

  // Cheap fast-path: starts with { or [.
  const firstChar = candidate.trim().charAt(0);
  if (firstChar !== "{" && firstChar !== "[") return null;

  try { return JSON.parse(candidate); } catch { /* fall through */ }

  // Last resort: find the first { ... } or [ ... ] span and try to parse it.
  const m = /[\{\[][\s\S]*[\}\]]/.exec(candidate);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Extract a `confidence` number from a parsed JSON result if the model
 * happened to include one. Accepts values 0–1 or 0–100; normalises both
 * into a 0–1 float. Returns null when absent or non-numeric.
 */
export function extractConfidence(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const c = parsed.confidence;
  if (typeof c !== "number" || !isFinite(c)) return null;
  if (c >= 0 && c <= 1) return c;
  if (c > 1 && c <= 100) return c / 100;
  return null;
}
