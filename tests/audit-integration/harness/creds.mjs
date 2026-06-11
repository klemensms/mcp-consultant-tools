import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const MCP_JSON_PATH = path.join(REPO_ROOT, '.mcp.json');

export const MCPTEST_SERVER_KEY = 'MCPTest-pp-data';

const REQUIRED_KEYS = [
  'POWERPLATFORM_URL',
  'POWERPLATFORM_CLIENT_ID',
  'POWERPLATFORM_CLIENT_SECRET',
  'POWERPLATFORM_TENANT_ID',
];

export async function readMcpTestCreds() {
  let raw;
  try {
    raw = await readFile(MCP_JSON_PATH, 'utf8');
  } catch (err) {
    throw new Error(
      `audit-integration: cannot read ${MCP_JSON_PATH} — required for live MCPTest creds. ` +
        `Original error: ${err.message}`,
    );
  }
  const parsed = JSON.parse(raw);
  const entry = parsed?.mcpServers?.[MCPTEST_SERVER_KEY];
  if (!entry) {
    throw new Error(
      `audit-integration: ${MCP_JSON_PATH} has no '${MCPTEST_SERVER_KEY}' entry — ` +
        `expected an MCPTest pp-data server registration.`,
    );
  }
  const env = entry.env ?? {};
  const missing = REQUIRED_KEYS.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `audit-integration: ${MCPTEST_SERVER_KEY} env block is missing required keys: ${missing.join(', ')}.`,
    );
  }
  return {
    POWERPLATFORM_URL: env.POWERPLATFORM_URL,
    POWERPLATFORM_CLIENT_ID: env.POWERPLATFORM_CLIENT_ID,
    POWERPLATFORM_CLIENT_SECRET: env.POWERPLATFORM_CLIENT_SECRET,
    POWERPLATFORM_TENANT_ID: env.POWERPLATFORM_TENANT_ID,
  };
}

export const REPO_ROOT_PATH = REPO_ROOT;
export const PP_DATA_BUILD = path.join(REPO_ROOT, 'packages', 'powerplatform-data', 'build', 'index.js');
export const AUDIT_CLI_BUILD = path.join(REPO_ROOT, 'packages', 'audit-cli', 'build', 'index.js');
