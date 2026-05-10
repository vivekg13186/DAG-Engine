# http.request

A versatile plugin for making HTTP/HTTPS requests via the native `fetch`
API. It returns the response status, headers, and parsed body.

## Prerequisites
* **Network access** from the worker.
* For testing, free public mocks: [JSONPlaceholder](https://jsonplaceholder.typicode.com/), [httpbin.org](https://httpbin.org/).

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `url` | Required. Target URL (must be a valid URI). | `https://api.example.com/v1/data` |
| `method` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`. Defaults to `GET`. | `POST` |
| `headers` | Custom HTTP headers as an object. | `{"Authorization": "Bearer token123"}` |
| `body` | Request payload. Strings sent as-is; objects JSON.stringified. | `{"title": "foo"}` |
| `timeoutMs` | Abort after this many milliseconds. Default 15 000, max 60 000. | `5000` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `status` | HTTP response status code. | `200` |
| `headers` | Response headers as an object. | `{"content-type": "application/json"}` |
| `body` | Response body. Auto-parsed as JSON when possible, otherwise raw text. | `{"id": 1}` |

`primaryOutput`: `body`.

## Sample workflows

### GET — fetch data and react to status

```json
{
  "name": "fetch-api-data",
  "nodes": [
    {
      "name": "get_todo",
      "action": "http.request",
      "inputs": {
        "url":    "https://jsonplaceholder.typicode.com/todos/1",
        "method": "GET"
      },
      "outputs": { "status": "httpCode", "body": "todoData" }
    },
    {
      "name": "log_result",
      "action": "log",
      "executeIf": "${httpCode = 200}",
      "inputs": { "message": "Fetched Todo: ${todoData.title}" }
    }
  ],
  "edges": [
    { "from": "get_todo", "to": "log_result" }
  ]
}
```

### POST — send JSON

```json
{
  "name": "submit-json-data",
  "nodes": [
    {
      "name": "create_post",
      "action": "http.request",
      "inputs": {
        "url":     "https://jsonplaceholder.typicode.com/posts",
        "method":  "POST",
        "headers": { "Authorization": "Bearer MY_SECRET_TOKEN" },
        "body": {
          "title":  "Workflow Automation",
          "body":   "Created via http.request",
          "userId": 1
        }
      },
      "outputs": { "status": "responseStatus", "body": "responseBody" }
    },
    {
      "name": "verify_creation",
      "action": "log",
      "executeIf": "${responseStatus = 201}",
      "inputs": { "message": "Success! New resource id: ${responseBody.id}" }
    }
  ],
  "edges": [
    { "from": "create_post", "to": "verify_creation" }
  ]
}
```

## Expected output

```json
{
  "status": 201,
  "headers": { "content-type": "application/json; charset=utf-8" },
  "body": {
    "title":  "Workflow Automation",
    "body":   "Created via http.request",
    "userId": 1,
    "id":     101
  }
}
```

## Troubleshooting
* **Timeout error.** Increase `timeoutMs` (max 60 000) or check whether the server is reachable.
* **Body parsing.** If the response isn't JSON, `body` comes back as raw text — assert on `headers["content-type"]` before parsing further downstream.
* **Network blocks.** Workers behind a corporate proxy or firewall may not reach the target. The plugin doesn't auto-detect proxies; set `HTTPS_PROXY` / `HTTP_PROXY` in the worker's env if you need one.

## Library
* **Native fetch API** — built into Node.js 18+.
* `AbortController` — used for the timeout.

## Reference
* [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
* [HTTP status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
