/**
 * D22: `query error-summary --table FunctionAppLogs` built a query naming a column the
 * table does not carry, and so failed on every workspace holding the table - including one
 * with 79,576 records in it - with `Bad request: The request had some invalid properties`.
 * Not permissions and not data: `--table AppExceptions` worked, and a hand-written query
 * over the same table with the same credential returned normally.
 *
 * The column was `InvocationId`, lifted from the Application Insights shape.
 * `FunctionAppLogs` names it `FunctionInvocationId`, and has no `OperationId` at all. The
 * query API resolves column names before it reads a row, which is why the failure was
 * identical everywhere.
 *
 * The acceptance criterion is the failure case, and it has to be the *class* rather than
 * the instance: every column each built query reads must exist on the table it reads it
 * from, checked against the documented schema. That assertion fails on the shape that was
 * being sent and cannot be satisfied by a query that merely parses.
 *
 * Schemas below are the full documented column lists, as of 2026-08-19:
 *   https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/functionapplogs
 *   https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/appexceptions
 *   https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/apptraces
 */

import { describe, it, expect } from 'vitest';
import { buildErrorSummaryQuery, ERROR_SUMMARY_TABLES } from '../error-summary-query.js';

const DOCUMENTED_COLUMNS: Record<string, string[]> = {
  FunctionAppLogs: [
    'ActivityId', 'AppName', '_BilledSize', 'Category', 'EventId', 'EventName',
    'ExceptionDetails', 'ExceptionMessage', 'ExceptionType', 'FunctionInvocationId',
    'FunctionName', 'HostInstanceId', 'HostVersion', '_IsBillable', 'Level', 'LevelId',
    'Location', 'Message', 'ProcessId', '_ResourceId', 'RoleInstance', 'SourceSystem',
    '_SubscriptionId', 'TenantId', 'TimeGenerated', 'Type',
  ],
  AppExceptions: [
    'AppRoleInstance', 'AppRoleName', 'AppVersion', 'Assembly', '_BilledSize',
    'ClientBrowser', 'ClientCity', 'ClientCountryOrRegion', 'ClientIP', 'ClientModel',
    'ClientOS', 'ClientStateOrProvince', 'ClientType', 'Details', 'ExceptionType',
    'HandledAt', 'IKey', 'InnermostAssembly', 'InnermostMessage', 'InnermostMethod',
    'InnermostType', '_IsBillable', 'ItemCount', 'Measurements', 'Message', 'Method',
    'OperationId', 'OperationName', 'OuterAssembly', 'OuterMessage', 'OuterMethod',
    'OuterType', 'ParentId', 'ProblemId', 'Properties', 'ResourceGUID', '_ResourceId',
    'SDKVersion', 'SessionId', 'SeverityLevel', 'SourceSystem', '_SubscriptionId',
    'SyntheticSource', 'TenantId', 'TimeGenerated', 'Type', 'UserAccountId',
    'UserAuthenticatedId', 'UserId',
  ],
  AppTraces: [
    'AppRoleInstance', 'AppRoleName', 'AppVersion', '_BilledSize', 'ClientBrowser',
    'ClientCity', 'ClientCountryOrRegion', 'ClientIP', 'ClientModel', 'ClientOS',
    'ClientStateOrProvince', 'ClientType', 'IKey', '_IsBillable', 'ItemCount',
    'Measurements', 'Message', 'OperationId', 'OperationName', 'ParentId', 'Properties',
    'ReferencedItemId', 'ReferencedType', 'ResourceGUID', '_ResourceId', 'SDKVersion',
    'SessionId', 'SeverityLevel', 'SourceSystem', '_SubscriptionId', 'SyntheticSource',
    'TenantId', 'TimeGenerated', 'Type', 'UserAccountId', 'UserAuthenticatedId', 'UserId',
  ],
};

/** KQL operators, which are bare words in the query text and are not column references. */
const KQL_OPERATORS = new Set([
  'summarize', 'by', 'where', 'order', 'project', 'extend', 'asc', 'desc', 'and', 'or',
]);

/**
 * The identifiers a query reads from its source table.
 *
 * Everything the query defines for itself is excluded: an alias (`Name = ...`) is
 * produced by the query rather than read from the table, and anything followed by `(` is
 * a function. What remains has to exist on the table.
 */
function sourceColumnsOf(kql: string, table: string): string[] {
  const aliases = new Set([...kql.matchAll(/([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]));
  const functions = new Set([...kql.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]));
  const identifiers = [...kql.matchAll(/\b[A-Za-z_]\w*\b/g)].map((m) => m[0]);

  return [
    ...new Set(
      identifiers.filter(
        (id) =>
          id !== table &&
          !aliases.has(id) &&
          !functions.has(id) &&
          !KQL_OPERATORS.has(id)
      )
    ),
  ];
}

describe('buildErrorSummaryQuery', () => {
  for (const table of ERROR_SUMMARY_TABLES) {
    for (const dedupe of [true, false]) {
      it(`reads only documented ${table} columns (dedupe: ${dedupe})`, () => {
        const { kql } = buildErrorSummaryQuery({ table, dedupe, minCount: 1 });
        const documented = DOCUMENTED_COLUMNS[table];
        const unknown = sourceColumnsOf(kql, table).filter((c) => !documented.includes(c));

        expect(unknown).toEqual([]);
      });
    }
  }

  it('reads at least one column from every table, so an empty extraction cannot pass', () => {
    for (const table of ERROR_SUMMARY_TABLES) {
      const { kql } = buildErrorSummaryQuery({ table, dedupe: true, minCount: 1 });
      expect(sourceColumnsOf(kql, table).length).toBeGreaterThan(0);
    }
  });

  it('groups FunctionAppLogs repeats by FunctionInvocationId, the column that exists', () => {
    const { kql, dedupeKey } = buildErrorSummaryQuery({
      table: 'FunctionAppLogs',
      dedupe: true,
      minCount: 1,
    });

    expect(dedupeKey).toBe('FunctionInvocationId');
    expect(kql).toContain('FunctionInvocationId');
    // `OperationId` is an Application Insights column; naming it here is the defect.
    expect(kql).not.toMatch(/\bOperationId\b/);
  });

  it('names OperationId as the dedupe key for the Application Insights tables', () => {
    for (const table of ['AppExceptions', 'AppTraces'] as const) {
      expect(buildErrorSummaryQuery({ table, dedupe: true, minCount: 1 }).dedupeKey).toBe(
        'OperationId'
      );
    }
  });

  it('reports no dedupe key when deduplication is off', () => {
    for (const table of ERROR_SUMMARY_TABLES) {
      expect(buildErrorSummaryQuery({ table, dedupe: false, minCount: 1 }).dedupeKey).toBeUndefined();
    }
  });

  it('applies minCount to the count the shape actually produces', () => {
    expect(buildErrorSummaryQuery({ table: 'AppExceptions', dedupe: true, minCount: 7 }).kql)
      .toContain('where UniqueErrors >= 7');
    expect(buildErrorSummaryQuery({ table: 'AppExceptions', dedupe: false, minCount: 7 }).kql)
      .toContain('where Count >= 7');
  });

  /**
   * The CLI took `--table` as free text and fell through to the `FunctionAppLogs` shape for
   * anything it did not recognise, so a typo returned a confident answer about a different
   * table.
   */
  it('rejects an unsupported table instead of answering about a different one', () => {
    expect(() => buildErrorSummaryQuery({ table: 'AppRequests', dedupe: true, minCount: 1 }))
      .toThrow(/Unsupported table 'AppRequests'/);
    expect(() => buildErrorSummaryQuery({ table: 'appexceptions', dedupe: true, minCount: 1 }))
      .toThrow(/AppExceptions, AppTraces, FunctionAppLogs/);
  });
});
