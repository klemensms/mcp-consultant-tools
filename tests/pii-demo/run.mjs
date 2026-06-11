#!/usr/bin/env node
// PII demo runner.
//
// Spawns each MCP server in turn under every scenario configuration, runs
// every query against it, and writes a structured manifest plus per-result
// response files to `output/`.
//
// Usage:
//   npm run build                          # ensure server build is current
//   node tests/pii-demo/run.mjs            # run all scenarios × queries
//
// Required env (loaded from .env / .env.local at repo root):
//   POWERPLATFORM_URL, POWERPLATFORM_CLIENT_ID,
//   POWERPLATFORM_CLIENT_SECRET, POWERPLATFORM_TENANT_ID

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { scenarios } from './scenarios.mjs';
import { queries, servers } from './queries.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env'), override: false });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local'), override: true });

// Fallback credential source: pull POWERPLATFORM_* vars from a named MCP
// server entry in .mcp.json when they aren't set in the environment. Lets us
// avoid duplicating secrets across .env files and .mcp.json.
loadCredentialsFromMcpJson('MCPTest-pp-data', [
  'POWERPLATFORM_URL',
  'POWERPLATFORM_CLIENT_ID',
  'POWERPLATFORM_CLIENT_SECRET',
  'POWERPLATFORM_TENANT_ID',
]);

function loadCredentialsFromMcpJson(serverName, keys) {
  const mcpJsonPath = path.join(REPO_ROOT, '.mcp.json');
  if (!existsSync(mcpJsonPath)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(mcpJsonPath, 'utf8'));
  } catch (err) {
    process.stderr.write(
      `[pii-demo] Could not parse .mcp.json: ${err.message}. Skipping credential fallback.\n`
    );
    return;
  }
  const entry = parsed.mcpServers?.[serverName];
  if (!entry?.env) return;
  for (const key of keys) {
    if (process.env[key] === undefined && entry.env[key] !== undefined) {
      process.env[key] = entry.env[key];
    }
  }
}

const OUTPUT_DIR = path.join(__dirname, 'output');
const RESPONSES_DIR = path.join(OUTPUT_DIR, 'responses');

function escapeRegexLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\@]/g, '\\$&');
}

function extractFooter(text) {
  const m = text.match(/\[PII protection:[^\]]+\]/);
  return m ? m[0] : null;
}

function extractFacts(text, fields) {
  const out = {};
  for (const field of fields ?? []) {
    const escaped = escapeRegexLiteral(field);
    // Match "field": "value" — captures null/empty separately.
    const stringMatch = text.match(new RegExp(`"${escaped}":\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`));
    if (stringMatch) {
      out[field] = stringMatch[1];
      continue;
    }
    const nullMatch = text.match(new RegExp(`"${escaped}":\\s*null`));
    if (nullMatch) {
      out[field] = null;
      continue;
    }
    out[field] = undefined; // field absent from response (interesting for L1)
  }
  return out;
}

function buildServerEnv(server, scenario) {
  const env = {};
  for (const key of server.requiredEnv ?? []) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, scenario.env);
  if (env.PII_CONFIG_PATH && !path.isAbsolute(env.PII_CONFIG_PATH)) {
    env.PII_CONFIG_PATH = path.resolve(__dirname, env.PII_CONFIG_PATH);
  }
  return env;
}

function packageVersion(rel) {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, rel, 'package.json'), 'utf8')
    );
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

async function runOneSession(server, scenario, queriesForServer) {
  const env = buildServerEnv(server, scenario);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(REPO_ROOT, server.buildPath)],
    env: { ...process.env, ...env },
  });
  const client = new Client(
    { name: 'pii-demo-runner', version: '1.0.0' },
    { capabilities: {} }
  );

  let connectError = null;
  let serverStderr = '';

  // Attempt to capture server stderr so refuse-to-start messages land in the
  // manifest. The SDK doesn't expose this directly; we rely on the OS-level
  // pipe via the transport's process.
  try {
    await client.connect(transport);
    if (transport.stderr) {
      transport.stderr.on('data', (d) => {
        serverStderr += d.toString();
      });
    }
  } catch (err) {
    connectError = err;
  }

  if (connectError) {
    const results = queriesForServer.map((q) => ({
      scenario_id: scenario.id,
      query_id: q.id,
      server_id: server.id,
      connect_failed: true,
      error: connectError.message,
      server_stderr: serverStderr || null,
    }));
    try {
      await client.close();
    } catch {}
    return results;
  }

  const results = [];
  for (const q of queriesForServer) {
    const start = Date.now();
    try {
      const r = await client.callTool({ name: q.tool, arguments: q.args });
      const duration = Date.now() - start;
      const text = r.content?.[0]?.text ?? '';
      const responseFile = `${scenario.id}__${q.id}.txt`;
      writeFileSync(path.join(RESPONSES_DIR, responseFile), text);
      results.push({
        scenario_id: scenario.id,
        query_id: q.id,
        server_id: server.id,
        response_file: path.join('responses', responseFile),
        is_error: r.isError ?? false,
        footer: extractFooter(text),
        duration_ms: duration,
        response_chars: text.length,
        extracted: extractFacts(text, q.extractFields),
      });
    } catch (err) {
      results.push({
        scenario_id: scenario.id,
        query_id: q.id,
        server_id: server.id,
        error: err.message,
        duration_ms: Date.now() - start,
      });
    }
  }

  try {
    await client.close();
  } catch {}

  // Capture any trailing stderr.
  if (serverStderr) {
    results[0].server_stderr_tail = serverStderr.slice(-2000);
  }

  return results;
}

function groupQueriesByServer(qs) {
  const map = new Map();
  for (const q of qs) {
    if (!map.has(q.server)) map.set(q.server, []);
    map.get(q.server).push(q);
  }
  return map;
}

async function main() {
  // Reset output (responses dir only — keep parent dir to preserve any
  // user-added README/notes).
  if (existsSync(RESPONSES_DIR)) {
    rmSync(RESPONSES_DIR, { recursive: true, force: true });
  }
  mkdirSync(RESPONSES_DIR, { recursive: true });

  const startedAt = new Date().toISOString();
  const results = [];
  const queriesByServer = groupQueriesByServer(queries);

  for (const scenario of scenarios) {
    for (const [serverId, qs] of queriesByServer.entries()) {
      const server = servers[serverId];
      process.stderr.write(`▶ ${scenario.id} × ${serverId}\n`);
      if (!server) {
        for (const q of qs) {
          results.push({
            scenario_id: scenario.id,
            query_id: q.id,
            server_id: serverId,
            error: `Unknown server: ${serverId}`,
            skipped: true,
          });
        }
        continue;
      }
      const sessionResults = await runOneSession(server, scenario, qs);
      for (const r of sessionResults) {
        const status = r.connect_failed
          ? 'REFUSED_TO_START'
          : r.error
            ? `ERROR: ${r.error.slice(0, 60)}`
            : r.footer ?? '(no footer)';
        process.stderr.write(`    ${r.query_id}: ${status}\n`);
      }
      results.push(...sessionResults);
    }
  }

  const manifest = {
    version: '1.0',
    generated_at: startedAt,
    completed_at: new Date().toISOString(),
    package_versions: {
      core: packageVersion('packages/core'),
      'powerplatform-core': packageVersion('packages/powerplatform-core'),
      'powerplatform-data': packageVersion('packages/powerplatform-data'),
    },
    scenarios,
    queries,
    servers: Object.values(servers),
    results,
  };

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const refusedCount = results.filter((r) => r.connect_failed).length;
  const callErrorCount = results.filter((r) => r.error && !r.connect_failed).length;
  const toolErrorCount = results.filter((r) => r.is_error).length;
  const okCount = results.filter((r) => !r.error && !r.is_error).length;
  process.stderr.write(
    `\nDone. ${results.length} results — ${okCount} ok, ${toolErrorCount} tool-returned-error, ${callErrorCount} call-threw, ${refusedCount} refused-to-start.\n`
  );
  process.stderr.write(
    `Manifest: ${path.relative(REPO_ROOT, manifestPath)}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
