# Code Review

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/CODE_REVIEW_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/code-review`

Provider-agnostic repository code review across **Azure DevOps** and **GitHub Enterprise**: .NET target-framework end-of-life scanning, NuGet package auditing (against the public NuGet API), a cyclomatic-complexity **estimate**, and a GitHub Packages inventory. **Every tool is read-only** — it shallow-clones a repo into a temp directory, analyses it, and deletes it.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key.

`CODE_REVIEW_PROVIDER` selects the source and its auth mode: `azure-devops` (PAT **or** an Entra service principal), `github-enterprise` (PAT), or `github-app` (installation token). Set only the variables for your chosen provider. NuGet lookups use the public nuget.org API and need no credential.

For `azure-devops`, `CODE_REVIEW_AZDO_AUTH_METHOD` picks the credential: `pat` (the default when the variable is absent) or `entra-id`, which authenticates as a service principal with the same client ID / secret / tenant ID used elsewhere. Prefer `entra-id` for unattended or scheduled runs — a PAT is issued against a person and expires on a fixed schedule.

```json
{
  "servers": {
    "code-review": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/code-review@beta", "mcp-code-review"],
      "env": {
        "CODE_REVIEW_PROVIDER": "azure-devops",
        "CODE_REVIEW_AZDO_ORGANIZATION": "your-azdo-organization",
        "CODE_REVIEW_AZDO_PROJECT": "MyProject",
        "CODE_REVIEW_AZDO_AUTH_METHOD": "pat",
        "CODE_REVIEW_AZDO_PAT": "your-azure-devops-pat",

        "CODE_REVIEW_AZDO_CLIENT_ID": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "CODE_REVIEW_AZDO_CLIENT_SECRET": "your-client-secret",
        "CODE_REVIEW_AZDO_TENANT_ID": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",

        "CODE_REVIEW_GHE_BASE_URL": "https://your-ghe-host",
        "CODE_REVIEW_GHE_TOKEN": "your-ghe-pat",

        "CODE_REVIEW_GHE_APP_ID": "your-github-app-id",
        "CODE_REVIEW_GHE_INSTALLATION_ID": "your-github-app-installation-id",
        "CODE_REVIEW_GHE_PRIVATE_KEY_PATH": "/path/to/github-app-private-key.pem",

        "CODE_REVIEW_ALLOWED_REPOSITORIES": ""
      }
    }
  }
}
```

Only the variables for the selected `CODE_REVIEW_PROVIDER` are required — and for `azure-devops`, only those for the selected `CODE_REVIEW_AZDO_AUTH_METHOD`: set either `CODE_REVIEW_AZDO_PAT`, or the client ID / secret / tenant ID trio, not both. `CODE_REVIEW_ALLOWED_REPOSITORIES` is an optional comma-separated allowlist that scopes every clone/list. For `github-app` you may inline the key as `CODE_REVIEW_GHE_PRIVATE_KEY` (with `\n` newlines) instead of a path.

**`entra-id` has a prerequisite you cannot satisfy from config:** the service principal must be a member of the Azure DevOps organisation. Azure DevOps issues and accepts the token regardless, then rejects the *identity* with `401 TF401444` — the server maps that to a named error carrying the principal's object id. An organisation administrator adds it under **Organization settings > Users**, then grants it access to the project.

## Prompts

| Prompt | Purpose |
|--------|---------|
| `cr-code-review` | Review a repository's technical health and summarise the critical actions |
| `cr-nuget-audit` | Audit a repository's NuGet packages for vulnerabilities and outdated versions |

## Notable behavior

**.NET EOL status is computed from published dates, so it never goes stale.** A framework flips to end-of-life the moment its real Microsoft end-of-support date passes — the tool does not carry a hand-maintained "is EOL" flag. .NET Framework 4.7.x/4.8/4.8.1 have no fixed framework-level EOL (their support is tied to the host OS) and are not flagged.

**Cyclomatic complexity is an estimate, not an exact measurement.** It is a regex-based decision-point count, not an AST parse, so a `case`/operator inside a string or a C# nullable type can nudge the number. Reports label it as an estimate; treat the values as approximate.

**NuGet vulnerabilities are matched to the referenced version.** `cr-check-nuget` reports vulnerabilities affecting the version your project actually references, not every version the package ever had. "Latest stable" excludes pre-release versions.

**The GitHub Packages tools need a GitHub Enterprise PAT.** `cr-packages`, `cr-package-versions`, and `cr-latest-package-version` work only with `CODE_REVIEW_PROVIDER=github-enterprise` and a classic PAT that has `read:packages`. GitHub Apps cannot authenticate to the Packages API (they receive 403), and Azure DevOps has no equivalent — the tools say so rather than failing obscurely.

**Lists report truncation honestly.** Repository, package, and version listings follow the GitHub `Link` header; if a paging cap is reached, `truncated: true` tells you more results exist.

## Reference

See [`docs/technical/CODE_REVIEW_TECHNICAL.md`](../technical/CODE_REVIEW_TECHNICAL.md) for the full tool reference, provider matrix, known limitations, and troubleshooting.
