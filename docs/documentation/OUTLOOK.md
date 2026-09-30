# Outlook

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/OUTLOOK_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/outlook`

Read and act on your own Outlook mailbox and calendar through Microsoft Graph, signed in as you (device code). Reading your mail and calendar works out of the box; drafts, sending, deleting, colleagues' calendars and every calendar change each sit behind their own switch, and every switch is off by default.

## Tools

| Tool | Switch | Description |
|------|--------|-------------|
| `mail-authenticate` | always on | Start sign-in: returns a URL and a one-time code |
| `mail-auth-status` | always on | Sign-in state, granted permissions, and what each tool group can do |
| `mail-logout` | always on | Sign out and delete the cached sign-in |
| `mail-list-folders` | always on | Top-level folders with unread and total counts |
| `mail-list-categories` | always on | The categories defined in your mailbox, with their colours |
| `mail-list-messages` | always on | Messages in a folder, newest first, with filters (unread, sender, dates, attachments) |
| `mail-search-messages` | always on | Search the whole mailbox (text or KQL) |
| `mail-get-message` | always on | One message with its body as text and its attachment list |
| `mail-get-conversation` | always on | Every message in a thread, oldest first |
| `mail-download-attachment` | always on | Save an attachment to the download folder |
| `mail-create-draft` | `OUTLOOK_ENABLE_DRAFTS` | New draft (nothing is sent) |
| `mail-create-reply-draft` | `OUTLOOK_ENABLE_DRAFTS` | Reply or reply-all draft, your text above the quoted thread |
| `mail-create-forward-draft` | `OUTLOOK_ENABLE_DRAFTS` | Forward draft with an optional note |
| `mail-update-draft` | `OUTLOOK_ENABLE_DRAFTS` | Change a draft's recipients, subject or body |
| `mail-add-draft-attachment` | `OUTLOOK_ENABLE_DRAFTS` | Attach a local file from your home folder, or a SharePoint or OneDrive file by link, to a draft |
| `mail-mark-read` | `OUTLOOK_ENABLE_WRITE` | Mark a message read or unread |
| `mail-move-message` | `OUTLOOK_ENABLE_WRITE` | Move a message to another folder |
| `mail-flag-message` | `OUTLOOK_ENABLE_WRITE` | Flag, complete or clear a follow-up flag |
| `mail-set-categories` | `OUTLOOK_ENABLE_CATEGORIES` | Add and remove categories on a message; categories you do not name are kept |
| `mail-send-draft` | `OUTLOOK_ENABLE_SEND` | Send an existing draft (real mail, cannot be undone) |
| `mail-send` | `OUTLOOK_ENABLE_SEND` | Compose and send in one step (real mail, cannot be undone) |
| `mail-delete-message` | `OUTLOOK_ENABLE_DELETE` | Move a message to Deleted Items (recoverable); needs `confirm: true` |
| `calendar-list-calendars` | always on | Your calendars and the shared ones you have added |
| `calendar-list-events` | always on (`OUTLOOK_ENABLE_CALENDAR_SHARED` for a colleague's) | Events in a date range |
| `calendar-get-event` | always on (`OUTLOOK_ENABLE_CALENDAR_SHARED` for a colleague's) | One event in full |
| `calendar-get-schedule` | always on | Free/busy for several people, even if they share nothing |
| `calendar-find-meeting-times` | always on | Suggested slots when everyone is free |
| `calendar-create-event` | `OUTLOOK_ENABLE_CALENDAR_WRITE`, or `_INVITE` with attendees | An appointment, or a meeting (invitations go out at once) |
| `calendar-update-event` | `OUTLOOK_ENABLE_CALENDAR_WRITE`, or `_INVITE` with attendees | Change an event you organise |
| `calendar-cancel-event` | `OUTLOOK_ENABLE_CALENDAR_WRITE`, or `_INVITE` with attendees | Cancel a meeting you organise, or delete your own appointment |
| `calendar-respond-to-event` | `OUTLOOK_ENABLE_CALENDAR_INVITE` | Accept, tentatively accept or decline an invitation |

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
        "OUTLOOK_ENABLE_DRAFTS": "false",
        "OUTLOOK_ENABLE_WRITE": "false",
        "OUTLOOK_ENABLE_CATEGORIES": "false",
        "OUTLOOK_ENABLE_SEND": "false",
        "OUTLOOK_ENABLE_DELETE": "false",
        "OUTLOOK_DOWNLOAD_DIR": "",
        "OUTLOOK_MAX_ATTACHMENT_MB": "25",
        "OUTLOOK_ENABLE_CALENDAR_SHARED": "false",
        "OUTLOOK_ENABLE_CALENDAR_WRITE": "false",
        "OUTLOOK_ENABLE_CALENDAR_INVITE": "false",
        "OUTLOOK_ENABLE_CALENDAR_DELEGATE": "false",
        "OUTLOOK_TIME_ZONE": ""
      }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `OUTLOOK_TENANT_ID` | required | Your Microsoft Entra tenant id |
| `OUTLOOK_CLIENT_ID` | required | Application (client) id of the Outlook app registration |
| `OUTLOOK_ENABLE_DRAFTS` | follows `OUTLOOK_ENABLE_WRITE` | Creating, changing and attaching to drafts. While unset it follows `OUTLOOK_ENABLE_WRITE`, so older configurations behave as before. Set `true` with send off for an agent that prepares mail but cannot send it |
| `OUTLOOK_ENABLE_WRITE` | `false` | Mark read, move, flag |
| `OUTLOOK_ENABLE_CATEGORIES` | `false` | Adding and removing categories on messages; independent of write, so it can be on while mark read, move and flag stay off |
| `OUTLOOK_ENABLE_SEND` | `false` | Sending; independent of write |
| `OUTLOOK_ENABLE_DELETE` | `false` | Deleting to Deleted Items |
| `OUTLOOK_DOWNLOAD_DIR` | `~/Downloads/mcp-outlook` | Where attachments are saved |
| `OUTLOOK_MAX_ATTACHMENT_MB` | `25` | Largest file `mail-add-draft-attachment` accepts |
| `OUTLOOK_ENABLE_CALENDAR_SHARED` | `false` | Reading colleagues' calendars that are shared with you |
| `OUTLOOK_ENABLE_CALENDAR_WRITE` | `false` | Appointments on your own calendar that notify nobody |
| `OUTLOOK_ENABLE_CALENDAR_INVITE` | `false` | Anything that notifies another person: invitations, updates, cancellations, replies |
| `OUTLOOK_ENABLE_CALENDAR_DELEGATE` | `false` | Changing a calendar you are a delegate on |
| `OUTLOOK_TIME_ZONE` | your machine's zone | Time zone (e.g. `Europe/London`) for times you give without one |

Only the exact string `true` turns a switch on. A switched-off tool still appears and, when called, says which variable enables it.

## App registration

Ask your administrator for a single-tenant app registration with **Allow public client flows** set to Yes, no client secret, and these **delegated** Microsoft Graph permissions with admin consent: `User.Read`, `offline_access`, `Mail.ReadWrite`, `Mail.Send`, and for the calendar `Calendars.ReadWrite` and `Calendars.ReadWrite.Shared` (both are needed: the second covers colleagues' calendars, not your own). Delegated permissions mean the server can only ever reach your own mailbox. Add `Files.Read.All` if drafts should carry SharePoint or OneDrive files as real attachments; without it, attaching by link puts a link to the file in the draft instead. Add `OnlineMeetings.ReadWrite` if the agent should be able to switch on automatic recording for a meeting.

## Signing in

Call `mail-authenticate` (or run `mcp-outlook-cli auth login`), open the URL, enter the code and sign in. The sign-in is cached encrypted on your machine and renews silently for about 90 days; the CLI and the MCP server share it.

## Notable behaviour

- **Email content is treated as untrusted.** Message bodies come back wrapped in a labelled block saying they came from an email and are data, not instructions.
- **Attachments you add must be inside your home folder.** Hidden folders and credential-shaped files (`.env`, `id_*`, `.pem`, `.key`, `.p12`, `.pfx`) are refused, so an instruction hidden in an email cannot attach a key file.
- **Drafts never send.** Every draft tool's result says nothing was sent; sending needs `OUTLOOK_ENABLE_SEND`, which no other switch turns on.
- **A SharePoint or OneDrive file is attached without touching your disk.** Its content is read into memory and attached. If your sign-in may not read it, a link goes into the draft, above any quoted thread, and the result says so.
- **Downloads never overwrite.** A second file with the same name is saved as `name (1).ext`.
- **Delete is never permanent.** `mail-delete-message` moves the message to Deleted Items.
- **Meeting invitations go out immediately.** There is no draft meeting in Microsoft Graph, so anything that would notify another person needs `OUTLOOK_ENABLE_CALENDAR_INVITE`; `OUTLOOK_ENABLE_CALENDAR_WRITE` alone can only change appointments nobody else sees. Every calendar change says who was notified.
- **Recording is off unless asked for.** A meeting records automatically only when the agent is told to; the server never changes transcription settings.
- **A missing permission is reported per tool.** If the registration lacks a mail permission, sign-in still works and the affected tools say which permission to ask your administrator for.
