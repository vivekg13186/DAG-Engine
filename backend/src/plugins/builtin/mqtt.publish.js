// mqtt.publish — push a single message onto an MQTT topic.
//
// Takes a stored mqtt configuration by name (created on the Home page →
// Configurations table, type=mqtt) which provides the broker url,
// optional clientId, and credentials. Per-call overrides for topic,
// payload, qos and retain.
//
// Output is metadata about the publish; the broker doesn't return the
// payload back, so callers should drive flow off the trigger side
// rather than chaining off this node's output.

import { getMqttClient, waitForConnect } from "../mqtt/util.js";

export default {
  name: "mqtt.publish",
  description:
    "Publish a single MQTT message. The `config` input names a stored " +
    "configuration of type mqtt that supplies the broker URL and " +
    "credentials. Manage configs from the Home page → Configurations.",

  inputSchema: {
    type: "object",
    required: ["config", "topic", "payload"],
    properties: {
      config: {
        type: "string",
        minLength: 1,
        description: "Name of a stored mqtt configuration.",
      },
      topic: {
        type: "string",
        minLength: 1,
        description: "MQTT topic to publish to (no wildcards on publish).",
      },
      // Accept any value — strings go on the wire as-is, anything else
      // is JSON-encoded so workflows can pass objects directly.
      payload: {},
      qos: { type: "integer", enum: [0, 1, 2], default: 0 },
      retain: { type: "boolean", default: false },
    },
  },

  // What ctx[outputVar] receives when the node-level outputVar is set.
  primaryOutput: "messageId",

  outputSchema: {
    type: "object",
    properties: {
      topic:   { type: "string" },
      bytes:   { type: "integer" },
      qos:     { type: "integer" },
      retain:  { type: "boolean" },
      // The broker may assign a packet id we can echo back.
      messageId: { type: "integer" },
    },
  },

  async execute(input, ctx) {
    const cfg = ctx?.config?.[input.config];
    if (!cfg || typeof cfg !== "object") {
      throw new Error(
        `mqtt.publish: config "${input.config}" not found. ` +
        `Create a configuration of type mqtt on the Home page → Configurations.`,
      );
    }
    if (!cfg.url) {
      throw new Error(`mqtt.publish: config "${input.config}" has no url set.`);
    }

    const client = getMqttClient({
      url:      cfg.url,
      username: cfg.username,
      password: cfg.password,
      clientId: cfg.clientId,
    });
    await waitForConnect(client);

    // Encode the payload. Strings + Buffers go on the wire verbatim;
    // anything else is JSON-stringified so workflows can pass objects
    // directly without a separate transform node.
    let body;
    if (input.payload == null) {
      body = "";
    } else if (typeof input.payload === "string") {
      body = input.payload;
    } else if (Buffer.isBuffer(input.payload)) {
      body = input.payload;
    } else {
      try { body = JSON.stringify(input.payload); }
      catch (e) { throw new Error(`mqtt.publish: failed to serialise payload — ${e.message}`); }
    }

    const opts = {
      qos:    typeof input.qos === "number" ? input.qos : 0,
      retain: !!input.retain,
    };

    const packet = await new Promise((resolve, reject) => {
      client.publish(input.topic, body, opts, (err, p) => {
        if (err) return reject(err);
        resolve(p || {});
      });
    });

    return {
      topic:     input.topic,
      bytes:     Buffer.byteLength(body),
      qos:       opts.qos,
      retain:    opts.retain,
      messageId: packet.messageId,
    };
  },
};
