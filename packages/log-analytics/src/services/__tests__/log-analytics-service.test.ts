import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { LogAnalyticsService } from '../log-analytics-service.js';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const mockedPost = vi.mocked(axios.post);

function makeService(retry?: { sleep?: (ms: number) => Promise<void> }): LogAnalyticsService {
  return new LogAnalyticsService({
    authMethod: 'api-key',
    resources: [
      {
        id: 'ws-test',
        name: 'ws-test',
        workspaceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        active: true,
        apiKey: 'fake-api-key',
      },
      {
        // A workspace whose id follows the log-{env}-{client}-... convention
        // `investigate-sync` derives the sync app name from.
        id: 'log-dev-contoso-uks-01',
        name: 'log-dev-contoso-uks-01',
        workspaceId: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff',
        active: true,
        apiKey: 'fake-api-key',
      },
    ],
    ...(retry ? { retry } : {}),
  });
}

const httpError = (status: number, headers: Record<string, unknown> = {}) => ({
  response: { status, headers, data: {} },
});

const apiResponse = () => ({
  data: { tables: [{ name: 'PrimaryResult', columns: [], rows: [] }] },
});

describe('LogAnalyticsService.executeQuery timespan handling', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  // Regression: with no explicit timespan, PT1H was applied (directly or via the
  // tool/CLI default), silently clipping a query that asked for ago(30d).
  it('derives the request timespan from ago() when none is passed', async () => {
    mockedPost.mockResolvedValueOnce(apiResponse());
    const service = makeService();

    const result: any = await service.executeQuery(
      'ws-test',
      'AppTraces | where TimeGenerated > ago(30d)'
    );

    const body = mockedPost.mock.calls[0][1] as any;
    expect(body.timespan).toBe('P30D');
    expect(result.effectiveTimespan).toBe('P30D');
    expect(result.timespanWarning).toBeUndefined();
    expect(result.tables).toHaveLength(1);
  });

  it('respects an explicit timespan verbatim but warns when ago() is wider', async () => {
    mockedPost.mockResolvedValueOnce(apiResponse());
    const service = makeService();

    const result: any = await service.executeQuery(
      'ws-test',
      'AppTraces | where TimeGenerated > ago(30d)',
      'PT1H'
    );

    const body = mockedPost.mock.calls[0][1] as any;
    expect(body.timespan).toBe('PT1H');
    expect(result.effectiveTimespan).toBe('PT1H');
    expect(result.timespanWarning).toBeDefined();
  });

  it('applies the PT1H default when there is no timespan and no ago()', async () => {
    mockedPost.mockResolvedValueOnce(apiResponse());
    const service = makeService();

    const result: any = await service.executeQuery('ws-test', 'AppTraces | take 10');

    const body = mockedPost.mock.calls[0][1] as any;
    expect(body.timespan).toBe('PT1H');
    expect(result.effectiveTimespan).toBe('PT1H');
    expect(result.timespanWarning).toBeUndefined();
  });
});

/**
 * The retry policy itself is unit-tested in `utils/__tests__/retry.test.ts`. These assert
 * it is actually wired into `executeQuery`, which made exactly one `axios.post` before.
 */
describe('LogAnalyticsService.executeQuery retry policy', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('retries a transient failure instead of failing the first time', async () => {
    mockedPost
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce(apiResponse());

    const result: any = await makeService({ sleep: async () => {} }).executeQuery(
      'ws-test',
      'AppTraces | take 10'
    );

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(result.tables).toHaveLength(1);
  });

  it('waits as long as a 429 asked, rather than only reporting the header', async () => {
    const delays: number[] = [];
    mockedPost
      .mockRejectedValueOnce(httpError(429, { 'retry-after': '5' }))
      .mockResolvedValueOnce(apiResponse());

    await makeService({
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    }).executeQuery('ws-test', 'AppTraces | take 10');

    expect(delays).toEqual([5000]);
  });

  it('keeps the existing error mapping once the retries are spent', async () => {
    mockedPost.mockRejectedValue(httpError(429, { 'retry-after': '2' }));

    await expect(
      makeService({ sleep: async () => {} }).executeQuery('ws-test', 'AppTraces | take 10')
    ).rejects.toThrow(/Rate limit exceeded.*Retry after 2 seconds/s);

    expect(mockedPost).toHaveBeenCalledTimes(4);
  });

  it('does not retry a KQL syntax error', async () => {
    mockedPost.mockRejectedValue({
      response: {
        status: 400,
        headers: {},
        data: { error: { code: 'SyntaxError', message: 'bad token' } },
      },
    });

    await expect(
      makeService({ sleep: async () => {} }).executeQuery('ws-test', 'AppTraces | wher x')
    ).rejects.toThrow(/KQL syntax error/);

    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});

describe('LogAnalyticsService.investigateSync', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('runs the four queries once each and reports the derived sync app', async () => {
    mockedPost.mockResolvedValue(apiResponse());

    const result = await makeService().investigateSync('log-dev-contoso-uks-01', 'PT8H');

    expect(result.environment).toBe('dev');
    expect(result.client).toBe('contoso');
    expect(result.appPattern).toBe('func-dev-contoso-sc-sync');
    expect(mockedPost).toHaveBeenCalledTimes(4);
    expect(result.recentErrors).not.toBeNull();
  });

  it('skips the detail query when details are off', async () => {
    mockedPost.mockResolvedValue(apiResponse());

    const result = await makeService().investigateSync(
      'log-dev-contoso-uks-01',
      'PT8H',
      false
    );

    expect(mockedPost).toHaveBeenCalledTimes(3);
    expect(result.recentErrors).toBeNull();
  });

  it('throws on an unparseable workspace id before making any call', async () => {
    mockedPost.mockResolvedValue(apiResponse());

    await expect(
      makeService().investigateSync('contoso-logs')
    ).rejects.toThrow(/Could not parse environment\/client/);

    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('LogAnalyticsService.investigateApp', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedPost.mockResolvedValue(apiResponse());
  });

  // The toolkit's telemetry-report skill parses these fields out of the cached
  // .json, so the structured shape is the contract — not an implementation detail.
  it('returns the structured investigation result alongside the three query results', async () => {
    const service = makeService();

    const result = await service.investigateApp('ws-test', 'func-dev-acme', 'P7D', true, 30, true);

    expect(result).toMatchObject({
      appNamePattern: 'func-dev-acme',
      timespan: 'P7D',
      deduplicate: true,
      includeDetails: true,
      detailsLimit: 30,
    });
    expect(result.exceptionSummary.tables).toHaveLength(1);
    expect(result.traceSeverity.tables).toHaveLength(1);
    expect(result.recentErrors?.tables).toHaveLength(1);
    expect(mockedPost).toHaveBeenCalledTimes(3);
  });

  it('skips the recent-errors query and returns null when details are excluded', async () => {
    const service = makeService();

    const result = await service.investigateApp('ws-test', undefined, 'PT1H', false, 20, true);

    expect(result.recentErrors).toBeNull();
    expect(result.includeDetails).toBe(false);
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  it('applies the app-name filter to every query', async () => {
    const service = makeService();

    await service.investigateApp('ws-test', 'func-dev-acme', 'PT1H', true, 20, true);

    const queries = mockedPost.mock.calls.map((c) => (c[1] as any).query);
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query).toContain('| where AppRoleName contains "func-dev-acme"');
    }
  });

  it('omits the filter clause entirely when no app-name pattern is given', async () => {
    const service = makeService();

    await service.investigateApp('ws-test');

    const queries = mockedPost.mock.calls.map((c) => (c[1] as any).query);
    for (const query of queries) {
      expect(query).not.toContain('AppRoleName contains');
    }
  });

  it('drops the OperationId grouping when deduplication is disabled', async () => {
    const service = makeService();

    await service.investigateApp('ws-test', undefined, 'PT1H', true, 20, false);

    const queries = mockedPost.mock.calls.map((c) => (c[1] as any).query);
    for (const query of queries) {
      expect(query).not.toContain('by OperationId');
    }
  });

  it('defaults to a deduplicated PT1H investigation with details', async () => {
    const service = makeService();

    const result = await service.investigateApp('ws-test');

    expect(result).toMatchObject({
      timespan: 'PT1H',
      deduplicate: true,
      includeDetails: true,
      detailsLimit: 20,
    });
    expect((mockedPost.mock.calls[0][1] as any).timespan).toBe('PT1H');
  });
});

/**
 * D21: `getFunctionStats` grouped by the raw `FunctionName`, so one function arriving under
 * its bare name, a `Functions.`-prefixed variant and a blank-named host row became three
 * rows and roughly three times the executions. The failure case is that the inflated table
 * and a genuinely three-function workspace looked identical.
 */
describe('LogAnalyticsService.getFunctionStats name normalisation', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  const statsResponse = (rows: unknown[][]) => ({
    data: {
      tables: [
        {
          name: 'PrimaryResult',
          columns: [
            { name: 'FunctionName', type: 'string' },
            { name: 'TotalExecutions', type: 'long' },
            { name: 'ErrorCount', type: 'long' },
            { name: 'SuccessCount', type: 'long' },
            { name: 'UniqueHosts', type: 'long' },
            { name: 'SuccessRate', type: 'real' },
          ],
          rows,
        },
      ],
    },
  });

  it('collapses the name variants of one function, and says that it did', async () => {
    mockedPost.mockResolvedValueOnce(
      statsResponse([
        ['ProcessOrders', 1000, 10, 990, 3, 99],
        ['Functions.ProcessOrders', 1000, 10, 990, 3, 99],
        ['', 1000, 10, 990, 3, 99],
      ])
    );

    const result: any = await makeService().getFunctionStats('ws-test');

    expect(result.tables[0].rows).toHaveLength(1);
    expect(result.tables[0].rows[0][1]).toBe(1000);
    expect(result.normalization.rawRows).toBe(3);
    expect(result.normalization.rows).toBe(1);
    expect(result.normalization.note).toBeDefined();
  });

  it('a genuinely three-function workspace is not mistaken for an inflated one', async () => {
    mockedPost.mockResolvedValueOnce(
      statsResponse([
        ['ProcessOrders', 1000, 10, 990, 3, 99],
        ['SendReceipts', 500, 0, 500, 2, 100],
        ['ReconcileLedger', 250, 5, 245, 1, 98],
      ])
    );

    const result: any = await makeService().getFunctionStats('ws-test');

    expect(result.tables[0].rows).toHaveLength(3);
    expect(result.normalization.collapsed).toEqual([]);
    expect(result.normalization.note).toBeUndefined();
  });

  it('no longer asks for UniqueFunctions, which was always 1 inside a by-FunctionName group', async () => {
    mockedPost.mockResolvedValueOnce(statsResponse([]));

    await makeService().getFunctionStats('ws-test');

    expect((mockedPost.mock.calls[0][1] as any).query).not.toContain('UniqueFunctions');
  });

  it('leaves a single-function query aggregated, with no normalisation block', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        tables: [
          {
            name: 'PrimaryResult',
            columns: [
              { name: 'TotalExecutions', type: 'long' },
              { name: 'ErrorCount', type: 'long' },
            ],
            rows: [[43445, 120]],
          },
        ],
      },
    });

    const result: any = await makeService().getFunctionStats('ws-test', 'ProcessOrders');

    expect(result.tables[0].rows).toEqual([[43445, 120]]);
    expect(result.normalization).toBeUndefined();
  });
});

describe('LogAnalyticsService.executeQuery 400 handling', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  const badRequest = (error?: { code?: string; message: string }) => ({
    response: { status: 400, data: error ? { error } : undefined, headers: {} },
  });

  // An assurance run saw two "Bad request" failures in ~180 query invocations, both of
  // which succeeded unchanged on immediate retry. Neither could be classified afterwards,
  // because the branch that produced the message computed ARM's error code into a local
  // and then discarded it. Carrying the code is what makes the next occurrence
  // diagnosable; guessing a retry would only hide it.
  it("carries ARM's error code, so a transient 400 can be told from a malformed query", async () => {
    mockedPost.mockRejectedValueOnce(
      badRequest({ code: 'BadArgumentError', message: 'The request had an invalid argument' })
    );
    const service = makeService();

    await expect(service.executeQuery('ws-test', 'AppTraces | take 1')).rejects.toThrow(
      /BadArgumentError/
    );
  });

  it('says so when ARM sent no code at all, rather than printing undefined', async () => {
    mockedPost.mockRejectedValueOnce(badRequest({ message: 'Something went wrong' }));
    const service = makeService();

    const error = await service
      .executeQuery('ws-test', 'AppTraces | take 1')
      .catch((e: Error) => e);

    expect(error.message).not.toMatch(/undefined/);
    expect(error.message).toMatch(/Something went wrong/);
  });

  it('still gives the KQL-specific message for a SyntaxError, code and all', async () => {
    mockedPost.mockRejectedValueOnce(
      badRequest({ code: 'SyntaxError', message: "Query could not be parsed at 'wher'" })
    );
    const service = makeService();

    await expect(service.executeQuery('ws-test', 'AppTraces | wher x')).rejects.toThrow(
      /KQL syntax error: Query could not be parsed/
    );
  });

  // Pins a decision rather than a fix: a 400 is normally deterministic, so retrying one
  // would mask a genuinely malformed query for every caller in order to paper over a
  // failure nobody has yet identified. Whoever adds a retry policy here has to change
  // this test on purpose.
  it('does not retry a 400', async () => {
    mockedPost.mockRejectedValueOnce(badRequest({ code: 'SemanticError', message: 'No table' }));
    const service = makeService();

    await expect(service.executeQuery('ws-test', 'Nope | take 1')).rejects.toThrow();
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});
