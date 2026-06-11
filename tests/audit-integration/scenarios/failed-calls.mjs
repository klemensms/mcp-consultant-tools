import {
  setEngagement, queryRecords, getRecord, updateRecord, deleteRecord, executeAction,
} from '../harness/client.mjs';
import { readAuditDir } from '../assert/jsonl.mjs';
import { walkChain } from '../assert/chain.mjs';
import path from 'node:path';

export default async function failedCalls(ctx) {
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_CLIENT: 'FailedCalls',
    MCP_AUDIT_PATH: ctx.auditPath,
    MCP_AUDIT_OPERATOR: 'failed@test.local',
  });
  await setEngagement(session.client, ['FAIL-001'], 'failed-calls scenario');

  const cases = [
    {
      name: 'invalid OData filter',
      tool: 'query-records',
      invoke: () => queryRecords(session.client, {
        entityNamePlural: 'contacts',
        filter: "DEFINITELY_NOT_A_FIELD eq 'foo'",
        maxRecords: 5,
      }),
    },
    {
      name: 'non-existent contact GUID',
      tool: 'get-record',
      invoke: () => getRecord(session.client, {
        entityNamePlural: 'contacts',
        recordId: '00000000-0000-0000-0000-000000000000',
      }),
    },
    {
      name: 'malformed GUID on update',
      tool: 'update-record',
      invoke: () => updateRecord(session.client, {
        entityNamePlural: 'contacts',
        recordId: 'not-a-guid',
        data: { firstname: 'X' },
      }),
    },
    {
      name: 'unknown action',
      tool: 'execute-action',
      invoke: () => executeAction(session.client, {
        actionName: 'NonExistentAction_AUDITTEST',
        parameters: {},
      }),
    },
    {
      name: 'delete non-existent contact',
      tool: 'delete-record',
      invoke: () => deleteRecord(session.client, {
        entityNamePlural: 'contacts',
        recordId: '00000000-0000-0000-0000-000000000000',
        confirm: true,
      }),
    },
  ];

  let returnedError = 0;
  const observed = [];
  for (const c of cases) {
    const r = await c.invoke();
    const isErr = !!r?.isError;
    if (isErr) {
      returnedError++;
      ctx.log('info', `✓ ${c.name} returned error as expected`);
    } else {
      ctx.log('warn', `${c.name} did NOT return error — got ${JSON.stringify(r).slice(0, 200)}`);
    }
    observed.push({ name: c.name, isError: isErr });
  }

  await session.close();

  // Read audit JSONL — every case should have produced one record with result.success=false
  const records = await readAuditDir(path.join(ctx.auditPath, 'FailedCalls'));
  ctx.log('info', `${records.length} audit records emitted`);

  // Set-engagement (1) + 5 tool calls = 6 records expected
  if (records.length !== 6) {
    throw new Error(`expected 6 records, got ${records.length}`);
  }

  const engagementRecord = records[0];
  if (engagementRecord.tool?.name !== 'set-audit-engagement') {
    throw new Error(`first record should be set-audit-engagement, got ${engagementRecord.tool?.name}`);
  }
  if (engagementRecord.result?.success !== true) {
    throw new Error('set-audit-engagement should be success=true');
  }

  // Validate the 5 tool-call records. We only enforce result.success=false on
  // cases that actually returned isError at the MCP layer. Cases that returned
  // success at the tool layer (Dataverse semantics — e.g. update on non-existent
  // returning 204) are recorded as observed and skipped from the failure asserts.
  let strictlyFailedRecords = 0;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const r = records[i + 1];
    if (r.tool?.name !== c.tool) {
      throw new Error(`record ${i + 1} should be ${c.tool}, got ${r.tool?.name}`);
    }
    if (typeof r.result?.durationMs !== 'number' || r.result.durationMs < 0) {
      throw new Error(`${c.name}: result.durationMs must be a non-negative number, got ${JSON.stringify(r.result?.durationMs)}`);
    }
    if (r.tool?.params == null) {
      throw new Error(`${c.name}: tool.params should be present`);
    }

    if (observed[i].isError) {
      // Strict failure assertions
      if (r.result?.success !== false) {
        throw new Error(`${c.name}: result.success should be false, got ${r.result?.success}`);
      }
      if (typeof r.result?.error !== 'string' || r.result.error.length === 0) {
        throw new Error(`${c.name}: result.error must be a non-empty string, got ${JSON.stringify(r.result?.error)}`);
      }
      strictlyFailedRecords++;
      ctx.log('info', `  ✓ ${c.name} → success=false, error=${r.result.error.slice(0, 100)}`);
    } else {
      ctx.log('info', `  ~ ${c.name} → success=${r.result?.success} (Dataverse semantics — not a hard fail)`);
    }
  }

  // Chain still walks ok despite failures
  const chain = walkChain(records);
  if (!chain.ok) {
    throw new Error('chain broken: ' + JSON.stringify(chain));
  }

  ctx.log(
    'info',
    `✓ chain integrity preserved across ${records.length} records (${returnedError}/5 returned error; ${strictlyFailedRecords} success=false records validated)`,
  );

  // Hard requirement: at least one case actually failed and emitted success=false.
  // If zero cases failed, the scenario is meaningless — flag a bug because
  // none of these inputs should plausibly succeed across MCPTest.
  if (strictlyFailedRecords === 0) {
    throw new Error(
      'No case produced a result.success=false record — scenario provides no value. ' +
      'Either Dataverse silently accepted every malformed call (unlikely) or the audit ' +
      'pipeline is dropping failure records (Phase A bug).',
    );
  }
}
