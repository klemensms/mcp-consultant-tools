/**
 * SOURCE OF TRUTH: mcp-consultant-tools/.claude/templates/mcp-test-runner.mjs
 *
 * MCP Local Test Runner
 *
 * Tests an MCP server by spawning it as a subprocess and calling tools directly.
 * Used by the mcp-local-tester agent to validate changes before user reconnection.
 *
 * Environment Variables:
 *   MCP_TEST_PACKAGE - Path to the MCP server entry point (required)
 *   MCP_TEST_TOOL    - Name of the tool to test (required)
 *   MCP_TEST_ARGS    - JSON string of tool arguments (optional, default: {})
 *   MCP_TEST_ENV_*   - Additional env vars to pass to the server (optional)
 *   MCP_TEST_MODE    - `fake` or `live`. Default: `fake` for the Dataverse servers
 *                      (packages/powerplatform*), `live` for everything else.
 *                      Fake mode starts a fake Dataverse on 127.0.0.1 (fake-dataverse.mjs),
 *                      points the server at it with a fixed fake token, and turns PII
 *                      protection on. Live mode uses whatever env you pass; for Dataverse
 *                      that is the safe test environment only.
 *   MCP_TEST_EXPECT_ERROR - Regex. The run passes only if the tool returns an error whose
 *                      text matches (for refusal tests). Without it, any tool error fails.
 *   MCP_TEST_EXPECT_TOOLS - Comma-separated tool names. The run fails unless the server
 *                      lists exactly these tools.
 *   MCP_TEST_ALLOW_WRITES - `1` to allow write requests in fake mode. Otherwise any request
 *                      other than GET to the fake fails the run.
 *   MCP_TEST_PII     - `off` to run fake mode without PII protection and without the
 *                      planted-value check.
 *   MCP_TEST_EXPECT_NO_REQUESTS - `1`: fake mode fails if the server made any request
 *                      (for refusals that must happen before anything is sent).
 *
 * Fake mode always fails on a request without the fake token, and on any 404 or 500
 * from the fake, even when an error was expected: those are gaps in the fake, not
 * the behaviour under test.
 *
 * Usage:
 *   MCP_TEST_PACKAGE="./packages/powerplatform-data/build/index.js" \
 *   MCP_TEST_TOOL="query-records" \
 *   MCP_TEST_ARGS='{"entityNamePlural":"accounts","filter":"name ne null","maxRecords":1}' \
 *   node .claude/templates/mcp-test-runner.mjs
 *
 * Exit Codes:
 *   0 - Test passed
 *   1 - Test failed (tool error, connection error, validation failure, or in fake
 *       mode an unexpected write or a planted personal value in the output)
 *
 * The last line on stderr is always `[RESULT] PASS` or `[RESULT] FAIL`.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { startFakeDataverse, PLANTED_VALUES } from './fake-dataverse.mjs';

/** Stop with the standard last line, whatever went wrong. */
function failEarly(message) {
  console.error(`[ERROR] ${message}`);
  console.error('[RESULT] FAIL');
  process.exit(1);
}

// Configuration from environment
const PACKAGE_PATH = process.env.MCP_TEST_PACKAGE;
const TOOL_NAME = process.env.MCP_TEST_TOOL;
let TOOL_ARGS = {};
try {
  TOOL_ARGS = process.env.MCP_TEST_ARGS ? JSON.parse(process.env.MCP_TEST_ARGS) : {};
} catch (error) {
  failEarly(`MCP_TEST_ARGS is not valid JSON: ${error.message}`);
}
const TIMEOUT_MS = parseInt(process.env.MCP_TEST_TIMEOUT || '30000', 10);
const IS_DATAVERSE = /(^|\/)packages\/powerplatform(-data|-customization)?\/build\//.test(PACKAGE_PATH ?? '');
const MODE = process.env.MCP_TEST_MODE || (IS_DATAVERSE ? 'fake' : 'live');
let EXPECT_ERROR = null;
try {
  EXPECT_ERROR = process.env.MCP_TEST_EXPECT_ERROR ? new RegExp(process.env.MCP_TEST_EXPECT_ERROR) : null;
} catch (error) {
  failEarly(`MCP_TEST_EXPECT_ERROR is not a valid regex: ${error.message}`);
}
const EXPECT_NO_REQUESTS = process.env.MCP_TEST_EXPECT_NO_REQUESTS === '1';
const EXPECT_TOOLS = process.env.MCP_TEST_EXPECT_TOOLS?.split(',').map(t => t.trim()).filter(Boolean);
const ALLOW_WRITES = process.env.MCP_TEST_ALLOW_WRITES === '1';
const PII_ON = process.env.MCP_TEST_PII !== 'off';

// Validation
if (!PACKAGE_PATH) {
  failEarly('MCP_TEST_PACKAGE is required, e.g. MCP_TEST_PACKAGE="./packages/pkg/build/index.js" MCP_TEST_TOOL="tool-name"');
}
if (!TOOL_NAME) {
  failEarly('MCP_TEST_TOOL is required');
}
if (MODE === 'fake' && !IS_DATAVERSE) {
  failEarly('Fake mode exists for the Dataverse servers only so far. Use MCP_TEST_MODE=live.');
}

/**
 * Fake mode relies on the server's powerplatform-core honouring
 * MCP_POWERPLATFORM_FAKE_SERVICE. A stale build or a registry copy without it
 * would fall back to a real browser sign-in, so refuse to start instead.
 */
if (MODE === 'fake') {
  // Same lookup order as Node: the nearest node_modules above the server wins.
  let authSource = '';
  for (let dir = dirname(resolve(PACKAGE_PATH)); ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', '@mcp-consultant-tools', 'powerplatform-core', 'build', 'auth', 'index.js');
    if (existsSync(candidate)) {
      authSource = readFileSync(candidate, 'utf8');
      break;
    }
    if (dirname(dir) === dir) failEarly("Cannot find the server's powerplatform-core build in any node_modules above it.");
  }
  if (!authSource.includes('MCP_POWERPLATFORM_FAKE_SERVICE')) {
    failEarly('The powerplatform-core build this server loads has no fake-service switch. Rebuild packages/powerplatform-core (or the server would try a real sign-in).');
  }
}

// Collect additional env vars to pass to server (MCP_TEST_ENV_*)
const serverEnv = { ...process.env };
delete serverEnv.MCP_TEST_PACKAGE;
delete serverEnv.MCP_TEST_TOOL;
delete serverEnv.MCP_TEST_ARGS;
for (const key of Object.keys(serverEnv)) {
  if (key.startsWith('MCP_TEST_')) delete serverEnv[key];
}

async function runTest() {
  let fake = null;
  if (MODE === 'fake') {
    fake = await startFakeDataverse();
    Object.assign(serverEnv, {
      POWERPLATFORM_URL: fake.url,
      POWERPLATFORM_CLIENT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      POWERPLATFORM_TENANT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      MCP_POWERPLATFORM_FAKE_SERVICE: '1',
    });
    delete serverEnv.POWERPLATFORM_CLIENT_SECRET;
    if (PII_ON) serverEnv.PII_PROTECTION = 'true';
    else delete serverEnv.PII_PROTECTION;
  }

  console.error('═'.repeat(60));
  console.error('[MCP LOCAL TESTER]');
  console.error('═'.repeat(60));
  console.error(`Package:  ${PACKAGE_PATH}`);
  console.error(`Tool:     ${TOOL_NAME}`);
  console.error(`Args:     ${JSON.stringify(TOOL_ARGS)}`);
  console.error(`Timeout:  ${TIMEOUT_MS}ms`);
  console.error(`Mode:     ${MODE}${fake ? ` (fake Dataverse at ${fake.url}, PII protection ${PII_ON ? 'on' : 'off'})` : ''}`);
  console.error('─'.repeat(60));

  const transport = new StdioClientTransport({
    command: 'node',
    args: [PACKAGE_PATH],
    env: serverEnv
  });

  const client = new Client({
    name: 'mcp-local-tester',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  // Timeout handler
  const timeoutId = setTimeout(() => {
    console.error(`[FAIL] Test timed out after ${TIMEOUT_MS}ms`);
    console.error('[RESULT] FAIL');
    process.exit(1);
  }, TIMEOUT_MS);

  let exitCode = 0;

  try {
    // Connect
    console.error('[STEP 1/4] Connecting to MCP server...');
    await client.connect(transport);
    console.error('[STEP 1/4] ✓ Connected');

    // List tools
    console.error('[STEP 2/4] Fetching tool list...');
    const tools = await client.listTools();
    console.error(`[STEP 2/4] ✓ Server has ${tools.tools.length} tools`);
    if (EXPECT_TOOLS) {
      const listed = tools.tools.map(t => t.name).sort();
      const expected = [...EXPECT_TOOLS].sort();
      const missing = expected.filter(t => !listed.includes(t));
      const extra = listed.filter(t => !expected.includes(t));
      if (missing.length || extra.length) {
        console.error(`[STEP 2/4] ✗ Tool list differs. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${extra.join(', ') || 'none'}`);
        exitCode = 1;
      } else {
        console.error('[STEP 2/4] ✓ Tool list matches MCP_TEST_EXPECT_TOOLS');
      }
    }

    // Verify tool exists
    console.error(`[STEP 3/4] Verifying tool '${TOOL_NAME}' exists...`);
    const tool = tools.tools.find(t => t.name === TOOL_NAME);
    if (!tool) {
      console.error(`[STEP 3/4] ✗ Tool '${TOOL_NAME}' NOT FOUND`);
      console.error('[INFO] Available tools:');
      tools.tools.forEach(t => console.error(`  - ${t.name}`));
      console.error('[RESULT] FAIL');
      process.exit(1);
    }
    console.error(`[STEP 3/4] ✓ Tool found: ${tool.description?.substring(0, 80) || '(no description)'}`);

    // Call tool
    console.error(`[STEP 4/4] Calling tool...`);
    const startTime = Date.now();
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: TOOL_ARGS
    });
    const duration = Date.now() - startTime;

    // Process result
    const text = (result.content ?? []).map(c => c.text ?? JSON.stringify(c)).join('\n');
    const preview = text.length > 1000 ? text.substring(0, 1000) + `\n... (${text.length - 1000} more chars)` : text;

    if (result.isError && EXPECT_ERROR) {
      if (EXPECT_ERROR.test(text)) {
        console.error(`[STEP 4/4] ✓ Tool returned the expected error (${duration}ms)`);
      } else {
        console.error(`[STEP 4/4] ✗ Tool returned an error that does not match ${EXPECT_ERROR} (${duration}ms)`);
        exitCode = 1;
      }
    } else if (result.isError) {
      console.error(`[STEP 4/4] ✗ Tool returned error (${duration}ms)`);
      exitCode = 1;
    } else if (EXPECT_ERROR) {
      console.error(`[STEP 4/4] ✗ Expected an error matching ${EXPECT_ERROR}, but the call succeeded (${duration}ms)`);
      exitCode = 1;
    } else {
      console.error(`[STEP 4/4] ✓ Tool call succeeded (${duration}ms)`);
    }
    console.error('─'.repeat(60));
    console.error('[RESPONSE PREVIEW]');
    console.error(preview);

    if (fake) {
      console.error('─'.repeat(60));
      console.error(`[FAKE] ${fake.requests.length} request(s) to the fake Dataverse:`);
      fake.requests.forEach(r => console.error(`  ${r.method} ${r.path} -> ${r.status}${r.authorized ? '' : '  (no fake token)'}`));
      const unauthorized = fake.requests.filter(r => !r.authorized);
      if (unauthorized.length) {
        console.error(`[FAKE] ✗ ${unauthorized.length} request(s) without the fake token`);
        exitCode = 1;
      }
      const gaps = fake.requests.filter(r => r.status === 404 || r.status >= 500);
      if (gaps.length) {
        console.error(`[FAKE] ✗ ${gaps.length} request(s) the fake could not answer; extend fake-dataverse.mjs rather than expecting this error`);
        exitCode = 1;
      }
      if (EXPECT_NO_REQUESTS && fake.requests.length) {
        console.error('[FAKE] ✗ MCP_TEST_EXPECT_NO_REQUESTS is set but the server made requests');
        exitCode = 1;
      }
      const writes = fake.requests.filter(r => r.method !== 'GET');
      if (writes.length && !ALLOW_WRITES) {
        console.error(`[FAKE] ✗ ${writes.length} write request(s); set MCP_TEST_ALLOW_WRITES=1 if the tool is meant to write`);
        exitCode = 1;
      }
      if (PII_ON) {
        const squash = v => v.toLowerCase().replace(/\s+/g, '');
        const haystack = squash(text);
        const leaked = PLANTED_VALUES.filter(v => haystack.includes(squash(v)) || haystack.includes(squash(v.split('@')[0])));
        if (leaked.length) {
          console.error(`[FAKE] ✗ Planted personal value(s) reached the output: ${leaked.join(', ')}`);
          exitCode = 1;
        } else {
          console.error('[FAKE] ✓ No planted personal value in the output');
        }
      }
    }

  } catch (error) {
    console.error(`[FAIL] Test error: ${error.message}`);
    if (error.cause) {
      console.error(`[CAUSE] ${error.cause}`);
    }
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    exitCode = 1;
  } finally {
    clearTimeout(timeoutId);
    try {
      await client.close();
    } catch (e) {
      // Ignore close errors
    }
  }

  if (fake) await fake.close();

  console.error('═'.repeat(60));
  console.error(exitCode === 0 ? '[RESULT] PASS' : '[RESULT] FAIL');

  process.exit(exitCode);
}

runTest();
