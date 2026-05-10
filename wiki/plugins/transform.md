# transform

Evaluates a FEEL expression and returns its result under `value`.
Use it to reshape data, build arrays for downstream nodes (e.g. the
`params` for a `sql.*` plugin or the `data` for `csv.write`), filter
collections, or compute derived values.

## Prerequisites
* **No external dependencies.** FEEL evaluation is bundled in the engine via [`feelin`](https://github.com/nikku/feelin).

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `expression` | A raw FEEL expression evaluated against the runtime context. **No `${…}` wrapping.** Multi-line ok — the property panel renders this as a textarea. | `for n in [1,2,3] return n * 2` |

Expression examples:
* `user.firstName + " " + user.lastName` → string
* `for o in orders return o.total` → list
* `if x > 0 then "positive" else "non-positive"` → string
* `count(items) > 5` → boolean
* `[for r in rows return [r.id, r.name]]` → 2D array (handy for `csv.write` / `excel.write`)

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `value` | The result of the expression. Type matches whatever FEEL produced. | `[2, 4, 6]` |

`primaryOutput`: `value`. Map it onto a ctx variable through the **Outputs** panel (`value → matrix`) or the node-level `outputVar`.

## Sample workflow

Reshape a fetched user blob into a smaller object, then log it.

```json
{
  "name": "data-reshape-example",
  "description": "Pluck a few fields out of an upstream object and log the result.",
  "data": {
    "rawUser": {
      "id": 101,
      "profile": {
        "firstName": "Jane",
        "lastName":  "Doe",
        "email":     "jane@example.com"
      }
    }
  },
  "nodes": [
    {
      "name": "reshape_user",
      "action": "transform",
      "inputs": {
        "expression": "{ fullName: data.rawUser.profile.firstName + \" \" + data.rawUser.profile.lastName, contact: data.rawUser.profile.email, userId: data.rawUser.id }"
      },
      "outputs": { "value": "simplifiedUser" }
    },
    {
      "name": "debug_output",
      "action": "log",
      "inputs": {
        "message": "Processed user: ${simplifiedUser.fullName} (ID: ${simplifiedUser.userId})"
      }
    }
  ],
  "edges": [
    { "from": "reshape_user", "to": "debug_output" }
  ]
}
```

## Expected output

```json
{
  "value": {
    "fullName": "Jane Doe",
    "contact":  "jane@example.com",
    "userId":   101
  }
}
```

## Troubleshooting
* **`for n in [1,2,3] return n * 2` returns `[2,4,6]`, but `[for n in [1,2,3] return n * 2]` returns `[[2,4,6]]`.** The outer brackets make a list literal containing one element (the for-expression's result). Drop them when you want the for-expression's list directly.
* **`==` doesn't compare** — FEEL uses `=`. The engine translates `==` / `!=` / `&&` / `||` for compatibility, but writing native FEEL is clearer: `x = 5`, `a and b`, `not(c)`.
* **String-quoting inside an expression:** double quotes inside the JSON value need escaping (`\"`). The visual editor's textarea handles this for you.

## Library
* `feelin` — Node.js FEEL evaluator (DMN spec).

## Reference
* [DMN FEEL handbook](https://kiegroup.github.io/dmn-feel-handbook/)
* [`feelin` on GitHub](https://github.com/nikku/feelin)
