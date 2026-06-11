# Tests

This folder contains test scripts for validating the MCP server functionality.

## Test Categories

### PowerPlatform Tests
- **test-connection.js** - Basic connectivity test
- **test-plugins.js** - Plugin functionality tests
- **test-plugin-tool.js** - Plugin tool integration tests
- **test-all-plugin-tools.js** - Comprehensive plugin tool tests
- **test-large-assembly.js** - Large assembly handling tests
- **test-assemblies-debug.js** - Assembly debugging tests
- **test-list-assemblies.js** - Assembly listing tests
- **test-workflows-flows.js** - Workflow and flow tests

### Azure DevOps Tests
- **test-ado-wiki.js** - Wiki functionality tests
- **test-ado-workitems.js** - Work item functionality tests
- **test-raw-api.js** - Raw API access tests
- **test-correct-path.js** - Path handling tests

### Wiki Path Conversion Tests
- **test-wiki-fix.js** - End-to-end wiki path conversion test
- **test-auto-conversion.js** - Auto-conversion functionality test
- **test-release-002-path.js** - Release_002 specific path test
- **analyze-path-conversion.js** - Path conversion strategy analysis
- **debug-wiki-page.js** - Wiki page retrieval debugging

## Running Tests

From the project root:

```bash
# Run a specific test
node tests/test-connection.js

# Or with npm (if test scripts are defined)
npm test
```

## Test Requirements

All tests require:
- Environment variables configured in `.env` file
- Valid credentials for PowerPlatform/Azure DevOps
- Built project (`npm run build`)

See [.env.example](../.env.example) for required environment variables.
