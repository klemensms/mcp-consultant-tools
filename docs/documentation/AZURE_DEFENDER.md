# Azure Defender for Cloud

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/AZURE_DEFENDER_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/azure-defender`

MCP server for Microsoft Defender for Cloud: secure score, security assessments (recommendations), regulatory compliance, and Defender CSPM attack paths. **Every tool is read-only** — there are no write operations and no feature flags.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

The four `AZURE_*` variables are the same service-principal credentials used by `azure-management`. One service principal can serve both servers.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for the full setup guide.

```json
{
  "servers": {
    "azure-defender": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-defender@beta", "mcp-defender"],
      "env": {
        "AZURE_TENANT_ID": "op://Work/Azure-App-Registration/tenantid",
        "AZURE_CLIENT_ID": "op://Work/Azure-App-Registration/username",
        "AZURE_CLIENT_SECRET": "op://Work/Azure-App-Registration/password",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id"
      }
    }
  }
}
```

### Claude Desktop — local credentials

```json
{
  "mcpServers": {
    "azure-defender": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/azure-defender@beta", "mcp-defender"],
      "env": {
        "AZURE_TENANT_ID": "your-tenant-id",
        "AZURE_CLIENT_ID": "your-client-id",
        "AZURE_CLIENT_SECRET": "your-client-secret",
        "AZURE_SUBSCRIPTION_ID": "your-subscription-id"
      }
    }
  }
}
```

All four variables are required. Every tool is subscription-scoped, so the server refuses to run a tool without `AZURE_SUBSCRIPTION_ID` rather than failing later inside a request.

## Required Azure permissions

| Role | Scope | Purpose |
|------|-------|---------|
| `Security Reader` | Subscription | All 14 tools |

Attack paths additionally require the **Defender CSPM plan** to be enabled on the subscription (plus agentless VM scanning, or the vulnerability assessment capability on Defender for Servers). Without it, `defender-list-attack-paths` returns an empty list - it does **not** error. `defender-list-plans` reports whether that plan is on.

## Prompts

| Prompt | Purpose |
|--------|---------|
| `defender-security-posture-review` | Walk the secure score, controls, and unhealthy recommendations, then prioritise remediation |
| `defender-compliance-audit` | Audit compliance against the standards enabled on the subscription |
| `defender-attack-path-analysis` | Investigate CSPM attack paths and order fixes by how many paths each breaks |

## Notable behavior

**An empty attack-path list is not a clean bill of health, and `defender-list-plans` is how you check.** Attack paths and assessment `risk` objects only exist when the Defender CSPM plan is enabled, and `defender-list-attack-paths` returns `[]` whether the plan is off or the estate is clean. Run `defender-list-plans` and read `summary.cspmEnabled`: `true` means an empty result is a finding about the estate, `false` means it is explained by the configuration, and `null` means the plan was absent from the response so the answer is unknown rather than "off". `summary.note` states the reading in a sentence you can quote.

**`defender-list-alerts` filters after fetching, so read both counts.** The ARM operation accepts no server-side filter, so `status` and `severity` are applied to the rows once they arrive: `summary.matchedOf` is what came back and `summary.total` is what matched, with `summary.note` naming the shortfall. Without that pair, a filter that matched nothing looks exactly like a subscription with no alerts. `maxResults` bounds the fetch and therefore runs *before* the filter, so a filtered call with `truncated: true` may be hiding matches beyond the limit - raise it for a filtered total. `summary.topEntities` names any resource carrying more than one alert, which is usually the actual finding: 25 alerts on one domain controller and 25 across 25 machines are the same count and a different incident. Note that alert severity has no `Critical` - it stops at `High`, unlike assessment severity.

**A path with no risk level is unrated, not low risk.** Attack paths arrive in two shapes depending on the tenant, and both are read. When a path's payload names no risk level under either shape it is counted in `summary.riskLevelNotReported`, bucketed as `NotReported`, and `summary.note` says so; the CLI prints "not reported by the API". Report those paths as unrated.

**An empty compliance-standards list means none are enabled**, not that the subscription is compliant. Standards must be switched on in Defender for Cloud's regulatory compliance settings before they appear.

**`defender-list-assessments` reads two sources, because neither is complete.** The ARM list only covers assessments on resources inside the subscription, so the identity and RBAC recommendations (disabled accounts with owner permissions, guest accounts with write permissions, overprovisioned identities) are invisible to it; those come from Azure Resource Graph. Resource Graph in turn returns nothing on a subscription with no paid Defender plan, where ARM still returns data. `summary.sources` says what each contributed, and `summary.note` appears whenever the list is known to be incomplete, including when Resource Graph could not be read at all. Do not report `summary.total` without reading `note`.

**`truncated: true` means the counts are a lower bound.** The list tools accept `maxResults`; when more rows matched than were returned, the response sets `truncated: true` and every count in `summary` covers only the returned rows. Omit `maxResults` for subscription-wide totals.

**Compliance percentage excludes skipped and unsupported controls.** `compliancePercentage` is `passed / (passed + failed)`, matching the Azure portal — so it will not equal `passedControls / totalControls`.

**`averageScorePercentage` is not the secure score.** `defender-list-score-controls` returns an *unweighted* mean across controls; controls carry a `weight`. Use `defender-get-secure-score` for the actual score.

**Severity includes `Critical`.** This package pins the `2025-05-04` assessments API. The older `2020-01-01` version cannot express a Critical severity at all — its enum stops at High.

## Reference

See [`docs/technical/AZURE_DEFENDER_TECHNICAL.md`](../technical/AZURE_DEFENDER_TECHNICAL.md) for the full tool reference, CLI commands, and implementation details.
