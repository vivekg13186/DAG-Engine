# file.read

Read a file from disk and return its contents in the specified encoding.

## Prerequisites
* **Local filesystem access** from the worker.
* When `FILE_ROOT` is set in the env, the path must resolve inside that directory.

### Optional (for testing)

```bash
echo "hello world" > sample.txt
```

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. Path to the file. Relative paths resolve against `FILE_ROOT` if set, otherwise `process.cwd()`. | `./sample.txt` |
| `encoding` | `utf8` (default) / `utf-8` / `ascii` / `latin1` / `base64`. | `utf8` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute resolved path. | `/app/sample.txt` |
| `content` | File contents in the chosen encoding. | `hello world` |
| `size` | File size in bytes. | `11` |
| `encoding` | Echoed back for downstream nodes. | `utf8` |

`primaryOutput`: `content`.

## Sample workflow

```json
{
  "name": "file-read-example",
  "description": "Read a file and log its size + first chunk.",
  "data": { "filePath": "./sample.txt" },
  "nodes": [
    {
      "name": "start",
      "action": "log",
      "inputs": { "message": "Reading file ${data.filePath}" }
    },
    {
      "name": "readFile",
      "action": "file.read",
      "inputs": { "path": "${data.filePath}", "encoding": "utf8" },
      "outputs": { "content": "fileContent", "size": "fileSize", "path": "resolvedPath" }
    },
    {
      "name": "result",
      "action": "log",
      "inputs": { "message": "Read ${fileSize} bytes from ${resolvedPath}: ${fileContent}" }
    }
  ],
  "edges": [
    { "from": "start",    "to": "readFile" },
    { "from": "readFile", "to": "result" }
  ]
}
```

## Expected output

```json
{
  "path":     "/absolute/path/to/sample.txt",
  "content":  "hello world",
  "size":     11,
  "encoding": "utf8"
}
```

## Troubleshooting
* **ENOENT.** The path doesn't exist. Verify it; remember relative paths resolve against `FILE_ROOT` when set.
* **Unsupported encoding.** Stick to `utf8` / `utf-8` / `ascii` / `latin1` / `base64`.
* **EACCES.** The worker process lacks read permission on the file.
* **Binary data garbled in `content`.** Use `encoding: "base64"` for non-text files; the consumer can decode as needed.
* **Path escaped FILE_ROOT.** When `FILE_ROOT` is set, absolute paths outside it (or relative paths with `..`) are rejected — keep paths inside the sandbox.

## Library
* `node:fs/promises` — `readFile`, `stat`.
* `../io/util.js` — `resolveSafePath`.

## Reference
* [Node.js fs.readFile](https://nodejs.org/api/fs.html#fspromisesreadfilepath-options)
