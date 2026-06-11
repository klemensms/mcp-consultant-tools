# 1Password Secret Resolution

All MCP servers and CLI tools in this project support **1Password secret references** as an alternative to hardcoding secrets in configuration files. Instead of putting actual API keys, tokens, and passwords in `.mcp.json` or `.env` files, you reference them by name in 1Password. The secrets are resolved at runtime via biometric authentication and cached locally (encrypted) for 60 minutes.

## Prerequisites

1. **1Password desktop app** installed ([download](https://1password.com/downloads))
2. **1Password CLI integration enabled:** Open 1Password > Settings > Developer > enable **"Integrate with 1Password CLI"**

That's it. No separate CLI download needed — the desktop app provides the CLI when you enable the integration.

## How It Works

1. You put `op://` references in your `.mcp.json` env block instead of real secrets
2. When the MCP server starts, it detects `op://` values and calls the 1Password CLI
3. 1Password prompts for biometric authentication (Touch ID / Windows Hello)
4. The resolved secrets replace the `op://` references in memory
5. Resolved values are cached locally (AES-256-GCM encrypted) for 60 minutes
6. After 60 minutes, the next server restart triggers a fresh authentication

**If no `op://` references exist**, the resolver does nothing (zero overhead). Existing configurations with hardcoded secrets continue to work unchanged.

## Building the `op://` Reference String

The format is:

```
op://vault-name/item-name/field-name
```

| Part | Where to find it |
|------|-----------------|
| `vault-name` | The name of the vault in 1Password (e.g., `Private`, `Work`, `SI`) |
| `item-name` | The title of the item in 1Password (e.g., `Azure-DevOps-PAT`) |
| `field-name` | The field within the item: `password`, `credential`, `username`, or any custom field label |

> ⚠️ **Allowed characters.** Secret references only support letters, numbers, spaces, hyphens (`-`), underscores (`_`), and periods (`.`) in each part. Any other character — `&`, `/`, `@`, `#`, `(`, `)`, etc. — makes the whole reference **invalid**, and resolution fails with `invalid character in secret reference`. This typically surfaces downstream as a confusing authentication error from the target service (e.g. Entra `AADSTS7000215: Invalid client secret`), because the unresolved value is passed through as the literal secret.
>
> If a vault or item name contains an unsupported character, either:
> 1. **Rename the item/vault** in 1Password to use only supported characters (preferred — keeps references readable), or
> 2. **Use UUIDs instead of names**: `op://<vault-uuid>/<item-uuid>/<field-name>`. Get them with `op item get "Item Name" --format json` (`id` and `vault.id`).
>
> **Always verify a new reference resolves before saving it** (prints nothing on success):
> ```bash
> op read "op://vault-name/item-name/field-name" >/dev/null && echo "resolves OK"
> ```

### Finding these values

**In the 1Password app:**
1. Open 1Password and navigate to the item
2. The **vault name** is shown in the sidebar or at the top of the item
3. The **item name** is the title of the item
4. The **field name** is the label next to each value (e.g., `password`, `username`, or custom labels you've created)

**Via the CLI** (if you have `op` available):
```bash
# List your vaults
op vault list

# Search for an item
op item list --vault "VaultName" | grep -i "keyword"

# See all fields in an item
op item get "ItemName" --vault "VaultName" --format json | python3 -c "
import json, sys
item = json.load(sys.stdin)
print(f'Vault: {item[\"vault\"][\"name\"]}')
print(f'Item:  {item[\"title\"]}')
for f in item.get('fields', []):
    label = f.get('label', f.get('id', '?'))
    ftype = f.get('type', '?')
    print(f'  Field: {label} (type={ftype})')
"
```

### Example

If you have a PAT stored in 1Password:
- Vault: `Work`
- Item title: `Azure-DevOps-PAT`
- Field: `password`

The reference string is: `op://Work/Azure-DevOps-PAT/password`

## Usage in MCP Server Configuration

Replace any secret value in your `.mcp.json` with the `op://` reference. (The example below uses the `mcpServers` wrapper, as in Claude Desktop's `claude_desktop_config.json`; in VS Code's `.vscode/mcp.json` the same `command`/`args`/`env` go under a top-level `servers` key instead.)

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-devops", "mcp-ado"],
      "env": {
        "AZUREDEVOPS_ORGANIZATION": "my-org",
        "AZUREDEVOPS_PROJECTS": "MyProject",
        "AZUREDEVOPS_PAT": "op://Work/Azure-DevOps-PAT/password",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "true"
      }
    }
  }
}
```

Only the secret values use `op://` references. Non-secret values (org names, project names, feature flags) remain as plain strings.

## Usage in CLI .env Files

```bash
AZUREDEVOPS_ORGANIZATION=my-org
AZUREDEVOPS_PROJECTS=MyProject
AZUREDEVOPS_PAT=op://Work/Azure-DevOps-PAT/password
```

## Startup Timing

When an MCP server starts with `op://` references, it must resolve them before becoming available. Claude Code waits up to **60 seconds** (default) for MCP servers to start. If you need more time to respond to the biometric prompt, increase the timeout in your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "env": {
    "MCP_TIMEOUT": "120000"
  }
}
```

This gives 2 minutes instead of 60 seconds.

## Reducing Repeated Prompts (machines without a fingerprint reader)

On a machine with **Touch ID / Windows Hello**, biometric approval is near-instant — you get one quick prompt and the rest are silent. There is nothing to do; you can skip this section.

On a machine **without** a fingerprint reader, 1Password falls back to your account password. Because Claude Code launches all your MCP servers **at the same time**, each one hits a locked 1Password simultaneously — so on a cold start you can be asked for your password once per server (3, 4, 5+ times). This is purely the concurrency: once 1Password is unlocked, every later resolution reuses the session silently.

The fix is to resolve every secret **once, up front**, before the servers start. The `mcp-warm-secrets` command does exactly that — it reads your `.mcp.json`, resolves all `op://` references in a single prompt (one per 1Password account), and populates the cache the servers read from. It refuses to run if 1Password isn't signed in, so it can never leave a half-resolved cache.

### One-time setup

1. Install the command (puts `mcp-warm-secrets` on your PATH):
   ```bash
   npm install -g @mcp-consultant-tools/core
   ```

2. Wrap the `claude` command in your shell profile so it warms first, then launches as normal. Add **one** of these:

   **bash / zsh** — `~/.bashrc` or `~/.zshrc`:
   ```bash
   claude() { mcp-warm-secrets >/dev/null 2>&1; command claude "$@"; }
   ```

   **PowerShell** — `$PROFILE`:
   ```powershell
   function claude {
       mcp-warm-secrets | Out-Null
       & (Get-Command claude -CommandType Application).Source @args
   }
   ```

3. Reload your shell (or open a new terminal).

You keep starting Claude with `claude` exactly as before — it now silently warms 1Password first. By default `mcp-warm-secrets` reads `.mcp.json` from the current directory; to point at a specific file, change the wrapper to `mcp-warm-secrets /path/to/.mcp.json`.

> **You'll still get one prompt per fresh session.** Without biometric, 1Password must be unlocked once whenever the cache is cold (every 60 minutes). This setup turns *many* prompts into *one* — only a fingerprint reader can remove the last one.

This is entirely optional and changes nothing for anyone else: if you don't add the wrapper, behaviour is exactly as it was.

## Cache Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `MCT_SECRET_CACHE_DIR` | `~/.mcp-consultant-tools/.cache/` | Cache directory location |
| `MCT_CACHE_TTL_MINUTES` | `60` | How long resolved secrets are cached |

The cache is encrypted (AES-256-GCM) with a per-machine key. Failed resolutions are cached for 10 minutes to avoid repeated auth prompts.

## Agent Prompt: Configure a Single MCP Server with 1Password

Copy and paste this prompt to have an agent set up one MCP server with 1Password secret resolution. Replace the placeholders with your actual values.

```
Configure the MCP server `@mcp-consultant-tools/{PACKAGE_NAME}` in my .mcp.json file
(create the file if it doesn't exist).

Reference documentation for all env vars and defaults:
https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/{DOC_NAME}.md

Use 1Password secret references (op:// URIs) for all secret environment variables
instead of hardcoding them.

The 1Password item name for my credentials is: {1PASSWORD_ITEM_NAME}
1Password vault (optional — only needed if item name is not unique): {VAULT NAME OR DELETE THIS LINE}

Steps:
1. Look up the item in 1Password to find the vault and available fields:
   op item get "{1PASSWORD_ITEM_NAME}" --format json
   (If multiple items match, use --vault to disambiguate)
2. Fetch the reference documentation above to get all required environment
   variables, which ones are secrets, and their default values
3. Build the op:// reference strings for each secret field
   using the format: op://vault-name/item-name/field-name
   IMPORTANT: secret references only allow letters, numbers, spaces, hyphens,
   underscores, and periods. If the vault or item name contains any other
   character (&, /, @, #, ...), use the UUIDs from step 1 instead:
   op://<vault-uuid>/<item-uuid>/<field-name>
4. Verify each reference resolves before saving (prints nothing on success):
   op read "op://..." >/dev/null && echo "resolves OK"
5. Create or update .mcp.json with the full server configuration,
   using op:// references for secrets and sensible defaults for everything else
6. Show me the final configuration for review before saving

For the non-secret values, use these:
- {LIST ANY NON-SECRET VALUES LIKE ORG NAME, PROJECT NAME, URLS, ETC.}
```

## Agent Prompt: Upgrade an Existing .mcp.json to 1Password

Copy and paste this prompt to have an agent migrate all MCP servers in an existing `.mcp.json` from hardcoded secrets to 1Password references.

```
Update my .mcp.json file to replace all hardcoded secrets with 1Password op:// references.

Documentation for how 1Password secret resolution works:
https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/ONEPASSWORD_SECRET_RESOLUTION.md

Each MCP server's documentation (with op:// examples) is at:
https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/

For each MCP server in .mcp.json:
1. Identify which env vars contain secrets (PATs, client secrets, API keys,
   passwords, connection strings — anything that would be rotated or shouldn't
   be shared in plain text)
2. For PATs/tokens where I provide the 1Password item name: look up the item
   to find the vault and field names:
   op item get "{ITEM_NAME}" --format json
3. For app registration credentials (client_id, client_secret, tenant_id):
   search 1Password using the current hardcoded client_id value to find
   the matching entry:
   op item list --format json | python3 -c "
   import json, sys
   for item in json.load(sys.stdin):
       print(f'{item[\"vault\"][\"name\"]}/{item[\"title\"]} (id={item[\"id\"]})')
   " | head -20
   Then: op item get "{MATCHED_ITEM}" --format json
   to confirm the fields match (username=client_id, password=client_secret, etc.)
4. Build op:// references using: op://vault-name/item-name/field-name
   IMPORTANT: secret references only allow letters, numbers, spaces, hyphens,
   underscores, and periods. If the vault or item name contains any other
   character (&, /, @, #, ...), use UUIDs instead:
   op://<vault-uuid>/<item-uuid>/<field-name>
   (both UUIDs are in the op item get output: id and vault.id)
5. Verify each reference resolves before saving (prints nothing on success):
   op read "op://..." >/dev/null && echo "resolves OK"
6. Replace hardcoded secrets with op:// references
7. Keep all non-secret values (URLs, org names, feature flags) unchanged
8. Add @beta to the package tag in npx args

Standard field mapping (unless op item get shows different fields):
- client_id → username field
- client_secret → password field
- tenant_id → tenantid field (custom field)
- PAT/token → password field
- API key → credential field
- connection string → password field

Known 1Password items:
- ADO PAT: {REPLACE WITH YOUR 1PASSWORD ITEM NAME, e.g. "ADO-PAT"}
- (Add any other known items, or omit — the agent will search by client_id)

For all other MCP servers with app registration credentials, take the
hardcoded client_id value and search 1Password to find the matching entry.

After updating, list:
- All MCP servers successfully upgraded with their op:// references
- Any MCP servers where the credentials could NOT be found in 1Password
  (show the server name and the client_id that was searched for)

Show me the final .mcp.json for review before saving.
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| MCP server fails to start | Biometric prompt not approved in time | Approve faster, or increase `MCP_TIMEOUT` |
| `op: command not found` | CLI integration not enabled | 1Password > Settings > Developer > enable CLI integration |
| `Failed to resolve 1Password secret(s)` | Wrong vault/item/field name | Verify with `op item get "ItemName"` |
| `invalid character in secret reference` | Vault/item name contains an unsupported character (`&`, `/`, `@`, …) | Rename the item, or use UUIDs: `op://<vault-uuid>/<item-uuid>/<field>` |
| Target service rejects auth (e.g. `AADSTS7000215: Invalid client secret`) even though the secret in 1Password is correct | The op:// reference never resolved (often the invalid-character problem above) and the literal/stale value was used | Test the reference directly: `op read "op://..." >/dev/null && echo OK`. Fix the reference, then **restart the MCP server** — references resolve at startup |
| Several prompts at once on startup | No fingerprint reader → all servers hit a locked 1Password concurrently | See [Reducing Repeated Prompts](#reducing-repeated-prompts-machines-without-a-fingerprint-reader) |
| Repeated auth prompts | Cache expired or cleared | Normal after 60 minutes; re-authenticate |
| Works first time, fails on restart | 1Password app locked/quit | Unlock 1Password before starting Claude Code |
