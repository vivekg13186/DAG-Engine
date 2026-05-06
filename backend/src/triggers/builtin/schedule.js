// Schedule trigger — fires on a cron expression OR a fixed interval.
//
// Config:
//   { cron: "0 */5 * * * *" }              # croner-format cron
//   { intervalMs: 60000 }                  # plain interval
// Optional:
//   { timezone: "Europe/Berlin" }          # only meaningful with cron
//
// Payload passed to onFire:
//   { firedAt: ISO, scheduledFor: ISO|null, kind: "cron"|"interval" }

import { Cron } from "croner";

export default {
  type: "schedule",
  description: "Fires on a cron expression (croner format) or a fixed interval.",
  configSchema: {
    type: "object",
    properties: {
      cron:       { type: "string" },
      intervalMs: { type: "integer", minimum: 1000 },
      timezone:   { type: "string" },
    },
    oneOf: [
      { required: ["cron"] },
      { required: ["intervalMs"] },
    ],
  },

  async subscribe(config, onFire) {
    if (config.cron) {
      const job = new Cron(config.cron, { timezone: config.timezone }, () => {
        onFire({
          firedAt: new Date().toISOString(),
          scheduledFor: job.currentRun()?.toISOString?.() || null,
          kind: "cron",
        });
      });
      return { stop: async () => job.stop() };
    }

    if (config.intervalMs) {
      const handle = setInterval(() => {
        onFire({
          firedAt: new Date().toISOString(),
          scheduledFor: null,
          kind: "interval",
        });
      }, config.intervalMs);
      // Don't keep the event loop alive solely for this timer.
      handle.unref?.();
      return { stop: async () => clearInterval(handle) };
    }

    throw new Error("schedule trigger: either `cron` or `intervalMs` is required");
  },
};
