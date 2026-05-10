# file.stat

Check whether a path exists and return its size, type, and modification
time. Designed not to throw on ENOENT — returns `exists: false` instead,
which makes it ideal as an `executeIf:` gate.

## Prerequisites
* **Local filesystem access** from the worker.
* When `FILE_ROOT` is set, the path must resolve inside it.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. Path to check. | `./data/config.json` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute resolved path. | `/app/data/config.json` |
| `exists` | `true` if the path exists. | `true` |
| `isFile` | `true` if a regular file (only present when `exists`). | `true` |
| `isDirectory` | `true` if a directory (only present when `exists`). | `false` |
| `size` | File size in bytes (only present when `exists`). | `1024` |
| `mtime` | Last-modified ISO timestamp (only present when `exists`). | `2024-05-06T14:00:00.000Z` |

## Sample workflow

```json
{
  "name": "check-file-status",
  "description": "Branch on whether a log file exists.",
  "data": { "targetPath": "./logs/app.log" },
  "nodes": [
    {
      "name": "check_file",
      "action": "file.stat",
      "inputs": { "path": "${data.targetPath}" },
      "outputs": { "exists": "fileExists", "size": "fileSize" }
    },
    {
      "name": "log_exists",
      "action": "log",
      "executeIf": "${fileExists = true}",
      "inputs": { "message": "File found! Size is ${fileSize} bytes." }
    },
    {
      "name": "log_missing",
      "action": "log",
      "executeIf": "${fileExists = false}",
      "inputs": { "message": "Warning: ${data.targetPath} does not exist." }
    }
  ],
  "edges": [
    { "from": "check_file", "to": "log_exists" },
    { "from": "check_file", "to": "log_missing" }
  ]
}
```

The two `log` nodes both depend on `check_file`; whichever `executeIf` is true runs, the other is skipped.

## Expected output

```json
{
  "path":        "/absolute/path/to/logs/app.log",
  "exists":      true,
  "isFile":      true,
  "isDirectory": false,
  "size":        450,
  "mtime":       "2024-05-06T16:41:59.000Z"
}
```

## Troubleshooting
* **EACCES.** The worker can't access the parent directory. Check folder permissions.
* **Path escapes FILE_ROOT.** When set, absolute paths outside the sandbox (or relative paths with `..`) are rejected.
* **`exists: false` always.** The relative path may resolve against an unexpected `cwd` — set `FILE_ROOT` or use an absolute path.

## Library
* `node:fs/promises` — `stat`.
* `../io/util.js` — `resolveSafePath`.

## Reference
* [Node.js fs.stat](https://nodejs.org/api/fs.html#fspromisesstatpath-options)
