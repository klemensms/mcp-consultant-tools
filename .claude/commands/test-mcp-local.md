TEST LOCAL MCP CHANGES

Use this command to test MCP server changes locally before asking the user to reconnect.

## Quick Start

Spawn the `mcp-local-tester` agent to test your changes:

```
Use the Task tool with subagent_type="mcp-local-tester" and provide:
- Which package was modified
- Which tool(s) to test
- Test arguments to use
```

## Manual Testing (Alternative)

If you need to test manually:

### 1. Build the Package
```bash
npm run build --workspace=packages/{PACKAGE_NAME}
```

### 2. Run the Test Script
```bash
cd /path/to/mcp-consultant-tools

MCP_TEST_PACKAGE="./packages/{PACKAGE}/build/index.js" \
MCP_TEST_TOOL="{TOOL_NAME}" \
MCP_TEST_ARGS='{"param": "value"}' \
node .claude/templates/mcp-test-runner.mjs
```

### 3. Interpret Results
- Exit code 0 = PASS - ready for user to reconnect
- Exit code 1 = FAIL - fix the issue before asking user to reconnect

## Common Test Configurations

### PowerPlatform Data
```bash
MCP_TEST_PACKAGE="./packages/powerplatform-data/build/index.js" \
MCP_TEST_TOOL="query-records" \
MCP_TEST_ARGS='{"entityNamePlural":"accounts","filter":"name ne null","maxRecords":1,"select":["name","accountid"]}' \
node .claude/templates/mcp-test-runner.mjs
```

### Azure DevOps
```bash
MCP_TEST_PACKAGE="./packages/azure-devops/build/index.js" \
MCP_TEST_TOOL="list-projects" \
MCP_TEST_ARGS='{}' \
node .claude/templates/mcp-test-runner.mjs
```

### PowerPlatform (Read-Only)
```bash
MCP_TEST_PACKAGE="./packages/powerplatform/build/index.js" \
MCP_TEST_TOOL="get-entity-metadata" \
MCP_TEST_ARGS='{"entityLogicalName":"account"}' \
node .claude/templates/mcp-test-runner.mjs
```

## Important

- **NEVER ask user to reconnect until tests pass**
- Tests use the same environment variables as your current session
- All output goes to stderr (stdout is reserved for MCP protocol)
- Test scripts are stored in `.claude/templates/` (not gitignored)
