/**
 * `investigate-sync` wrote its four KQL queries and its workspace-name parse out twice,
 * inline in `cli/commands/query-commands.ts` and again in `tools/function-tools.ts`. That
 * is the duplication that produced the invalid `FunctionAppLogs` query the `error-summary`
 * extraction closed: a column named wrongly in one copy is a defect in one surface only,
 * and no test can assert against a string that exists twice.
 *
 * The two copies had already drifted, on the empty-result note and on how an unparseable
 * workspace name failed - `process.exit(1)` in the CLI, an `isError` payload in the tool.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSyncInvestigationQueries,
  parseSyncAppTarget,
} from '../sync-investigation-query.js';

describe('parseSyncAppTarget', () => {
  it('derives the sync app name from the workspace id', () => {
    expect(parseSyncAppTarget('log-dev-contoso-uks-01')).toEqual({
      environment: 'dev',
      client: 'contoso',
      appPattern: 'func-dev-contoso-sc-sync',
    });
  });

  it('throws on an unparseable workspace id rather than exiting or returning a sentinel', () => {
    // Both surfaces now fail the same way. The CLI used to `process.exit(1)`, which a
    // caller cannot catch, and the tool returned an isError payload.
    expect(() => parseSyncAppTarget('contoso-logs')).toThrow(
      /Could not parse environment\/client/
    );
    expect(() => parseSyncAppTarget('')).toThrow(/Expected format/);
  });
});

describe('buildSyncInvestigationQueries', () => {
  const build = (overrides: Partial<Parameters<typeof buildSyncInvestigationQueries>[0]> = {}) =>
    buildSyncInvestigationQueries({
      appPattern: 'func-dev-contoso-sc-sync',
      includeDetails: true,
      detailsLimit: 10,
      ...overrides,
    });

  it('scopes all four queries to the derived sync app', () => {
    const q = build();
    const all = [q.errorsByFunction, q.errorCategory, q.recentErrors!, q.errorTraces];

    for (const kql of all) {
      expect(kql).toContain('AppRoleName contains "func-dev-contoso-sc-sync"');
    }
  });

  it('reads exceptions from AppExceptions and traces from AppTraces', () => {
    const q = build();

    expect(q.errorsByFunction.trim().startsWith('AppExceptions')).toBe(true);
    expect(q.errorCategory.trim().startsWith('AppExceptions')).toBe(true);
    expect(q.recentErrors!.trim().startsWith('AppExceptions')).toBe(true);
    expect(q.errorTraces.trim().startsWith('AppTraces')).toBe(true);
  });

  it('collapses retries by OperationId in every query, so one failing operation is one error', () => {
    const q = build();

    for (const kql of [q.errorsByFunction, q.errorCategory, q.recentErrors!, q.errorTraces]) {
      expect(kql).toContain('OperationId');
    }
    // The two-stage summarize is what turns twenty retries of one operation into one row
    // with a retry count, rather than twenty errors.
    expect(q.errorsByFunction.match(/\| summarize/g)).toHaveLength(2);
    expect(q.errorTraces.match(/\| summarize/g)).toHaveLength(2);
  });

  it('omits the detail query when details are off, rather than running and discarding it', () => {
    expect(build({ includeDetails: false }).recentErrors).toBeNull();
  });

  it('applies the details limit to the detail query', () => {
    expect(build({ detailsLimit: 3 }).recentErrors).toContain('| take 3');
  });

  it('caps the trace query at ten rows regardless of the details limit', () => {
    expect(build({ detailsLimit: 500 }).errorTraces).toContain('| take 10');
  });
});
