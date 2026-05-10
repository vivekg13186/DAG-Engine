# file.delete

Delete a file (or a directory when `recursive: true`). Refuses to remove
a non-empty directory unless `recursive` is set.

## Prerequisites
* **Local filesystem access** from the worker.
* When `FILE_ROOT` is set, the path must resolve inside it.

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. File or directory to delete. | `./test-dir/file.txt` |
| `recursive` | Allow deletion of directories (including non-empty ones). Default `false`. | `true` |
| `missingOk` | Don't throw if the path doesn't exist. Default `false`. | `true` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Absolute resolved path. | `/app/test-dir/file.txt` |
| `deleted` | `true` if a deletion happened, `false` if the path was missing and `missingOk` was set. | `true` |

`primaryOutput`: `deleted`.

## Sample workflow

```json
{
  "name": "file-delete-example",
  "description": "Tear down a temp file at the end of a flow.",
  "data": { "filePath": "./test-dir/file.txt" },
  "nodes": [
    {
      "name": "start",
      "action": "log",
      "inputs": { "message": "Attempting to delete ${data.filePath}" }
    },
    {
      "name": "deleteFile",
      "action": "file.delete",
      "inputs": {
        "path":      "${data.filePath}",
        "recursive": false,
        "missingOk": true
      },
      "outputs": { "deleted": "wasDeleted", "path": "resolvedPath" }
    },
    {
      "name": "result",
      "action": "log",
      "inputs": { "message": "Deleted: ${wasDeleted} at ${resolvedPath}" }
    }
  ],
  "edges": [
    { "from": "start",      "to": "deleteFile" },
    { "from": "deleteFile", "to": "result" }
  ]
}
```

## Expected output

Successful deletion:

```json
{ "path": "/absolute/path/to/test-dir/file.txt", "deleted": true }
```

Missing file with `missingOk: true`:

```json
{ "path": "/absolute/path/to/test-dir/file.txt", "deleted": false }
```

## Troubleshooting
* **ENOENT.** File doesn't exist. Set `missingOk: true` if that's expected, or verify the path.
* **`"<path>" is a directory; pass recursive:true to remove`.** The path is a directory and `recursive` is `false`. Set `recursive: true` to wipe it.
* **EACCES.** The worker doesn't have permission to remove the entry.
* **Path escapes FILE_ROOT.** Paths must resolve inside the sandbox when `FILE_ROOT` is set.

## Library
* `node:fs/promises` — `rm`, `stat`.
* `../io/util.js` — `resolveSafePath`.

## Reference
* [Node.js fs.rm](https://nodejs.org/api/fs.html#fspromisesrmpath-options)
* [Node.js fs.stat](https://nodejs.org/api/fs.html#fspromisesstatpath-options)
