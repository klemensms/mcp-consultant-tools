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
