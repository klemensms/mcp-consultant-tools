import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { LogAnalyticsService } from '../log-analytics-service.js';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const mockedPost = vi.mocked(axios.post);

function makeService(): LogAnalyticsService {
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
    ],
  });
}

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
