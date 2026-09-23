# @mcp-consultant-tools/outlook

MCP server and CLI for your own Outlook mailbox, signed in as you through Microsoft Graph (device code). Read mail out of the box; turn on drafts, sending and deleting one switch at a time.

## Features

- List folders and messages, search the mailbox (text or KQL), read a message or a whole thread with the body as plain text
- Download attachments to a fixed folder, never overwriting
- Drafts, replies with the quoted thread kept, forwards, local file attachments (upload session above 3 MB)
- Send a draft or send in one step, behind its own switch
- Delete to Deleted Items only, behind its own switch and a `confirm` flag
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

The app registration needs "Allow public client flows" on, no client secret, and delegated Microsoft Graph permissions `User.Read`, `offline_access`, `Mail.ReadWrite` and `Mail.Send` with admin consent. Without a mail permission, sign-in still works and each affected tool names the permission it is missing.

## Sign in

```bash
npx -y --package=@mcp-consultant-tools/outlook mcp-outlook-cli auth login
```

Open the URL, enter the code and sign in. Or call the `mail-authenticate` tool from your MCP client.

## Tools

20 tools, all prefixed `mail-`: 3 auth, 6 read, 8 write (`OUTLOOK_ENABLE_WRITE`), 2 send (`OUTLOOK_ENABLE_SEND`), 1 delete (`OUTLOOK_ENABLE_DELETE`). Every tool has a matching `mcp-outlook-cli` command.

Guide: `docs/documentation/OUTLOOK.md`. Full reference: `docs/technical/OUTLOOK_TECHNICAL.md`.

## Safety

- Every switch is off by default; only the exact string `true` turns one on.
- Email bodies are returned wrapped as untrusted content, so an instruction inside an email is not mistaken for yours.
- Attachments you add must be inside your home folder; hidden folders and credential files are refused.
- The server holds no secret and can only reach your own mailbox.
