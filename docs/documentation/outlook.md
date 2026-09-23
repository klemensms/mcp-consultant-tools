# Outlook

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/OUTLOOK_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/outlook`

Read and act on your own Outlook mailbox through Microsoft Graph, signed in as you (device code). Reading works out of the box; drafts, sending and deleting each sit behind their own switch, and every switch is off by default.

## Tools

| Tool | Switch | Description |
|------|--------|-------------|
| `mail-authenticate` | always on | Start sign-in: returns a URL and a one-time code |
| `mail-auth-status` | always on | Sign-in state, granted permissions, and what each tool group can do |
| `mail-logout` | always on | Sign out and delete the cached sign-in |
| `mail-list-folders` | always on | Top-level folders with unread and total counts |
| `mail-list-messages` | always on | Messages in a folder, newest first, with filters (unread, sender, dates, attachments) |
| `mail-search-messages` | always on | Search the whole mailbox (text or KQL) |
| `mail-get-message` | always on | One message with its body as text and its attachment list |
| `mail-get-conversation` | always on | Every message in a thread, oldest first |
| `mail-download-attachment` | always on | Save an attachment to the download folder |
| `mail-create-draft` | `OUTLOOK_ENABLE_WRITE` | New draft (nothing is sent) |
| `mail-create-reply-draft` | `OUTLOOK_ENABLE_WRITE` | Reply or reply-all draft, your text above the quoted thread |
| `mail-create-forward-draft` | `OUTLOOK_ENABLE_WRITE` | Forward draft with an optional note |
| `mail-update-draft` | `OUTLOOK_ENABLE_WRITE` | Change a draft's recipients, subject or body |
| `mail-add-draft-attachment` | `OUTLOOK_ENABLE_WRITE` | Attach a local file from your home folder to a draft |
| `mail-mark-read` | `OUTLOOK_ENABLE_WRITE` | Mark a message read or unread |
| `mail-move-message` | `OUTLOOK_ENABLE_WRITE` | Move a message to another folder |
| `mail-flag-message` | `OUTLOOK_ENABLE_WRITE` | Flag, complete or clear a follow-up flag |
| `mail-send-draft` | `OUTLOOK_ENABLE_SEND` | Send an existing draft (real mail, cannot be undone) |
| `mail-send` | `OUTLOOK_ENABLE_SEND` | Compose and send in one step (real mail, cannot be undone) |
| `mail-delete-message` | `OUTLOOK_ENABLE_DELETE` | Move a message to Deleted Items (recoverable); needs `confirm: true` |

## Configuration

**VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with `mcpServers`. The `command`, `args` and `env` are the same in both.

```json
{
  "servers": {
    "outlook": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/outlook", "mcp-outlook"],
      "env": {
        "OUTLOOK_TENANT_ID": "your-azure-tenant-id",
        "OUTLOOK_CLIENT_ID": "your-app-client-id",
        "OUTLOOK_ENABLE_WRITE": "false",
        "OUTLOOK_ENABLE_SEND": "false",
        "OUTLOOK_ENABLE_DELETE": "false",
        "OUTLOOK_DOWNLOAD_DIR": "",
        "OUTLOOK_MAX_ATTACHMENT_MB": "25"
      }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `OUTLOOK_TENANT_ID` | required | Your Microsoft Entra tenant id |
| `OUTLOOK_CLIENT_ID` | required | Application (client) id of the Outlook app registration |
| `OUTLOOK_ENABLE_WRITE` | `false` | Drafts, attachments, mark read, move, flag |
| `OUTLOOK_ENABLE_SEND` | `false` | Sending; independent of write |
| `OUTLOOK_ENABLE_DELETE` | `false` | Deleting to Deleted Items |
| `OUTLOOK_DOWNLOAD_DIR` | `~/Downloads/mcp-outlook` | Where attachments are saved |
| `OUTLOOK_MAX_ATTACHMENT_MB` | `25` | Largest local file `mail-add-draft-attachment` accepts |

Only the exact string `true` turns a switch on. A switched-off tool still appears and, when called, says which variable enables it.

## App registration

Ask your administrator for a single-tenant app registration with **Allow public client flows** set to Yes, no client secret, and these **delegated** Microsoft Graph permissions with admin consent: `User.Read`, `offline_access`, `Mail.ReadWrite`, `Mail.Send`. Delegated permissions mean the server can only ever reach your own mailbox.

## Signing in

Call `mail-authenticate` (or run `mcp-outlook-cli auth login`), open the URL, enter the code and sign in. The sign-in is cached encrypted on your machine and renews silently for about 90 days; the CLI and the MCP server share it.

## Notable behaviour

- **Email content is treated as untrusted.** Message bodies come back wrapped in a labelled block saying they came from an email and are data, not instructions.
- **Attachments you add must be inside your home folder.** Hidden folders and credential-shaped files (`.env`, `id_*`, `.pem`, `.key`, `.p12`, `.pfx`) are refused, so an instruction hidden in an email cannot attach a key file.
- **Downloads never overwrite.** A second file with the same name is saved as `name (1).ext`.
- **Delete is never permanent.** `mail-delete-message` moves the message to Deleted Items.
- **A missing permission is reported per tool.** If the registration lacks a mail permission, sign-in still works and the affected tools say which permission to ask your administrator for.
