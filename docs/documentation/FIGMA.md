# Figma

<!-- Agent: For complete tool reference, parameters, examples, troubleshooting,
     and implementation details, see docs/technical/FIGMA_TECHNICAL.md -->

**Package:** `@mcp-consultant-tools/figma`

MCP server that extracts design data from Figma files and FigJam boards, transforming complex Figma API responses into simplified, AI-friendly JSON format.

## Tools

| Tool | Description |
|------|-------------|
| `get-figma-data` | Get comprehensive design data (layout, text, styles, components) for a file or specific nodes |
| `get-figma-semantic` | Extract diff-friendly semantic data from FigJam boards, discarding positional/visual noise |
| `extract-ado-stories` | Extract ADO User Story components from a FigJam board/section as structured data |
| `download-figma-images` | Download rendered node images to local disk as PNG/SVG/JPG/PDF |

## Configuration

Add the server to your MCP client. **VS Code** uses `.vscode/mcp.json` with a top-level `servers` key; **Claude Desktop** uses `claude_desktop_config.json` with a top-level `mcpServers` key. The `command`, `args`, and `env` are identical in both — only the wrapper key and the file differ.

### VS Code — recommended (1Password)

Credentials are resolved at runtime via biometric authentication — no secrets stored in config files. Requires the [1Password desktop app](https://1password.com/downloads) with CLI integration enabled (Settings > Developer > "Integrate with 1Password CLI"). See [1Password Secret Resolution](ONEPASSWORD_SECRET_RESOLUTION.md) for full setup guide.

```json
{
  "servers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma@beta", "mcp-figma"],
      "env": {
        "FIGMA_API_KEY": "op://Work/Figma-API-Key/credential",
        "FIGMA_USE_OAUTH": "false",
        "MCP_CONTEXT_SAFE_RESPONSE": "true",
        "MCP_RESPONSE_SIZE_THRESHOLD": "1000"
      }
    }
  }
}
```

### VS Code — alternative (local credentials)

```json
{
  "servers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma", "mcp-figma"],
      "env": {
        "FIGMA_API_KEY": "your-personal-access-token",
        "FIGMA_USE_OAUTH": "false",
        "MCP_CONTEXT_SAFE_RESPONSE": "true",
        "MCP_RESPONSE_SIZE_THRESHOLD": "1000"
      }
    }
  }
}
```

**Authentication:** provide either `FIGMA_API_KEY` (personal access token) or `FIGMA_OAUTH_TOKEN`, not both.

**Context window management (recommended for Figma — responses are 20-200KB):**
- `MCP_CONTEXT_SAFE_RESPONSE` — real default `false`. Set to `true` (recommended for Figma) to offload large responses to disk and return a summary instead.
- `MCP_RESPONSE_SIZE_THRESHOLD` — real default `5000` (bytes); `1000` recommended for Figma so more responses are offloaded.

### Claude Desktop

Use the same `env` block, but wrap it in `mcpServers` instead of `servers`, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "figma": { "command": "npx", "args": ["..."], "env": { "...": "..." } } } }
```

## Notable Behavior

- **Context-safe responses:** When `MCP_CONTEXT_SAFE_RESPONSE=true`, large responses (over the threshold in bytes) are saved to `.context/.mcp-figma-cache/` and a summary with the file path is returned instead. Each tool also accepts `returnFullResponse: true` to force full inline data.
- **Optimization defaults:** `get-figma-data` applies several optimizations by default (style stripping, table conversion, connector simplification, component simplification). These can be individually disabled per call.
- **FigJam sticky color categorization:** `get-figma-semantic` classifies sticky notes by HSL hue into fixed categories (blocker, tbd, investigation, done, info, note). Use `stickyColorOverrides` to remap specific hex colors to different categories.
- **ADO story extraction:** `extract-ado-stories` filters out placeholder components (those with "ADO xxxxx" in the name) by default. Set `includePlaceholders: true` to include them.
