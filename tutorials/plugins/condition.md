# condition

A simple utility plugin used to evaluate a truthy or falsy value and return it as a formal boolean. This is primarily used to store the result of a complex logic check so it can be referenced by multiple downstream nodes using `executeIf`.

## Sample workflow
```json
{
  "name": "Condition-Test",
  "meta": {
    "positions": {
      "Print-A": {
        "x": 277,
        "y": 116
      },
      "A_is_big": {
        "x": 19,
        "y": 79
      },
      "Print-B": {
        "x": 37,
        "y": 158
      },
      "Print-C": {
        "x": 104,
        "y": 215
      }
    }
  },
  "data": {
    "a": 1,
    "b": 2,
    "c": 1
  },
  "nodes": [
    {
      "name": "Print-A",
      "action": "log",
      "inputs": {
        "message": "A is big"
      }
    },
    {
      "name": "A_is_big",
      "action": "condition",
      "description": "Returns a boolean — handy to gate downstream nodes via executeIf.",
      "executeIf": "${a>b}"
    },
    {
      "name": "Print-B",
      "action": "log",
      "description": "Logs a message and returns it as output.message.",
      "inputs": {
        "message": "B is big"
      }
    },
    {
      "name": "Print-C",
      "action": "log",
      "description": "Logs a message and returns it as output.message.",
      "inputs": {
        "message": ""
      },
      "executeIf": "${c>b}"
    }
  ],
  "edges": [
    {
      "from": "A_is_big",
      "to": "Print-A"
    }
  ]
}
```

## Expected output
The plugin explicitly returns a boolean:
```json
{
  "result": true
}
```

## Troubleshooting
* **Unexpected Falsy Values:** In JavaScript, values like `0`, `""` (empty string), `null`, and `undefined` are evaluated as `false`. Ensure your input logic accounts for this.
* **String Comparisons:** If comparing strings, ensure the casing matches, as `${"Active" == "active"}` will return `false`.

## Library
* **Native:** Uses the standard JavaScript `Boolean()` constructor.

## Reference
* [MDN Boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)
* [Truthy vs Falsy (MDN)](https://developer.mozilla.org/en-US/docs/Glossary/Truthy)
