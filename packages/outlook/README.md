# @mcp-consultant-tools/outlook

MCP server and CLI for your own Outlook mailbox and calendar, signed in as you through Microsoft Graph (device code). Read mail and your calendar out of the box; turn on drafts, sending, deleting, colleagues' calendars and calendar changes one switch at a time.

## Features

- List folders and messages, search the mailbox (text or KQL), read a message or a whole thread with the body as plain text
- Download attachments to a fixed folder, never overwriting
- Drafts, replies with the quoted thread kept, forwards, local file attachments (upload session above 3 MB)
- Send a draft or send in one step, behind its own switch
- Delete to Deleted Items only, behind its own switch and a `confirm` flag
- Calendar: your events, colleagues' shared calendars, free/busy for anyone, suggested meeting times; create, change and cancel appointments and meetings, answer invitations, each behind a switch that depends on whether anyone is notified
- Encrypted token cache shared by the MCP server and the CLI; silent renewal

## Installation

```bash
npx -y --package=@mcp-consultant-tools/outlook mcp-outlook
```

## Configuration

```json
{
  "mcpServers": {
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

The app registration needs "Allow public client flows" on, no client secret, and delegated Microsoft Graph permissions `User.Read`, `offline_access`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite` and `Calendars.ReadWrite.Shared` with admin consent (`OnlineMeetings.ReadWrite` as well for automatic recording). Without a mail permission, sign-in still works and each affected tool names the permission it is missing.

## Sign in

```bash
npx -y --package=@mcp-consultant-tools/outlook mcp-outlook-cli auth login
```

Open the URL, enter the code and sign in. Or call the `mail-authenticate` tool from your MCP client.

## Tools

31 tools. 22 prefixed `mail-`: 3 auth, 7 read, 5 drafts (`OUTLOOK_ENABLE_DRAFTS`), 3 write (`OUTLOOK_ENABLE_WRITE`), 1 categories (`OUTLOOK_ENABLE_CATEGORIES`), 2 send (`OUTLOOK_ENABLE_SEND`), 1 delete (`OUTLOOK_ENABLE_DELETE`). 9 prefixed `calendar-`: 5 reads and 4 changes (`OUTLOOK_ENABLE_CALENDAR_WRITE`, `_INVITE`, `_SHARED`, `_DELEGATE`). Every tool has a matching `mcp-outlook-cli` command.

Guide: `docs/documentation/OUTLOOK.md`. Full reference: `docs/technical/OUTLOOK_TECHNICAL.md`.

## Safety

- Every switch is off by default; only the exact string `true` turns one on.
- Email bodies are returned wrapped as untrusted content, so an instruction inside an email is not mistaken for yours.
- Attachments you add must be inside your home folder; hidden folders and credential files are refused.
- The server holds no secret and can only reach your own mailbox, and the calendars you can already open.
