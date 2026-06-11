import { startPpDataClient } from './spawn.mjs';
import { setEngagement, queryRecords } from './client.mjs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), 'audit-smoke-'));
  console.error('[smoke-audit] audit dir:', auditDir);

  const session = await startPpDataClient({
    env: {
      MCP_ENVIRONMENT_TYPE: 'uat',
      PII_PROTECTION: 'true',
      MCP_AUDIT_LEVEL: 'lean',
      MCP_AUDIT_CLIENT: 'AuditSmoke',
      MCP_AUDIT_PATH: auditDir,
      MCP_AUDIT_OPERATOR: 'audit-smoke@test.local',
    },
  });

  try {
    await setEngagement(session.client, ['SMOKE-001'], 'audit smoke test');
    console.error('[smoke-audit] engagement set');

    const r = await queryRecords(session.client, {
      entityNamePlural: 'contacts',
      filter: 'firstname ne null',
      maxRecords: 1,
    });
    if (r?.isError) throw new Error('query-records failed: ' + JSON.stringify(r));
    console.error('[smoke-audit] query OK');
  } finally {
    await session.close();
  }

  // Inspect audit dir
  const clientDir = path.join(auditDir, 'AuditSmoke');
  const files = await readdir(clientDir);
  const jsonl = files.find((f) => f.endsWith('.jsonl'));
  if (!jsonl) {
    console.error('[smoke-audit] FAIL — no JSONL produced');
    console.error('files:', files);
    process.exit(1);
  }
  const content = await readFile(path.join(clientDir, jsonl), 'utf8');
  const lines = content.trim().split('\n');
  console.error('[smoke-audit] records emitted:', lines.length);
  for (const line of lines) {
    const r = JSON.parse(line);
    console.error('  -', r.seq, r.tool.name, '→', r.result.success ? 'ok' : 'fail');
  }
  if (lines.length < 2) {
    console.error('[smoke-audit] FAIL — expected ≥2 records (set-engagement + query)');
    process.exit(1);
  }
  console.error('[smoke-audit] PASS');
}

main().catch((err) => {
  console.error('[smoke-audit] FAIL:', err.message);
  console.error(err.stack);
  process.exit(2);
});
