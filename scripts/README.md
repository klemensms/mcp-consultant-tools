# Scripts

This folder contains setup, deployment, and utility scripts for the project.

## Available Scripts

### setup-claude-desktop.sh
Automated setup script for configuring Claude Desktop to use this MCP server.

**What it does:**
- Locates Claude Desktop config file
- Backs up existing configuration
- Adds/updates PowerPlatform MCP server configuration
- Validates the setup

**Usage:**
```bash
# Make executable (if needed)
chmod +x scripts/setup-claude-desktop.sh

# Run the setup
./scripts/setup-claude-desktop.sh
```

**Prerequisites:**
- Claude Desktop installed
- Environment variables configured in `.env` file
- Project built (`npm run build`)

**The script will:**
1. Find your Claude Desktop config at: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Create a backup: `claude_desktop_config.json.backup`
3. Add the PowerPlatform MCP server configuration
4. Prompt you to restart Claude Desktop

**Manual Alternative:**

If you prefer to configure manually, see [../config/claude_desktop_config.sample.json](../config/claude_desktop_config.sample.json) for the configuration format.

## Creating New Scripts

When adding new scripts to this folder:

1. **Make them executable:**
   ```bash
   chmod +x scripts/your-script.sh
   ```

2. **Add a shebang:**
   ```bash
   #!/bin/bash
   ```

3. **Document in this README:**
   - What the script does
   - How to use it
   - Prerequisites
   - Example output

4. **Follow conventions:**
   - Use environment variables from `.env`
   - Provide clear error messages
   - Include validation/safety checks
