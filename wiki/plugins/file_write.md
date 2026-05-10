# file.write

Write a string (or base64-decoded buffer) to disk. Supports overwrite or
append, and can create missing parent directories.

## Prerequisites
* **Write permissions** on the destination directory.
* When `FILE_ROOT` is set, the path must resolve inside it.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. Destination path. | `./output/report.txt` |
| `content` | Required. The data to write (string). | `Hello world` |
| `encoding` | `utf8` (default) / `utf-8` / `ascii` / `latin1` / `base64`. With `base64`, the content string is decoded into binary first. | `utf8` |
| `mode` | `overwrite` (default) or `append`. | `append` |
| `mkdir` | If `true`, create missing parent directories. Default `false`. | `true` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute resolved path. | `/app/output/report.txt` |
| `size` | Final file size in bytes. | `1024` |

`primaryOutput`: `path`.

## Sample workflow

```json
{
  "name": "write-log-entry",
  "description": "Append a line to an audit log, creating directories if needed.",
  "data": {
    "logFile": "./data/audit/events.log",
    "entry":   "User login detected at 12:00 PM\n"
  },
  "nodes": [
    {
      "name": "write_log",
      "action": "file.write",
      "inputs": {
        "path":    "${data.logFile}",
        "content": "${data.entry}",
        "mode":    "append",
        "mkdir":   true
      },
      "outputs": { "size": "currentFileSize" }
    },
    {
      "name": "notify_success",
      "action": "log",
      "inputs": { "message": "Log updated. Total file size: ${currentFileSize} bytes." }
    }
  ],
  "edges": [
    { "from": "write_log", "to": "notify_success" }
  ]
}
```

## Expected output

```json
{
  "path": "/home/user/project/data/audit/events.log",
  "size": 1240
}
```

## Troubleshooting
* **ENOENT.** Parent directory doesn't exist and `mkdir` is `false`. Set `mkdir: true` or create the dir up front.
* **EACCES.** The worker doesn't have write permission on the directory.
* **Invalid base64.** With `encoding: "base64"`, `content` must be a valid base64 string — otherwise the file is corrupted.
* **Path escaped FILE_ROOT.** Paths must resolve inside the sandbox when `FILE_ROOT` is set.

## Library
* `node:fs/promises` — `writeFile`, `appendFile`, `mkdir`, `stat`.
* `../io/util.js` — `resolveSafePath`.

## Reference
* [Node.js fs.writeFile](https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options)
* [Node.js fs.mkdir](https://nodejs.org/api/fs.html#fspromisesmkdirpath-options)
