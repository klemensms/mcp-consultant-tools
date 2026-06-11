/**
 * Task 43 — context switch (engagement A → B with metadata).
 *
 * Verifies:
 *   - 2 set-engagement calls + 4 query-records = 6 records
 *   - All records under engagement A carry A's workItemIds
 *   - All records under engagement B carry B's workItemIds
 *   - The B-set record carries `tool.contextChange = {from: A, to: B}`
 *   - Chain integrity preserved across the switch
 */
import { setEngagement, queryRecords } from '../harness/client.mjs';
import { readAuditDir } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import path from 'node:path';

function arraysEq(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export default async function contextSwitch(ctx) {
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'ContextSwitch',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'cs@test.local',
  });

  const A_IDS = ['MCPTEST-AUDIT-A1', 'MCPTEST-AUDIT-A2'];
  const B_IDS = ['MCPTEST-AUDIT-B1'];

  // PHASE A — engagement A
  await setEngagement(session.client, A_IDS, 'context A');
  await queryRecords(session.client, { entityNamePlural: 'contacts', filter: 'firstname ne null', maxRecords: 1 });
  await queryRecords(session.client, { entityNamePlural: 'contacts', filter: 'firstname ne null', maxRecords: 1 });

  // PHASE B — switch to engagement B
  await setEngagement(session.client, B_IDS, 'context B');
  await queryRecords(session.client, { entityNamePlural: 'contacts', filter: 'firstname ne null', maxRecords: 1 });
  await queryRecords(session.client, { entityNamePlural: 'contacts', filter: 'firstname ne null', maxRecords: 1 });

  await session.close();

  // PHASE C — read JSONL, validate per-record
  const records = await readAuditDir(path.join(ctx.auditPath, 'ContextSwitch'));
  ctx.log('info', `total records: ${records.length} (expected 6)`);
  if (records.length !== 6) throw new Error(`expected 6 records, got ${records.length}`);

  const [setA, callA1, callA2, setB, callB1, callB2] = records;

  // 1. set-engagement A
  if (setA.tool?.name !== 'set-audit-engagement') {
    throw new Error(`record 1 should be set-audit-engagement, got ${setA.tool?.name}`);
  }
  if (!arraysEq(setA.engagement?.workItemIds, A_IDS)) {
    throw new Error(`setA engagement wrong: ${JSON.stringify(setA.engagement)}`);
  }
  // contextChange.from for the FIRST set-engagement call: null OR an unset-source object.
  if (setA.tool?.contextChange?.from != null && setA.tool.contextChange.from.source !== 'unset') {
    throw new Error(`setA contextChange.from should be null or {source:'unset'}, got ${JSON.stringify(setA.tool.contextChange.from)}`);
  }
  ctx.log('info', '✓ record 1: set-engagement A with [A1, A2]');

  // 2-3. Calls under A
  for (const r of [callA1, callA2]) {
    if (r.tool?.name !== 'query-records') {
      throw new Error(`expected query-records under A, got ${r.tool?.name}`);
    }
    if (!arraysEq(r.engagement?.workItemIds, A_IDS)) {
      throw new Error(`call under A has wrong engagement: ${JSON.stringify(r.engagement)}`);
    }
  }
  ctx.log('info', '✓ records 2-3: 2 query-records under engagement A');

  // 4. set-engagement B with contextChange A → B
  if (setB.tool?.name !== 'set-audit-engagement') {
    throw new Error(`record 4 should be set-audit-engagement, got ${setB.tool?.name}`);
  }
  if (!setB.tool?.contextChange) {
    throw new Error('record 4 (B) should carry tool.contextChange metadata');
  }
  const cc = setB.tool.contextChange;
  if (!arraysEq(cc.from?.workItemIds, A_IDS)) {
    throw new Error(`contextChange.from.workItemIds wrong: ${JSON.stringify(cc.from)}`);
  }
  if (!arraysEq(cc.to?.workItemIds, B_IDS)) {
    throw new Error(`contextChange.to.workItemIds wrong: ${JSON.stringify(cc.to)}`);
  }
  if (!arraysEq(setB.engagement?.workItemIds, B_IDS)) {
    throw new Error(`setB.engagement should be B, got ${JSON.stringify(setB.engagement)}`);
  }
  ctx.log('info', '✓ record 4: set-engagement B with contextChange A → B');

  // 5-6. Calls under B
  for (const r of [callB1, callB2]) {
    if (r.tool?.name !== 'query-records') {
      throw new Error(`expected query-records under B, got ${r.tool?.name}`);
    }
    if (!arraysEq(r.engagement?.workItemIds, B_IDS)) {
      throw new Error(`call under B has wrong engagement: ${JSON.stringify(r.engagement)}`);
    }
  }
  ctx.log('info', '✓ records 5-6: 2 query-records under engagement B');

  // PHASE D — chain integrity across the switch
  const chain = walkChain(records);
  if (!chain.ok) throw new Error(`chain broken: ${JSON.stringify(chain)}`);
  ctx.log('info', `✓ chain integrity preserved across ${records.length} records spanning context switch`);
}
