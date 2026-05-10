# MQTT Trigger Guide

The MQTT trigger subscribes to one or more topics on a broker; whenever
a message arrives, it enqueues a workflow execution with the message
payload as the user-supplied input.

## How it's wired

The trigger references a stored **mqtt** configuration by name — the
same configuration the `mqtt.publish` plugin uses. Both the trigger and
the publish plugin share the worker's MQTT connection cache, so a
single TCP connection can serve both directions.

### 1. Create an mqtt configuration

Home → **Configurations** → **+ New** → type **mqtt**:

| Field | Description |
| :--- | :--- |
| `url` | `mqtt://` / `mqtts://` / `ws://` / `wss://` URL. |
| `clientId` | Optional. Auto-generated as `dag-engine-<8 hex>` when blank. |
| `username` / `password` | Optional. Encrypted at rest. |

### 2. Create the trigger

Home → **Triggers** → **+ New** → driver `mqtt`:

| Field | Description |
| :--- | :--- |
| `config` | Required. Name of the mqtt configuration above. |
| `topic` | Required. Single topic string OR an array of topics. Wildcards (`+`, `#`) ok. |
| `qos` | `0` (default) / `1` / `2`. |
| `parseJson` | If `true` (default), JSON-shaped payloads are parsed before being passed to the workflow. Non-JSON payloads come through as raw strings either way. |

## Topic wildcards
* `+` — single level: `sensors/+/temp` matches `sensors/kitchen/temp`.
* `#` — multi-level: `sensors/#` matches `sensors/kitchen/temp/celsius`.

## Local broker (Docker)

```bash
docker run -d \
  -p 1883:1883 \
  --name mqtt-broker \
  eclipse-mosquitto:latest \
  mosquitto -c /dev/null --allow-anonymous true --listener 1883 0.0.0.0
```

Create an mqtt config with `url: mqtt://localhost:1883` and no credentials.

## Workflow example

```json
{
  "name": "mqtt-sensor-logger",
  "description": "Logs every MQTT message arriving on the configured topic.",
  "nodes": [
    {
      "name": "log_payload",
      "action": "log",
      "inputs": {
        "message": "MQTT message: topic=${topic} value=${message} at=${receivedAt}"
      }
    }
  ]
}
```

The trigger payload is exposed as the user input (flat on `ctx`), so
`${topic}`, `${message}`, `${qos}`, `${retain}`, `${receivedAt}` are all
reachable directly.

## Testing the trigger (publishing)

### Inside Docker
```bash
docker exec mqtt-broker mosquitto_pub -t "home/sensors/temp" -m '{"value": 22.5, "unit": "C"}'
```

### From a DAG-engine workflow
A separate flow with an `mqtt.publish` node pointing at the same configuration is the easiest sanity-check.

### GUI tools
[MQTT Explorer](https://mqtt-explorer.com/) or `mqttx`. Connect to `localhost:1883` and publish to your configured topic.

## Payload structure

```js
{
  topic:      "home/sensors/temp",
  message:    { value: 22.5, unit: "C" },     // or raw string when parseJson:false / payload non-JSON
  qos:        0,
  retain:     false,
  receivedAt: "2026-05-10T08:30:00.000Z"
}
```

## Troubleshooting

### "config not found" on trigger start
The trigger's `config` points at a name that doesn't exist. Open Home → Configurations.

### Connection refused
* Broker isn't running, or the port is firewalled. `docker logs mqtt-broker` and `nc -z localhost 1883` on the worker host.
* If the worker is itself in Docker, `localhost` resolves to the container, not the broker — use `host.docker.internal` (macOS / Windows) or the broker container's hostname.

### Message not received
* **Topic mismatch.** MQTT topics are case-sensitive.
* **JSON parsing.** With `parseJson: true`, malformed JSON keeps the value as a raw string — check the log output to confirm.
* **Retained messages.** The broker delivers the latest retained message on subscribe; your trigger fires once even if no new message has been published since last connect. Set `retain: false` on the publisher to avoid this.

### Client ID conflicts
The trigger auto-generates a unique `clientId` if you don't set one. If you do set one in the configuration, make sure it's unique — most brokers disconnect the existing client when a new one connects with the same id.
