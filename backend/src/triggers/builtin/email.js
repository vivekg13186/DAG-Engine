// Email trigger — watches an IMAP inbox and fires once per new message.
// Uses imapflow with IDLE if the server supports it, falling back to a poll.
//
// Config:
//   host: imap.example.com                  required
//   port: 993                                default 993
//   secure: true                             default true (use false for STARTTLS on 143)
//   user, pass                               required
//   mailbox: "INBOX"                         default INBOX
//   markAsSeen: true                         default true (uses \Seen flag for dedup)
//   pollIntervalMs: 60000                    used if server doesn't support IDLE
//   onlyUnseen: true                         default true — start by ignoring existing read mail
//
// Payload passed to onFire:
//   { uid, messageId, from, to, cc, subject, date, text, html, attachments[]: { filename, contentType, size } }

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { log } from "../../utils/logger.js";

export default {
  type: "email",
  description: "Fires when a new message lands in an IMAP mailbox (default INBOX).",
  configSchema: {
    type: "object",
    required: ["host", "user", "pass"],
    properties: {
      host:           { type: "string" },
      port:           { type: "integer", minimum: 1, maximum: 65535, default: 993 },
      secure:         { type: "boolean", default: true },
      user:           { type: "string" },
      pass:           { type: "string" },
      mailbox:        { type: "string", default: "INBOX" },
      markAsSeen:     { type: "boolean", default: true },
      onlyUnseen:     { type: "boolean", default: true },
      pollIntervalMs: { type: "integer", minimum: 5000, default: 60000 },
    },
  },

  async subscribe(config, onFire) {
    const client = new ImapFlow({
      host: config.host,
      port: config.port ?? 993,
      secure: config.secure !== false,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });

    let stopped = false;
    let pollHandle = null;

    async function processNewMessages() {
      const lock = await client.getMailboxLock(config.mailbox || "INBOX");
      try {
        // Walk only unseen messages; IDLE notifies us of those landing.
        for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true, source: true, internalDate: true })) {
          if (stopped) return;
          let parsed = null;
          try { parsed = await simpleParser(msg.source); }
          catch (e) { log.warn("email parse failed", { uid: msg.uid, error: e.message }); }

          const env = msg.envelope || {};
          const payload = {
            uid: msg.uid,
            messageId: parsed?.messageId || env.messageId || null,
            from:    addrList(parsed?.from?.value || env.from),
            to:      addrList(parsed?.to?.value   || env.to),
            cc:      addrList(parsed?.cc?.value   || env.cc),
            subject: parsed?.subject || env.subject || "",
            date:    (parsed?.date || env.date || msg.internalDate || new Date()).toISOString?.() ?? new Date().toISOString(),
            text:    parsed?.text || "",
            html:    parsed?.html || "",
            attachments: (parsed?.attachments || []).map(a => ({
              filename:    a.filename || "",
              contentType: a.contentType || "",
              size:        a.size || 0,
            })),
          };
          onFire(payload);

          if (config.markAsSeen !== false) {
            try { await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true }); }
            catch (e) { log.warn("email flag failed", { uid: msg.uid, error: e.message }); }
          }
        }
      } finally {
        lock.release();
      }
    }

    await client.connect();

    // Optionally process the existing unread queue once on startup.
    if (config.onlyUnseen === false) {
      // We'd need a stable seen marker for this; default behavior keeps it simple.
      log.warn("email trigger: onlyUnseen=false is treated like true (no per-trigger UID watermark yet)");
    }

    // Use IDLE when the server supports it; otherwise fall back to polling.
    if (client.serverInfo?.capabilities?.includes("IDLE")) {
      log.info("email trigger using IDLE", { host: config.host });
      client.on("exists", () => { processNewMessages().catch(e => log.warn("email exists handler", { error: e.message })); });
      // Initial sweep so we don't miss messages that landed before subscribe().
      await processNewMessages();
    } else {
      const interval = config.pollIntervalMs ?? 60000;
      log.info("email trigger polling (no IDLE)", { intervalMs: interval });
      const tick = () => processNewMessages().catch(e => log.warn("email poll", { error: e.message }));
      pollHandle = setInterval(tick, interval);
      pollHandle.unref?.();
      await tick();
    }

    return {
      stop: async () => {
        stopped = true;
        if (pollHandle) clearInterval(pollHandle);
        try { await client.logout(); } catch { /* swallow */ }
      },
    };
  },
};

function addrList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(o => o.address || o.name || String(o));
  if (typeof v === "string") return [v];
  if (typeof v === "object") return [v.address || v.name || ""];
  return [];
}
