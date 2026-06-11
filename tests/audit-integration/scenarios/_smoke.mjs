import { setEngagement, queryRecords } from '../harness/client.mjs';
import { readAuditDir } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import path from 'node:path';

export default async function smoke(ctx) {
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'AuditSmoke',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'audit-smoke@test.local',
  });

  await setEngagement(session.client, ['SMOKE-001'], 'runner smoke test');
  ctx.log('info', 'engagement set');

  const r = await queryRecords(session.client, {
    entityNamePlural: 'contacts',
    filter: 'firstname ne null',
    maxRecords: 1,
  });
  if (r?.isError) throw new Error('query-records failed: ' + JSON.stringify(r));
  ctx.log('info', 'query OK');

  await session.close();

  const records = await readAuditDir(path.join(ctx.auditPath, 'AuditSmoke'));
  if (records.length < 2) {
    throw new Error(`expected ≥2 audit records, got ${records.length}`);
  }
  ctx.log('info', `audit records: ${records.length}`);

  const chain = walkChain(records);
  if (!chain.ok) throw new Error('chain broken: ' + JSON.stringify(chain));
  ctx.log('info', 'chain OK');
}
