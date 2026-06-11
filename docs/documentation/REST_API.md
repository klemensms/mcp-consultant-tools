# REST API

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/REST_API_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/rest-api`

MCP server for making arbitrary HTTP calls to REST APIs with automatic authentication, including OAuth2 client credentials flow for JWT token generation and optional OpenAPI/Swagger-based endpoint discovery.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it. See [PII Protection](#pii-protection-v31) below.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/rest-api@beta", "mcp-rest-api"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "PII_SESSION_SALT": "",
        "REST_BASE_URL": "https://your-api.example.com",
        "OAUTH2_TOKEN_URL": "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token",
        "OAUTH2_CLIENT_ID": "op://Work/REST-API-OAuth/username",
        "OAUTH2_CLIENT_SECRET": "op://Work/REST-API-OAuth/password",
        "OAUTH2_SCOPE": "api://your-app-id/.default",
        "OAUTH2_GRANT_TYPE": "client_credentials",
        "OAUTH2_ADDITIONAL_PARAMS": "",
        "AUTH_BEARER": "",
        "AUTH_BASIC_USERNAME": "",
        "AUTH_BASIC_PASSWORD": "",
        "AUTH_APIKEY_HEADER_NAME": "X-Api-Key",
        "AUTH_APIKEY_VALUE": "",
        "REST_OPENAPI_URL": "",
        "REST_RESPONSE_SIZE_LIMIT": "10000",
        "REST_ENABLE_SSL_VERIFY": "true",
        "REST_TIMEOUT": "30000",
        "HEADER_Accept": "application/json"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it.

```json
{
  "servers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/rest-api", "mcp-rest-api"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "PII_SESSION_SALT": "",
        "REST_BASE_URL": "https://your-api.example.com",
        "OAUTH2_TOKEN_URL": "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token",
        "OAUTH2_CLIENT_ID": "your-client-id",
        "OAUTH2_CLIENT_SECRET": "your-client-secret",
        "OAUTH2_SCOPE": "api://your-app-id/.default",
        "OAUTH2_GRANT_TYPE": "client_credentials",
        "OAUTH2_ADDITIONAL_PARAMS": "",
        "AUTH_BEARER": "",
        "AUTH_BASIC_USERNAME": "",
        "AUTH_BASIC_PASSWORD": "",
        "AUTH_APIKEY_HEADER_NAME": "X-Api-Key",
        "AUTH_APIKEY_VALUE": "",
        "REST_OPENAPI_URL": "",
        "REST_RESPONSE_SIZE_LIMIT": "10000",
        "REST_ENABLE_SSL_VERIFY": "true",
        "REST_TIMEOUT": "30000",
        "HEADER_Accept": "application/json"
      }
    }
  }
}
```

**Required:** `REST_BASE_URL`.

**Authentication priority:** OAuth2 > Static Bearer > Basic Auth > API Key. Only configure one method. OAuth2 client credentials is recommended for Azure/Entra ID; the static-bearer, basic-auth, and API-key blocks are alternatives (omit if using OAuth2).

**Custom headers:** Any environment variable prefixed with `HEADER_` is injected into every request. For example, `HEADER_Accept=application/json` sends `Accept: application/json`.

**Optional:** `REST_OPENAPI_URL` enables OpenAPI/Swagger discovery; `REST_RESPONSE_SIZE_LIMIT`, `REST_ENABLE_SSL_VERIFY`, and `REST_TIMEOUT` show their defaults above.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "rest-api": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `rest-api-guide` | Overview of available tools, authentication methods, and configuration options |
| `rest-api-troubleshoot` | Troubleshooting guide for authentication failures, connection issues, and response truncation |

## Notable Behavior

- **OAuth2 token caching:** Tokens are acquired automatically on first request and cached in memory. They refresh 5 minutes before expiration. Use `rest-refresh-token` to force an immediate cache clear.
- **Response size limiting:** Responses exceeding `REST_RESPONSE_SIZE_LIMIT` (default 10 KB) are truncated. The response includes truncation metadata indicating original vs. returned size.
- **Auth header redaction:** Authorization headers and API key headers are replaced with `[REDACTED]` in all responses. Only safe headers (`Accept`, `Content-Type`, `Cache-Control`, etc.) are shown.
- **OpenAPI discovery:** Set `REST_OPENAPI_URL` to enable `rest-list-endpoints` and `rest-get-schema` for exploring API structure without prior knowledge.
- **`REST_ENABLE_SSL_VERIFY=false`:** Disables SSL certificate verification. For development with self-signed certificates only — never use in production.
- **PII protection is opt-in:** off by default; set `PII_PROTECTION=true` to redact. There is no environment-type gate — the server starts without it. When protection is off, a stderr warning fires if `REST_BASE_URL` doesn't look like a non-prod environment.

## PII Protection (v31+)

A 4-layer redaction pipeline runs on every `RestApiService.request()` response body. Because the rest-api server is a generic HTTP fetcher (it can call arbitrary backends — DAB, custom APIs, anything that returns JSON or text), the redaction surface is identical to Azure SQL: Layers 3 (regex) and 4 (NER) do the work on every string value in the response. Layer 1 (`$select` injection) does not apply (no schema-level select against arbitrary REST endpoints), and Layer 2 (per-entity field rules) is effectively a no-op (REST has no entity types).

JSON-parsed bodies are walked as object trees. Plain-text/XML/HTML bodies (anything that fails `JSON.parse`) are scanned as strings.

This is one of four packages that performs redaction — the others are `powerplatform-data` (Dataverse query responses), `azure-devops` (work item fields and identity objects), and `azure-sql` (SQL result rows). See [pii-protection.md](pii-protection.md) for the full surface and layer-by-layer reference.

**PII protection is opt-in and off by default. Set `PII_PROTECTION=true` to enable redaction — there is no environment-type gate, and the server starts normally without it.**

| `PII_PROTECTION` | Behaviour |
|---|---|
| unset / `false` | pipeline off — raw data flows to the LLM (server starts normally) |
| `true` | redaction active on every response |

`MCP_ENVIRONMENT_TYPE` is advisory only in v32 — it no longer gates startup; it only feeds the "looks unprotected" stderr warning below. (Earlier v31 betas made both flags mandatory with a refuse-to-start gate; v32 relaxed that to pure opt-in.)

| Var | Values | Behaviour |
|-----|--------|-----------|
| `MCP_ENVIRONMENT_TYPE` | `production` \| `uat` \| `dev` | Optional, advisory only. Not a gate in v32; feeds the "looks unprotected" warning. |
| `PII_PROTECTION` | `true` \| `false` | Off by default. Set `true` to enable redaction; `false`/unset is permitted in any environment. |
| `PII_OBSERVE_MODE` | `true` \| `false` (default `false`) | When `true`, pipeline computes what it would redact but returns original data unchanged. Footer reports `(observe-mode — values not changed)`. |
| `PII_SESSION_SALT` | 64-char hex (optional; default per-process random) | Set the **same** value across every MCP server's `env:` block to share a salt so identical values tokenize identically — enabling cross-MCP "same person" correlation. Generate with `openssl rand -hex 32`. Empty/whitespace = unset (per-process random). A non-empty value must be exactly 64 hex chars or the server refuses to start. |
| `PII_CONFIG_PATH` | path to JSON file (optional) | Per-layer toggles, per-entity field rules, regex patterns, NER scan-fields. See [pii-protection.md](pii-protection.md) for the schema. |
| `PII_NONPROD_HINTS` | comma-separated substrings (optional) | Override the URL-heuristic non-prod hint list (defaults: `dev,uat,training,support,migration,sandbox,test`). Identifier checked is `REST_BASE_URL`. |

When PII protection is off (`PII_PROTECTION` unset or `false`), the loader checks `REST_BASE_URL` against the non-prod hint list. If none match, a stderr warning fires at startup. Server still starts.

See [pii-protection.md](pii-protection.md) for config schema and [PII_PROTECTION_TECHNICAL.md](../technical/PII_PROTECTION_TECHNICAL.md) for layer-by-layer reference.
