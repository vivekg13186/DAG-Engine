// MQTT trigger — subscribes to one or more topics; fires once per incoming
// message with the topic + parsed payload.
//
// Config:
//   url:      "mqtt://broker.example.com:1883"   (mqtt:// mqtts:// ws:// wss://)
//   topic:    "sensors/+/temp"   (string OR array of topics — MQTT wildcards OK)
//   username, password           (optional)
//   qos:      0|1|2              (default 0)
//   parseJson: true              (default true — try JSON.parse on the payload)
//   clientId: ...                (defaults to "dag-engine-<8 random hex chars>")
//
// Payload passed to onFire:
//   { topic, message, qos, retain, receivedAt }

import mqtt from "mqtt";
import { randomBytes } from "node:crypto";
import { log } from "../../utils/logger.js";

export default {
  type: "mqtt",
  description: "Fires whenever a message arrives on one or more MQTT topics.",
  configSchema: {
    type: "object",
    required: ["url", "topic"],
    properties: {
      url:       { type: "string" },
      topic:     { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      username:  { type: "string" },
      password:  { type: "string" },
      qos:       { type: "integer", enum: [0, 1, 2], default: 0 },
      parseJson: { type: "boolean", default: true },
      clientId:  { type: "string" },
    },
  },

  async subscribe(config, onFire) {
    const topics = Array.isArray(config.topic) ? config.topic : [config.topic];
    const clientId = config.clientId || `dag-engine-${randomBytes(4).toString("hex")}`;

    const client = mqtt.connect(config.url, {
      clientId,
      username: config.username,
      password: config.password,
      reconnectPeriod: 5000,
      connectTimeout: 15000,
    });

    client.on("connect", () => {
      log.info("mqtt connected", { url: config.url, clientId, topics });
      client.subscribe(topics, { qos: config.qos ?? 0 }, (err, granted) => {
        if (err) log.warn("mqtt subscribe failed", { error: err.message });
        else log.info("mqtt subscribed", { granted });
      });
    });
    client.on("error",      (e) => log.warn("mqtt error", { error: e.message }));
    client.on("reconnect",  ()  => log.info("mqtt reconnect", { url: config.url }));
    client.on("offline",    ()  => log.warn("mqtt offline", { url: config.url }));

    client.on("message", (topic, payload, packet) => {
      const raw = payload.toString("utf8");
      let message = raw;
      if (config.parseJson !== false) {
        try { message = JSON.parse(raw); } catch { /* keep as string */ }
      }
      onFire({
        topic,
        message,
        qos: packet.qos,
        retain: packet.retain,
        receivedAt: new Date().toISOString(),
      });
    });

    return {
      stop: async () => {
        await new Promise((res) => client.end(true, {}, res));
      },
    };
  },
};
