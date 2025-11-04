#!/bin/bash

CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

echo "================================================"
echo "Claude Desktop MCP Configuration Helper"
echo "================================================"
echo ""

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚠️  Config file not found at:"
    echo "   $CONFIG_FILE"
    echo ""
    echo "Creating config file..."
    mkdir -p "$(dirname "$CONFIG_FILE")"
    echo '{"mcpServers":{}}' > "$CONFIG_FILE"
    echo "✓ Created empty config file"
    echo ""
fi

echo "Current config file location:"
echo "  $CONFIG_FILE"
echo ""

# Read current config
echo "Current configuration:"
echo "---"
cat "$CONFIG_FILE" | python3 -m json.tool 2>/dev/null || cat "$CONFIG_FILE"
echo "---"
echo ""

# Check if .env file exists
if [ -f ".env" ]; then
    echo "✓ Found .env file in current directory"
    echo ""
    echo "Environment variables from .env file:"
    echo "---"
    grep -v '^#' .env | grep -v '^$' | while IFS= read -r line; do
        echo "  $line"
    done
    echo "---"
    echo ""
else
    echo "⚠️  No .env file found in current directory"
    echo "   Create one first with your configuration values"
    echo ""
fi

echo "================================================"
echo "Next Steps:"
echo "================================================"
echo ""
echo "1. Open the config file in your editor:"
echo "   code \"$CONFIG_FILE\""
echo "   OR"
echo "   open -a TextEdit \"$CONFIG_FILE\""
echo ""
echo "2. Add this configuration (replace with your values):"
echo ""
cat << 'EOF'
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "npx",
      "args": ["-y", "mcp-consultant-tools"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "AZUREDEVOPS_ORGANIZATION": "your-org",
        "AZUREDEVOPS_PAT": "your-pat-token",
        "AZUREDEVOPS_PROJECTS": "Project1,Project2",
        "AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE": "true",
        "AZUREDEVOPS_ENABLE_WIKI_WRITE": "true"
      }
    }
  }
}
EOF
echo ""
echo "3. Save the file"
echo ""
echo "4. RESTART Claude Desktop (completely quit and reopen)"
echo ""
echo "5. Test by asking Claude to use the PowerPlatform MCP"
echo ""
echo "================================================"
echo ""
echo "Want to open the config file now? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    if command -v code &> /dev/null; then
        code "$CONFIG_FILE"
    else
        open -a TextEdit "$CONFIG_FILE"
    fi
    echo "✓ Opened config file"
else
    echo "You can open it manually later with:"
    echo "  open -a TextEdit \"$CONFIG_FILE\""
fi
echo ""
