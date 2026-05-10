# file.list

List entries in a directory. Supports an optional glob filter and
recursive traversal.

## Prerequisites
* **Local filesystem access** from the worker.
* When `FILE_ROOT` is set, the path must resolve inside it.

### Optional (for testing)

```bash
mkdir -p demo/a demo/b
echo "file1" > demo/a/test1.txt
echo "file2" > demo/b/test2.txt
```

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `path` | Required. Directory to list. | `./demo` |
| `pattern` | Optional `*` / `?` glob on basename. | `*.txt` |
| `recursive` | Walk subdirectories. Default `false`. | `true` |
| `includeHidden` | Include dotfiles. Default `false`. | `false` |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `entries` | Array of entry descriptors. | `[{ "name": "test1.txt", "path": "...", "isFile": true, ... }]` |
| `count` | Length of `entries`. | `2` |

Each entry: `{ name, path, isFile, isDirectory, size, mtime }`.

`primaryOutput`: `entries`.

## Sample workflow

```json
{
  "name": "file-list-example",
  "description": "List all .txt files under ./demo (recursively) and log the count.",
  "data": { "dirPath": "./demo" },
  "nodes": [
    {
      "name": "start",
      "action": "log",
      "inputs": { "message": "Listing directory ${data.dirPath}" }
    },
    {
      "name": "listFiles",
      "action": "file.list",
      "inputs": {
        "path":          "${data.dirPath}",
        "pattern":       "*.txt",
        "recursive":     true,
        "includeHidden": false
      },
      "outputs": { "entries": "fileEntries", "count": "totalFiles" }
    },
    {
      "name": "result",
      "action": "log",
      "inputs": { "message": "Found ${totalFiles} files" }
    }
  ],
  "edges": [
    { "from": "start",     "to": "listFiles" },
    { "from": "listFiles", "to": "result" }
  ]
}
```

## Expected output

```json
{
  "entries": [
    {
      "name":        "test1.txt",
      "path":        "/absolute/path/demo/a/test1.txt",
      "isFile":      true,
      "isDirectory": false,
      "size":        5,
      "mtime":       "2026-05-06T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

## Troubleshooting
* **ENOENT.** Directory doesn't exist. Verify the path.
* **Pattern not matching.** Glob is `*` / `?` only, anchored to the basename. `*.csv` matches `data.csv` but not `csv-data.txt`.
* **EACCES.** The worker lacks read permission on the directory.
* **Empty results.** Hidden files are excluded by default — set `includeHidden: true`.

## Library
* `node:fs/promises` — `readdir`, `stat`.
* `node:path` — path manipulation.
* `../io/util.js` — `resolveSafePath`, `globToRegExp`.

## Reference
* [Node.js fs.readdir](https://nodejs.org/api/fs.html#fspromisesreaddirpath-options)
* [Node.js fs.stat](https://nodejs.org/api/fs.html#fspromisesstatpath-options)
