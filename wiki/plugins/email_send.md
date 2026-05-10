# email.send

Send email via SMTP. Highly flexible: HTML/plain bodies, To/Cc/Bcc,
attachments, custom headers. Credentials live in a stored **mail.smtp**
configuration that the plugin references by name — there's no inline
`smtp: { ... }` block any more, and there's no `SMTP_*` env-var override
on a per-call basis.

## Prerequisites
* **An SMTP provider** (SendGrid, Mailgun, AWS SES, Gmail, Mailpit for local dev, …).
* **A stored mail.smtp configuration:**
  1. Home → **Configurations** → **+ New** → type **mail.smtp**.
  2. Fill in `host`, `port`, `secure` (true for 465, false for 587 with STARTTLS), `username`, `password`, optional `from`.
  3. Save. The password is encrypted at rest (AES-256-GCM keyed by `CONFIG_SECRET`).
* For dry-run testing, use [Mailpit](https://github.com/axllent/mailpit) locally — no credentials needed, every captured message is browseable in its web UI.

## SMTP provider notes

### SendGrid
Create an API key with "Mail Send" permission, then store as a `mail.smtp` config:
* `host`: `smtp.sendgrid.net`
* `port`: `587` (or `465` for SSL)
* `secure`: `false` (or `true` for 465)
* `username`: literally `apikey`
* `password`: your SG API key
* `from`: `you@yourdomain.com`

### Gmail
Two-factor auth + an App Password. **Don't** use your account password.
1. [Google Account → Security → 2-Step Verification](https://myaccount.google.com/security).
2. Search for **App Passwords**, generate one for "Mail" / "Other".
3. Store as a `mail.smtp` config:
   * `host`: `smtp.gmail.com`
   * `port`: `465` (with `secure: true`) or `587` (with `secure: false`)
   * `username`: `your-email@gmail.com`
   * `password`: the 16-character app password
   * `from`: `your-email@gmail.com`

### Mailpit (local dev)
* `host`: `localhost`
* `port`: `1025`
* `secure`: `false`
* `username` / `password`: leave blank (or anything — Mailpit accepts any auth in dev)
* `from`: `noreply@example.com`

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `config` | Required. Name of a stored mail.smtp configuration. | `sendgrid` |
| `to` | Recipient(s). String or array. | `"ops@example.com"` |
| `cc` / `bcc` | Optional, same shape as `to`. | `["a@x.com", "b@x.com"]` |
| `from` | Override the configuration's default `from`. | `DAG Engine <noreply@example.com>` |
| `replyTo` | Reply-To address. | `support@example.com` |
| `subject` | Required. Subject line. | `Build #${nodes.build.output.id} succeeded` |
| `text` | Plain-text body. At least one of `text` / `html` is required. | `Plain-text body — ${name}` |
| `html` | HTML body. | `<p>HTML body — <strong>${name}</strong></p>` |
| `headers` | Custom headers. | `{ "x-flow-id": "${flowId}" }` |
| `attachments` | Array of `{ filename, content?, path?, contentType?, encoding?, cid? }`. | `[{"filename": "report.csv", "path": "/tmp/report.csv"}]` |

At least one of `to` / `cc` / `bcc` must be set, and at least one of `text` / `html`.

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `messageId` | Server-assigned message id. | `<...@sendgrid.net>` |
| `accepted` | Addresses the SMTP server accepted. | `["ops@example.com"]` |
| `rejected` | Addresses it rejected. | `[]` |
| `response` | Raw SMTP response line. | `250 2.0.0 OK` |
| `envelope` | Envelope info as nodemailer reports it. | `{ "from": "...", "to": ["..."] }` |
| `preview` | Rendered MIME message — populated only in jsonTransport (dry-run) mode. | `Content-Type: text/plain...` |

`primaryOutput`: `messageId`.

## Sample workflow

```json
{
  "name": "send-welcome-email",
  "nodes": [
    {
      "name": "send_welcome",
      "action": "email.send",
      "inputs": {
        "config":  "sendgrid",
        "to":      "newbie@example.com",
        "subject": "Welcome to our Platform!",
        "html":    "<h1>Welcome!</h1><p>Glad to have you.</p>"
      },
      "outputs": { "messageId": "sentId" }
    },
    {
      "name": "log_send",
      "action": "log",
      "inputs": { "message": "Sent welcome email; messageId=${sentId}" }
    }
  ],
  "edges": [
    { "from": "send_welcome", "to": "log_send" }
  ]
}
```

## Troubleshooting
* **`config "<name>" not found`.** No stored mail.smtp configuration with that name. Open Home → Configurations.
* **`config "<name>" has no host set`.** The configuration is missing required fields. Re-open it and complete it.
* **Gmail `535 5.7.8 Authentication Failed`.** You're using an account password instead of an App Password.
* **SendGrid auth failure.** Username must be exactly `apikey` (lowercase).
* **Connection timeout.** Some cloud providers block outbound port 25 — most providers prefer 587 (STARTTLS) or 465 (SSL). Make sure the chosen port is open.

## Library
* `nodemailer` — the SMTP client.

## Reference
* [Nodemailer documentation](https://nodemailer.com/)
