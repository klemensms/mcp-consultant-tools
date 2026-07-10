# Microsoft Entra ID

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/ENTRA_ID_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/entra-id`

MCP server for auditing Microsoft Entra ID app registrations: which client secrets and certificates are expiring or already expired, and what each app registration is permitted to do. **Every tool is read-only** — there are no write operations and no feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

The `ENTRA_ID_*` variables are deliberately distinct from the shared `AZURE_*` service-principal block used by `azure-management` and `azure-defender`. Those two need subscription RBAC roles (`Reader`, `Security Reader`); this server needs a **Microsoft Graph directory permission** instead, so the app registration behind it is usually a different one. There is no subscription ID here.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for the full setup guide.

```json
{
  "servers": {
    "entra-id": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/entra-id@beta", "mcp-entra"],
      "env": {
        "ENTRA_ID_TENANT_ID": "op://Work/Entra-App-Registration/tenantid",
        "ENTRA_ID_CLIENT_ID": "op://Work/Entra-App-Registration/username",
        "ENTRA_ID_CLIENT_SECRET": "op://Work/Entra-App-Registration/password"
      }
    }
  }
}
```

### Claude Desktop — local credentials

```json
{
  "mcpServers": {
    "entra-id": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/entra-id@beta", "mcp-entra"],
      "env": {
        "ENTRA_ID_TENANT_ID": "your-tenant-id",
        "ENTRA_ID_CLIENT_ID": "your-client-id",
        "ENTRA_ID_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

All three variables are required.

## Required Graph permissions

| Permission | Type | Purpose |
|------------|------|---------|
| `Application.Read.All` | Application | Both tools, including reading credential collections |

Grant it as an **application** permission with admin consent — this server authenticates with client credentials and has no signed-in user. `Application.Read.All` is the least-privileged option; there is no narrower one. It also covers the `servicePrincipals` read used to turn API-permission GUIDs into names.

## Prompts

| Prompt | Purpose |
|--------|---------|
| `entra-credential-expiry-audit` | Find expired and expiring secrets and certificates, and report what needs rotating |
| `entra-app-permission-review` | Review API permissions across app registrations, focusing on over-broad application-type grants |

## Notable behavior

**An empty result is not proof that nothing in the tenant is expiring.** These tools read credentials on the **app registration**. A service principal (enterprise application) carries its own, separate `passwordCredentials` and `keyCredentials` collections in Microsoft Graph, and those are **not scanned**. Credentials added with `Add-MgServicePrincipalPassword`, or held by a managed identity with no backing app registration, will not appear here.

**Filters cover certificates, not just secrets.** `expiring-credentials` matches an app whose only credential is an expiring certificate, and such an app does **not** match `no-credentials`. Pass `credentialType: "secret"` to narrow a filter to client secrets only.

**`expiryDays` sets the status, not just the filter.** It defaults to 30 and drives the `status` on every credential in the response, so a credential reported as `expiring` is always consistent with the filter that selected it.

**Every filter scans the whole tenant.** Microsoft Graph cannot filter `/applications` by credential expiry, nor by a display-name substring. Filtering therefore happens after the full list is fetched, and `maxResults` trims afterwards. When `truncated` is `true`, `maxResults` cut the list and the counts describe only the rows returned; omit `maxResults` for tenant-wide totals.

**Secret values are never returned.** Microsoft Graph exposes a secret's value only in the response to the call that created it. This server can show you a secret's `displayName`, `keyId`, dates and a three-character `hint` — never the secret itself.

**An unresolved API permission is reported, not hidden.** Permissions are GUIDs; they are resolved to names via the resource's service principal. Where that lookup fails, the permission is returned with `unresolved: true` and the raw GUID as its name rather than being dropped or guessed at.

## Reference

See [`docs/technical/ENTRA_ID_TECHNICAL.md`](../technical/ENTRA_ID_TECHNICAL.md) for the full tool reference, Graph query contract, and troubleshooting.
