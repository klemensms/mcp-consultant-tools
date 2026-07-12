# Azure DevOps

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_DEVOPS_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-devops`

MCP server for Azure DevOps providing wiki access, work item management, pull requests, build troubleshooting, local file sync, and checklist management. Read-only by default; write operations require explicit feature flags.

> **Admin Tools:** For pipelines, service connections, agent pools, and environments, see `@mcp-consultant-tools/azure-devops-admin`.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it. See [PII Protection](#pii-protection-v31) below.

```json
{
  "servers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-devops@beta", "mcp-ado"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_PAT": "op://Work/AzureDevOps-PAT/password",
        "AZUREDEVOPS_TENANT_ID": "",
        "AZUREDEVOPS_CLIENT_ID": "",
        "AZUREDEVOPS_CLIENT_SECRET": "",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_DELETE": "false",
        "AZUREDEVOPS_ENABLE_PR_WRITE": "false",
        "AZUREDEVOPS_COMMENT_FORMAT": "markdown",
        "AZUREDEVOPS_SYNC_FOLDER": "docs/user-stories",
        "AZUREDEVOPS_SYNC_AUTO_COMMIT": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

> **PII protection (opt-in):** redaction is off by default. Set `PII_PROTECTION=true` to enable it.

Authentication: use `AZUREDEVOPS_PAT` (simple) or `AZUREDEVOPS_TENANT_ID` + `AZUREDEVOPS_CLIENT_ID` + `AZUREDEVOPS_CLIENT_SECRET` together (Entra ID app registration).

```json
{
  "servers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-devops", "mcp-ado"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_PAT": "your-personal-access-token",
        "AZUREDEVOPS_TENANT_ID": "",
        "AZUREDEVOPS_CLIENT_ID": "",
        "AZUREDEVOPS_CLIENT_SECRET": "",
        "AZUREDEVOPS_API_VERSION": "7.1",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "false",
        "AZUREDEVOPS_ENABLE_WIKI_DELETE": "false",
        "AZUREDEVOPS_ENABLE_PR_WRITE": "false",
        "AZUREDEVOPS_COMMENT_FORMAT": "markdown",
        "AZUREDEVOPS_SYNC_FOLDER": "docs/user-stories",
        "AZUREDEVOPS_SYNC_AUTO_COMMIT": "false"
      }
    }
  }
}
```

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "azure-devops": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

### Agent Prompt: Set Up Azure DevOps MCP Server with 1Password

Copy and paste this prompt to have an agent configure the full Azure DevOps MCP server with 1Password secret resolution:

```
Configure the Azure DevOps MCP server in my .mcp.json file (create the file if it doesn't exist).

Package: @mcp-consultant-tools/azure-devops@beta
Binary: mcp-ado

Reference documentation for all env vars and defaults:
https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/AZURE_DEVOPS.md

Use 1Password for the PAT instead of hardcoding it.
1Password item name for my PAT: {REPLACE WITH YOUR 1PASSWORD ITEM NAME}
1Password vault (optional — only needed if item name is not unique): {VAULT NAME OR DELETE THIS LINE}

Steps:
1. Look up the item in 1Password to find the vault and field name:
   op item get "{ITEM_NAME}" --format json
   (If multiple items match, use --vault to disambiguate)
2. Build the op:// reference for AZUREDEVOPS_PAT using: op://vault/item/field
3. Fetch the reference documentation above to get all available env vars
4. Configure .mcp.json with:
   - Organization: {REPLACE WITH YOUR ORG}
   - Projects: {REPLACE WITH YOUR PROJECTS, or * for all}
   - All env vars from the documentation, using sensible defaults
   - op:// reference for the PAT
5. Show me the final configuration for review before saving
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `wiki-search-results` | Search wiki pages and get formatted results with content snippets |
| `wiki-page-content` | Get a formatted wiki page with navigation context |
| `work-item-summary` | Get a comprehensive summary of a work item including comments |
| `work-items-query-report` | Execute a WIQL query and get results grouped by state/type |

## Notable Behavior

- **Authentication modes:** Two options are supported. PAT: set `AZUREDEVOPS_PAT`. Entra ID: set `AZUREDEVOPS_TENANT_ID`, `AZUREDEVOPS_CLIENT_ID`, and `AZUREDEVOPS_CLIENT_SECRET` together. Entra ID takes priority if both are configured. Setting only 1 or 2 of the 3 Entra ID variables throws a clear configuration error.
- **Write flag scope:** Each domain has its own flag (`AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE`, `AZUREDEVOPS_ENABLE_WIKI_WRITE`, `AZUREDEVOPS_ENABLE_PR_WRITE`). Enable only what you need.
- **Comment format:** `AZUREDEVOPS_COMMENT_FORMAT=html` auto-converts markdown to HTML for legacy organizations that do not support the markdown preview.
- **Local file sync:** The sync tools (`sync-work-item-to-file`, `sync-work-item-from-file`, etc.) write to `AZUREDEVOPS_SYNC_FOLDER` (default: `docs/user-stories`). This achieves 10-50x token reduction compared to API calls for editing workflows. Pulling is **read-only** against ADO — it never modifies the work item; HTML fields are converted to Markdown in the local file only (HTML tables become Markdown pipe tables; complex ones are flagged for you to verify against ADO).
- **Checklist extension:** Checklist tools require the `mohitbagra/workitem-checklist` Azure DevOps extension to be installed in the organization.
- **Secret values are never returned by the comparison tools.** `compare-variable-groups`, `compare-environments`, and `variable-group-summary` branch on Azure DevOps' `isSecret` flag and never read a secret's value. A variable that is secret on either side is listed by name under `secretsSkipped`; `variable-group-summary` reports secret **counts** only.
- **`compare-environments` suffixes are configurable.** By default it recognises `-dev -development -qa -uat -staging -stage -test -prod -production`. If your groups are named `billing-prd` or `billing_dev`, pass `environmentSuffixes` — otherwise nothing matches. The tool returns `unmatchedGroups` so an empty result is never mistaken for "no drift".
- **`latest-release-branch` means highest version, not most recent commit.** Azure DevOps exposes no commit date on branch refs. It sorts `release/*` by version, digit-aware, so `release/10` beats `release/9`. Branches with no digit (e.g. `release/next`) cannot be ranked and are reported under `ignoredNonVersionBranches` rather than winning.
- **PII protection is opt-in:** off by default; set `PII_PROTECTION=true` to redact. There is no environment-type gate — the server starts without it. When protection is off, a stderr warning fires if the configured `AZUREDEVOPS_ORGANIZATION` doesn't look like a non-prod environment.

## PII Protection (v31+)

A 4-layer redaction pipeline runs on every `get-work-item` and `query-work-items` response (via `WorkItemService`). This is one of three packages that performs redaction — the others are `powerplatform-data` (Dataverse query responses) and `azure-sql` (query result rows). See [pii-protection.md](pii-protection.md) for the full surface and layer-by-layer reference.

ADO identity objects (`System.AssignedTo`, `System.CreatedBy`, `System.ChangedBy`) get tokenized — `displayName` via NER, `uniqueName` via regex — and free-text fields like `System.Description`, `Microsoft.VSTS.TCM.ReproSteps`, `Microsoft.VSTS.Common.AcceptanceCriteria`, and `System.History` are scanned by default.

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
| `PII_CONFIG_PATH` | path to JSON file (optional) | Per-layer toggles, per-entity field rules, regex patterns, NER scan-fields. |
| `PII_NONPROD_HINTS` | comma-separated substrings (optional) | Override the URL-heuristic non-prod hint list (defaults: `dev,uat,training,support,migration,sandbox,test`). The identifier checked is `AZUREDEVOPS_ORGANIZATION`. |

When PII protection is off (`PII_PROTECTION` unset or `false`), the loader checks `AZUREDEVOPS_ORGANIZATION` against the non-prod hint list (the host `dev.azure.com` is intentionally excluded so it doesn't always match). If none match, a stderr warning fires at startup. Server still starts.

See [pii-protection.md](pii-protection.md) for config schema and [PII_PROTECTION_TECHNICAL.md](../technical/PII_PROTECTION_TECHNICAL.md) for layer-by-layer reference.

### Bug content is read by AI agents — do not paste raw PII into bugs

Anyone (consultant, tester, support engineer) raising a bug must understand that the bug body, repro steps, and comments **are read by AI agents** when an agent is asked to investigate or reproduce that bug. Bug content is not a private channel between humans.

**Rule for whoever writes the bug:**

- Do **not** paste raw PII into the bug — no real names, email addresses, phone numbers, postal addresses, dates of birth, or member IDs that personally identify an individual.
- Replace any such value with a **reference ID from the source system** (CRM contact GUID, member number, account ID, ticket reference). The agent can resolve those back to the underlying record via the appropriate MCP tool, with audit redaction applied at the point of fetch.
- If a screenshot is essential and contains PII, redact the PII in the image before attaching it.

**Why this matters:** raw PII in bug content currently flows through the agent's context window as-is, which means an agent can subsequently inline it into a Dataverse `query-records` filter — and filter parameters are recorded verbatim in the audit log (no redaction layer covers them; see [audit-logging.md](audit-logging.md) "Operator responsibility — filter parameters and PII"). Replacing the PII with a reference ID at the source closes that channel cleanly. ADO-side PII redaction is on the Phase C roadmap; until it ships, the operator-side rule above is what protects the chain.
