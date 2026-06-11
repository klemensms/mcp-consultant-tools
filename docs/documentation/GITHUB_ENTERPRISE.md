# GitHub Enterprise

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/GITHUB_ENTERPRISE_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/github-enterprise`

MCP server for GitHub Enterprise Cloud — repositories, branches, commits, pull requests, and code search via the GitHub REST API v3.

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "github-enterprise": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/github-enterprise@beta", "mcp-ghe"],
      "env": {
        "GHE_TOKEN": "op://Work/GitHub-Enterprise-Token/credential",
        "GHE_REPOS": "[{\"id\":\"plugin-core\",\"owner\":\"your-org\",\"repo\":\"PluginCore\",\"defaultBranch\":\"release/9.0\",\"active\":true}]",
        "GHE_BASE_URL": "https://github.com",
        "GHE_API_VERSION": "2022-11-28",
        "GHE_ENABLE_CACHE": "true",
        "GHE_CACHE_TTL": "300",
        "GHE_MAX_FILE_SIZE": "1048576",
        "GHE_MAX_SEARCH_RESULTS": "100",
        "GHE_ENABLE_WRITE": "false",
        "GHE_ENABLE_CREATE": "false",
        "GHE_ENABLE_PR_WRITE": "false"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "github-enterprise": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/github-enterprise", "mcp-ghe"],
      "env": {
        "GHE_TOKEN": "your-personal-access-token",
        "GHE_REPOS": "[{\"id\":\"plugin-core\",\"owner\":\"your-org\",\"repo\":\"PluginCore\",\"defaultBranch\":\"release/9.0\",\"active\":true}]",
        "GHE_BASE_URL": "https://github.com",
        "GHE_API_VERSION": "2022-11-28",
        "GHE_ENABLE_CACHE": "true",
        "GHE_CACHE_TTL": "300",
        "GHE_MAX_FILE_SIZE": "1048576",
        "GHE_MAX_SEARCH_RESULTS": "100",
        "GHE_ENABLE_WRITE": "false",
        "GHE_ENABLE_CREATE": "false",
        "GHE_ENABLE_PR_WRITE": "false"
      }
    }
  }
}
```

`GHE_REPOS` is a JSON array. Each entry requires `id`, `owner`, `repo`, and `active`. `defaultBranch` and `description` are optional. Only repos with `"active": true` are accessible.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "github-enterprise": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `ghe-repo-overview` | Repository overview with branches and recent commits |
| `ghe-code-search-report` | Formatted code search results across repositories |
| `ghe-branch-comparison-report` | Branch diff with auto-generated deployment checklist |
| `ghe-troubleshooting-guide` | Bug investigation report correlating source code and commits |
| `ghe-deployment-report` | Deployment-ready report with rollback plan |

## Notable Behavior

- **Feature flags control write access.** All write operations are disabled by default. Set `GHE_ENABLE_WRITE=true` for file updates, `GHE_ENABLE_CREATE=true` for branch/file/PR creation, and `GHE_ENABLE_PR_WRITE=true` for PR reviews, comments, and merges. The tool count changes based on which flags are enabled (22 base + up to 15 additional write tools).
- **Branch auto-detection.** When no branch is specified, the server picks the highest-versioned `release/X.Y` branch, then falls back to `main`/`master`. The response includes the selected branch name and confidence level so you always know which branch was used.
- **Response caching.** API responses are cached in memory (default TTL: 5 minutes). After pushing code changes, use `ghe-clear-cache` before querying updated files or commits.
- **GHE vs GitHub.com.** For self-hosted GitHub Enterprise Server, set `GHE_BASE_URL` to your instance URL (e.g., `https://github.yourcompany.com`). Leave it at the default `https://github.com` for GitHub.com/GitHub Enterprise Cloud.
