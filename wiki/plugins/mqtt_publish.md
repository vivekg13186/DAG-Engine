# mqtt.publish

Publish a single MQTT message to a broker. The broker URL and
credentials live in a stored **mqtt** configuration; the plugin
references it by name. Per-call inputs cover the topic, payload, QoS,
and retain flag.

The plugin shares a connection cache with the `mqtt` trigger, so a flow
that publishes to the same broker it's also subscribed to rides on top
of the same TCP connection.

## Prerequisites
* **An MQTT broker** reachable from the worker (Mosquitto, HiveMQ, AWS IoT, the local Docker option below, …).
* **A stored mqtt configuration:**
  1. Home → **Configurations** → **+ New** → type **mqtt**.
  2. Fill in `url` (`mqtt://` / `mqtts://` / `ws://` / `wss://`), optional `clientId`, optional `username`, optional `password`.
  3. Save. The password is encrypted at rest.

### Local broker via Docker

```bash
docker run -d \
  -p 1883:1883 \
  --name mqtt-broker \
  eclipse-mosquitto:latest \
  mosquitto -c /dev/null --allow-anonymous true --listener 1883 0.0.0.0
```

Then create an mqtt config with `url: mqtt://localhost:1883` and no credentials.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Name of a stored mqtt configuration. | `homeAssistant` |
| `topic` | Required. The topic to publish to. No wildcards on publish. | `home/automation/dag-engine` |
| `payload` | Required. The body to send. Strings + `Buffer`s are sent verbatim; anything else is JSON.stringify'd. | `{"ok": true, "at": "${data.now}"}` |
| `qos` | `0` (default) / `1` / `2`. | `1` |
| `retain` | If `true`, the broker stores the message as the topic's last value. Default `false`. | `false` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `topic` | Echoed back. | `home/automation/dag-engine` |
| `bytes` | Size of the encoded payload. | `25` |
| `qos` | Echoed back. | `1` |
| `retain` | Echoed back. | `false` |
| `messageId` | The packet id the broker assigned (for QoS 1/2). | `42` |

`primaryOutput`: `messageId`.

## Sample workflow

```json
{
  "name": "publish-status-update",
  "nodes": [
    {
      "name": "publish_event",
      "action": "mqtt.publish",
      "inputs": {
        "config":  "homeAssistant",
        "topic":   "home/automation/dag-engine",
        "payload": { "ok": true, "at": "${data.now}" },
        "qos":     0,
        "retain":  false
      },
      "outputs": { "messageId": "msgId", "bytes": "size" }
    },
    {
      "name": "log_publish",
      "action": "log",
      "inputs": { "message": "Published ${size} bytes; broker assigned id ${msgId}" }
    }
  ],
  "edges": [
    { "from": "publish_event", "to": "log_publish" }
  ]
}
```

## Expected output

```json
{
  "topic":     "home/automation/dag-engine",
  "bytes":     25,
  "qos":       0,
  "retain":    false,
  "messageId": 1
}
```

## Troubleshooting
* **`config "<name>" not found`.** No stored mqtt configuration with that name. Open Home → Configurations.
* **`config "<name>" has no url set`.** The stored configuration is missing the `url` field. Re-open and fill it in.
* **`Connection refused`.** Broker isn't listening, or there's a firewall in the way. From the worker host, try `mosquitto_sub -h <host> -p <port> -t '#'` to verify reachability.
* **No `messageId`.** With QoS 0, brokers commonly don't return a packet id — the field is empty. Use QoS 1 or 2 if you need delivery confirmation.

## Library
* `mqtt` (mqtt.js) — the broker client. The shared connection cache lives in `backend/src/plugins/mqtt/util.js`.

## Reference
* [MQTT.js documentation](https://github.com/mqttjs/MQTT.js)
* [MQTT specification](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html)
