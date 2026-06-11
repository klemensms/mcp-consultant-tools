/**
 * Task 45 — exercise all 13 audit-emitting tools + set-audit-engagement.
 *
 * Goal: prove every tool produces exactly one audit record per call. Some
 * tools may legitimately fail if MCPTest doesn't have the relevant
 * configuration (e.g. no flows defined → get-flow-runs returns empty;
 * a malformed flow-run-id → get-flow-run-details fails). For those tools we
 * tolerate `result.success: false`; the assertion is that the record EXISTS
 * with the correct tool.name and one-per-call cardinality.
 */
import { setEngagement, callTool } from '../harness/client.mjs';
import { readAuditDir } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import { createPiiFixture } from '../fixtures/pii-corpus.mjs';
import path from 'node:path';

export default async function allTools(ctx) {
  // ============================================================
  // PHASE 1 — set up: spawn pp-data with audit, create a fixture
  // record we can read/update/associate against. Use audit=off
  // for fixture creation so we don't pollute the count.
  // ============================================================
  const setupSession = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'dev',
    PII_PROTECTION: 'false',
    MCP_AUDIT_LEVEL: 'off',
  });
  const fixture = await createPiiFixture(setupSession.client, 'all-tools');
  ctx.fixtureIds.push({ entitySetName: 'contacts', id: fixture.id, label: 'all-tools' });
  await setupSession.close();
  ctx.log('info', `created fixture ${fixture.id}`);

  // Also create a SECOND contact so we can exercise associate/disassociate.
  const setup2 = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'dev',
    PII_PROTECTION: 'false',
    MCP_AUDIT_LEVEL: 'off',
  });
  const fixture2 = await createPiiFixture(setup2.client, 'all-tools-2');
  ctx.fixtureIds.push({ entitySetName: 'contacts', id: fixture2.id, label: 'all-tools-2' });
  await setup2.close();
  ctx.log('info', `created fixture2 ${fixture2.id}`);

  // ============================================================
  // PHASE 2 — drive every audit-emitting tool exactly once
  // ============================================================
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'AllTools',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'all-tools@test.local',
  });

  await setEngagement(session.client, ['ALLTOOLS-001'], 'all-tools coverage');

  const calls = [];

  // 7 read tools
  calls.push(['query-records', await callTool(session.client, 'query-records', {
    entityNamePlural: 'contacts',
    filter: `contactid eq ${fixture.id}`,
    maxRecords: 1,
  })]);
  calls.push(['count-records', await callTool(session.client, 'count-records', {
    entityNamePlural: 'contacts',
    filter: 'firstname ne null',
  })]);
  calls.push(['get-record', await callTool(session.client, 'get-record', {
    entityNamePlural: 'contacts',
    recordId: fixture.id,
  })]);
  calls.push(['get-entity-metadata', await callTool(session.client, 'get-entity-metadata', {
    entityLogicalName: 'contact',
  })]);
  calls.push(['get-lookup-target', await callTool(session.client, 'get-lookup-target', {
    entityLogicalName: 'contact',
    lookupAttributeName: 'parentcustomerid',
  })]);
  // get-flow-runs and get-flow-run-details: best-effort. Tolerate failures.
  calls.push(['get-flow-runs', await callTool(session.client, 'get-flow-runs', {
    flowId: '00000000-0000-0000-0000-000000000000',
  })]);
  calls.push(['get-flow-run-details', await callTool(session.client, 'get-flow-run-details', {
    flowId: '00000000-0000-0000-0000-000000000000',
    runId: '00000000-0000-0000-0000-000000000000',
  })]);

  // 6 write tools
  // create-record: create a third contact, register it for cleanup
  const createResult = await callTool(session.client, 'create-record', {
    entityNamePlural: 'contacts',
    data: {
      firstname: 'AUDITTEST_AllTools_Create',
      lastname: 'AUDITTEST_AllTools_Create',
    },
  });
  calls.push(['create-record', createResult]);
  // Parse the GUID for cleanup (and for delete-record below).
  // pp-data response has the GUID in the text response — try to extract.
  const createText = (createResult.content ?? []).map(c => c.text ?? '').join('\n');
  const guidMatch = createText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const createdId = guidMatch ? guidMatch[0] : null;
  if (createdId) {
    ctx.fixtureIds.push({ entitySetName: 'contacts', id: createdId, label: 'all-tools-create' });
    ctx.log('info', `create-record produced id ${createdId}`);
  } else {
    ctx.log('warn', `could not extract id from create-record response: ${createText.slice(0, 200)}`);
  }

  calls.push(['update-record', await callTool(session.client, 'update-record', {
    entityNamePlural: 'contacts',
    recordId: fixture.id,
    data: { jobtitle: 'AUDITTEST_AllTools_Job' },
  })]);

  // execute-action — WhoAmI is a built-in unbound action that always works
  calls.push(['execute-action', await callTool(session.client, 'execute-action', {
    actionName: 'WhoAmI',
    parameters: {},
  })]);

  // associate-records — best-effort. Use account_primary_contact relationship between contacts.
  // Most likely this will fail because we don't know the right relationship — that's fine,
  // the audit record still emits.
  calls.push(['associate-records', await callTool(session.client, 'associate-records', {
    entityNamePlural: 'contacts',
    recordId: fixture.id,
    navigationProperty: 'contact_master_contact',
    targetEntityNamePlural: 'contacts',
    targetRecordId: fixture2.id,
  })]);
  calls.push(['disassociate-records', await callTool(session.client, 'disassociate-records', {
    entityNamePlural: 'contacts',
    recordId: fixture.id,
    navigationProperty: 'contact_master_contact',
    targetRecordId: fixture2.id,
  })]);

  // delete-record — delete the create-record fixture (or another non-existent guid as fallback)
  const deleteId = createdId ?? '00000000-0000-0000-0000-000000000000';
  calls.push(['delete-record', await callTool(session.client, 'delete-record', {
    entityNamePlural: 'contacts',
    recordId: deleteId,
    confirm: true,
  })]);
  if (createdId) {
    // Successful delete — remove from cleanup list to avoid double-delete attempts
    ctx.fixtureIds = ctx.fixtureIds.filter(f => f.id !== createdId);
  }

  await session.close();

  // ============================================================
  // PHASE 3 — read JSONL, assert one record per tool surface
  // ============================================================
  const records = await readAuditDir(path.join(ctx.auditPath, 'AllTools'));
  ctx.log('info', `audit records emitted: ${records.length}`);

  // Expected: 1 set-engagement + 13 tool calls = 14 records.
  if (records.length !== 14) {
    throw new Error(`expected 14 records, got ${records.length}. tool names: ${records.map(r => r.tool?.name).join(', ')}`);
  }

  if (records[0].tool?.name !== 'set-audit-engagement') {
    throw new Error(`first record should be set-audit-engagement, got ${records[0].tool?.name}`);
  }

  const expected = [
    'set-audit-engagement',
    'query-records',
    'count-records',
    'get-record',
    'get-entity-metadata',
    'get-lookup-target',
    'get-flow-runs',
    'get-flow-run-details',
    'create-record',
    'update-record',
    'execute-action',
    'associate-records',
    'disassociate-records',
    'delete-record',
  ];

  for (let i = 0; i < expected.length; i++) {
    const r = records[i];
    if (r.tool?.name !== expected[i]) {
      throw new Error(`record ${i+1} should be '${expected[i]}', got '${r.tool?.name}'`);
    }
    if (r.tool?.params == null && r.tool?.name !== 'set-audit-engagement') {
      // set-audit-engagement may have null params synthetic shape; tolerate
      ctx.log('warn', `record ${i+1} (${r.tool?.name}) has no tool.params`);
    }
    const ok = r.result?.success === true;
    const failed = r.result?.success === false;
    const status = ok ? 'success' : failed ? `failed (${(r.result.error ?? '').slice(0, 60)})` : '???';
    ctx.log('info', `  ${i+1}. ${r.tool?.name} → ${status}`);
  }

  // ============================================================
  // PHASE 4 — chain integrity
  // ============================================================
  const chain = walkChain(records);
  if (!chain.ok) throw new Error(`chain broken: ${JSON.stringify(chain)}`);
  ctx.log('info', `✓ chain integrity preserved across all 14 records`);

  ctx.log('info', '✓ all-tools scenario complete (14/14 tool surfaces exercised)');
}
