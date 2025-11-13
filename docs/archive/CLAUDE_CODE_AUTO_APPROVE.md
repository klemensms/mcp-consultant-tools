# Auto-Approving MCP Tools in Claude Code

This guide explains how to configure Claude Code to automatically approve MCP tools without requiring manual approval for every tool call.

## Problem

Unlike Claude Desktop or GitHub Copilot, Claude Code requires manual approval for each MCP tool call by default. This can be tedious when working with trusted MCP servers that you use frequently.

## Solution Overview

Claude Code uses **PreToolUse hooks** to configure auto-approval. A hook is a script that intercepts tool calls and can automatically approve them based on your criteria.

## Step 1: Create an Auto-Approval Script

Create a Python script that will automatically approve tool calls:

**File:** `auto-approve-mcp.py`

```python
#!/usr/bin/env python3
import json
import sys

try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(1)

# Auto-approve the tool call
output = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": "Auto-approved MCP Consultant Tools"
    }
}
print(json.dumps(output))
sys.exit(0)
```

**Make it executable:**

```bash
chmod +x /path/to/auto-approve-mcp.py
```

## Step 2: Configure Claude Code Hooks

Add the hook configuration to your VS Code settings.

### Option A: Workspace Settings (Recommended)

Create or edit `.vscode/settings.json` in your project:

```json
{
  "claude.hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__MCP-Test-Customisation__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.py"
          }
        ]
      }
    ]
  }
}
```

### Option B: User Settings (Global)

Open VS Code User Settings (JSON) and add:

```json
{
  "claude.hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__MCP-Test-Customisation__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.py"
          }
        ]
      }
    ]
  }
}
```

## Step 3: Reload VS Code

After saving the settings, reload the VS Code window:

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Reload Window"
3. Press Enter

## Configuration Options

### Auto-Approve All MCP Tools (All Servers)

To auto-approve tools from **all** MCP servers:

```json
{
  "claude.hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.py"
          }
        ]
      }
    ]
  }
}
```

### Auto-Approve Specific Tools Only

To auto-approve only read-only operations (e.g., query tools):

```json
{
  "claude.hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__MCP-Test-Customisation__(loganalytics-execute-query|appinsights-execute-query|sql-execute-query|get-.*)",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.py"
          }
        ]
      }
    ]
  }
}
```

### Auto-Approve Multiple MCP Servers

To configure different approval rules for different servers:

```json
{
  "claude.hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__MCP-Test-Customisation__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.py"
          }
        ]
      },
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.py"
          }
        ]
      }
    ]
  }
}
```

## Understanding MCP Tool Names

MCP tools follow this naming pattern:

```
mcp__<server-name>__<tool-name>
```

**Examples:**
- `mcp__MCP-Test-Customisation__loganalytics-execute-query`
- `mcp__MCP-Test-Customisation__get-entity-metadata`
- `mcp__memory__save`

The `matcher` field uses regex, so:
- `mcp__MCP-Test-Customisation__.*` matches all tools from `MCP-Test-Customisation` server
- `mcp__.*` matches all MCP tools from all servers
- `mcp__.*__(get-.*|list-.*)` matches all `get-*` and `list-*` tools from all servers

## Security Considerations

**Important:** Auto-approving tools bypasses Claude Code's permission system. Only auto-approve tools from trusted MCP servers.

**Recommendations:**
- Auto-approve read-only tools (queries, gets, lists)
- Manually approve write operations (create, update, delete)
- Use specific matchers instead of `mcp__.*` when possible
- Review your MCP server's tools before configuring auto-approval

## Troubleshooting

### Hook Not Working

1. **Check script path:** Ensure the path to `auto-approve-mcp.py` is absolute and correct
2. **Check permissions:** Verify the script is executable (`chmod +x`)
3. **Check syntax:** Validate JSON syntax in settings.json
4. **Reload window:** Press `Cmd+Shift+P` → "Reload Window"

### Script Errors

Test your hook script manually:

```bash
echo '{"tool":"mcp__MCP-Test-Customisation__test"}' | /path/to/auto-approve-mcp.py
```

Expected output:
```json
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "permissionDecisionReason": "Auto-approved MCP Consultant Tools"}}
```

### Still Seeing Approval Prompts

1. Check that the `matcher` regex matches your tool names
2. Verify the hook configuration is in the correct settings file
3. Check VS Code Output panel for hook errors (View → Output → Select "Claude Code")

## Alternative: Bash Script

If you prefer a bash script instead of Python:

**File:** `auto-approve-mcp.sh`

```bash
#!/bin/bash

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Auto-approved MCP Consultant Tools"
  }
}
EOF
```

Make it executable and use in settings:

```bash
chmod +x /path/to/auto-approve-mcp.sh
```

```json
{
  "claude.hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__MCP-Test-Customisation__.*",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/auto-approve-mcp.sh"
          }
        ]
      }
    ]
  }
}
```

## References

- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks.md)
- [Claude Code IAM Documentation](https://code.claude.com/docs/en/iam.md)

## Summary

With hooks configured, Claude Code will automatically approve matching MCP tools without prompting you for every call. This provides the same "always allow" experience as Claude Desktop while maintaining security through selective auto-approval rules.
