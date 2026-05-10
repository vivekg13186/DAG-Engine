# Email Trigger Guide

The email trigger watches an IMAP mailbox via IDLE; whenever a new
message arrives, it enqueues a workflow execution with the message
metadata + body as the user-supplied input.

## How it's wired

The trigger doesn't carry credentials directly any more — it references
a stored **mail.imap** configuration by name. Create the configuration
once, then point any number of email triggers at it.

### 1. Create a mail.imap configuration

Home → **Configurations** → **+ New** → type **mail.imap**:

| Field | Description |
| :--- | :--- |
| `host` | IMAP host. |
| `port` | IMAP port (993 IMAPS, 143 STARTTLS). |
| `tls` | True for IMAPS / STARTTLS. |
| `username` | Mailbox username. |
| `password` | Mailbox password (encrypted at rest). |
| `folder` | Mailbox to watch. Default `INBOX`. |

### 2. Create the trigger

Home → **Triggers** → **+ New** → driver `email`. The configuration form
asks for:

| Field | Description |
| :--- | :--- |
| `config` | Name of the mail.imap configuration above. |
| `mailbox` | Folder to watch (overrides the config's `folder` if set). |
| `markAsSeen` | Mark messages `\Seen` after reading (default `true`). |
| `parseAttachments` | Decode attachments into the payload. Default `true`. |

### 3. Pick the workflow it fires

The trigger row has a `graph_id` field — the workflow that runs whenever
a new message arrives. Each new message is one execution.

## Local testing with Mailpit (Docker)

Mailpit is a tiny SMTP+IMAP server with a web UI for browsing captured
messages. Faster to set up than GreenMail and has no auth quirks.

```bash
docker run -d \
  --name mailpit \
  -p 1025:1025 \
  -p 1143:1143 \
  -p 8025:8025 \
  -e MP_LISTEN_IMAP=0.0.0.0:1143 \
  -e MP_IMAP_AUTH_ACCEPT_ANY=true \
  -e MP_IMAP_AUTH_ALLOW_INSECURE=true \
  axllent/mailpit
```

* SMTP: `localhost:1025` (use a separate `mail.smtp` config for `email.send`).
* IMAP: `localhost:1143` — that's what the trigger connects to.
* Web UI: <http://localhost:8025> — read every captured email here.

Create a `mail.imap` config:
* `host`: `localhost`
* `port`: `1143`
* `tls`: `false`
* `username` / `password`: anything (`MP_IMAP_AUTH_ACCEPT_ANY` makes Mailpit accept them).
* `folder`: `INBOX`

## Workflow example

```json
{
  "name": "log-incoming-emails",
  "description": "Triggered by every new email; logs subject + sender.",
  "nodes": [
    {
      "name": "log_email_data",
      "action": "log",
      "inputs": {
        "message": "New email received! From: ${from} | Subject: ${subject}"
      }
    }
  ]
}
```

The trigger's payload is exposed as the user-supplied input (i.e. flat
on `ctx`), so `${from}`, `${subject}`, `${text}`, etc. are reachable
without prefixing.

## Payload structure

```js
{
  from:    [ "alice@example.com" ],   // array of senders
  to:      [ "you@example.com" ],
  subject: "Hello",
  text:    "Plain-text body",
  html:    "<p>HTML body</p>",
  receivedAt: "2026-05-10T08:30:00.000Z",
  attachments: [
    { filename: "report.pdf", contentType: "application/pdf", size: 12345 }
    // attachment content is dropped from the trigger payload to keep
    // executions lean — fetch via a separate IMAP plugin if needed
  ]
}
```

## Troubleshooting

### "config not found" on trigger start
The trigger's `config` field points at a name that doesn't exist. Open
Home → Configurations and verify the row.

### "Connection refused" / TLS errors
* For Mailpit, ensure `tls: false` and `MP_IMAP_AUTH_ALLOW_INSECURE=true` is set on the container.
* For real providers, port 993 with `tls: true` is the safe default.
* If you see "Failed to receive greeting from server", you've probably set `tls: true` on a non-TLS port (or vice versa).

### Trigger doesn't fire on new messages
* Check the worker logs — the email trigger writes structured logs at
  `info` level for every IDLE notification. If you see `exists` events
  but no executions, the messages might already be `\Seen`.
* Verify `markAsSeen: true` on the trigger if you don't want to
  re-process old messages every restart.

### Gmail freezes after the first message
Fixed in the engine — earlier revisions called IMAP STORE mid-FETCH,
which Gmail dislikes. The current driver collects the batch first,
marks `\Seen` after the iterator drains, and re-enters IDLE explicitly.

### Self-signed certs on a real server
The trigger sets `tls.rejectUnauthorized = false` automatically when
`tls: true` is paired with a non-standard CA — no extra config needed.

## Technical reference: connection lifecycle

The email trigger runs an explicit IDLE loop:

1. Connect (imapflow) and open the mailbox.
2. Issue an `IDLE` command and wait for `exists` notifications.
3. On notification: exit IDLE, fetch the new messages, mark them `\Seen` (after the fetch iterator drains), enqueue an execution per message, re-enter IDLE.
4. On socket error: log, reconnect with exponential backoff.
