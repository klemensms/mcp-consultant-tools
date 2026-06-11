import { setEngagement, queryRecords } from '../harness/client.mjs';
import { readAuditDir } from '../assert/jsonl.mjs';
import path from 'node:path';

export default async function refuseToExecute(ctx) {
  // PHASE 1: Spawn pp-data with audit=lean and DO NOT call set-audit-engagement.
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'RefuseExec',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'refuse-exec@test.local',
  });

  // PHASE 2: Call query-records without engagement set.
  // Expected: tool returns an error response (isError=true) referencing
  // 'set-audit-engagement' and the engagement-unset condition.
  const r1 = await queryRecords(session.client, {
    entityNamePlural: 'contacts',
    filter: 'firstname ne null',
    maxRecords: 1,
  });
  if (!r1?.isError) {
    throw new Error('expected isError=true (no engagement set), got success: ' + JSON.stringify(r1));
  }
  const errText = (r1.content ?? []).map((c) => c.text ?? '').join('\n');
  if (!/set-audit-engagement/i.test(errText)) {
    throw new Error(`error text does not reference set-audit-engagement: ${errText}`);
  }
  if (!/AuditEngagementUnsetError|engagement.*not.*set|engagement.*unset|no.*engagement|engagement.*required/i.test(errText)) {
    throw new Error(`error text does not name the engagement-unset condition: ${errText}`);
  }
  ctx.log('info', `✓ refuse-to-execute fired with correct error: ${errText.slice(0, 200)}`);

  // PHASE 3: Confirm no SUCCESSFUL query-records record was emitted before engagement set.
  const records1 = await readAuditDir(path.join(ctx.auditPath, 'RefuseExec'));
  const successQueriesBefore = records1.filter(
    (r) => r.tool?.name === 'query-records' && r.result?.success === true,
  );
  if (successQueriesBefore.length > 0) {
    throw new Error('leakage: query-records was successfully audit-logged before engagement set');
  }
  if (records1.length > 0) {
    ctx.log(
      'warn',
      `note: ${records1.length} record(s) emitted before engagement set (tool names: ${records1.map((r) => r.tool?.name).join(', ')}) — review acceptability`,
    );
  } else {
    ctx.log('info', '✓ no audit records emitted before engagement set');
  }

  // PHASE 4: Now set engagement.
  await setEngagement(session.client, ['REFUSE-001'], 'recovery test');
  ctx.log('info', 'engagement set after refusal');

  // PHASE 5: Re-call query-records. Expected: success.
  const r2 = await queryRecords(session.client, {
    entityNamePlural: 'contacts',
    filter: 'firstname ne null',
    maxRecords: 1,
  });
  if (r2?.isError) {
    throw new Error(`expected success after engagement set, got error: ${JSON.stringify(r2)}`);
  }
  ctx.log('info', '✓ query-records succeeded after engagement set');

  await session.close();

  // PHASE 6: Audit dir now has set-audit-engagement + query-records records.
  const records2 = await readAuditDir(path.join(ctx.auditPath, 'RefuseExec'));
  const successQueries = records2.filter(
    (r) => r.tool?.name === 'query-records' && r.result?.success === true,
  );
  if (successQueries.length !== 1) {
    throw new Error(`expected exactly 1 successful query-records record, got ${successQueries.length}`);
  }
  const engagementRecords = records2.filter((r) => r.tool?.name === 'set-audit-engagement');
  if (engagementRecords.length !== 1) {
    throw new Error(`expected exactly 1 set-audit-engagement record, got ${engagementRecords.length}`);
  }
  ctx.log(
    'info',
    `✓ post-recovery: ${records2.length} total records, 1 engagement + 1 successful query`,
  );
}
