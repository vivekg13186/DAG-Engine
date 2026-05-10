# Plugin name

Short purpose statement for the plugin.

## Prerequisites
* Any external services or stored configurations that need to exist
  before the node will work. Mention free / open-source alternatives
  where relevant (e.g. Mailpit, Mosquitto in Docker).

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `field` | What it does. | `default value` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `field` | What it produces. | `sample value` |

`primaryOutput`: `<key>` (the field that gets copied to ctx when the
node-level `outputVar` is set).

## Sample workflow

```json
{
  "name": "example-flow",
  "nodes": [
    {
      "name": "myNode",
      "action": "<plugin name>",
      "inputs": { /* ... */ }
    }
  ]
}
```

> The visual editor builds this from the canvas. If you're hand-writing
> the JSON, the keys above match what the property panel offers.

## Expected output

```json
{
  /* representative example */
}
```

## Troubleshooting
Common errors and how to fix them.

## Library
Node.js libraries the plugin depends on.

## Reference
External documentation links.
