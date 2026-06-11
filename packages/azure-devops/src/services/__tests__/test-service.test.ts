import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { AzureDevOpsClient } from '../../azure-devops-client.js';
import { TestService } from '../test-service.js';
import type { WorkItemService } from '../work-item-service.js';

// The client calls axios as a function: axios({ method, url, headers, data }).
vi.mock('axios', () => ({ default: vi.fn() }));
const mockedAxios = vi.mocked(axios);

function makeService(): TestService {
  const client = new AzureDevOpsClient(
    { organization: 'org', projects: ['MyProject'] } as any,
    { mode: 'pat', pat: 'fake-pat' },
  );
  return new TestService(client, {} as unknown as WorkItemService);
}

describe('TestService.completeTestRun', () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  // Regression: completeTestRun PATCHes _apis/test/runs/{id}, which expects a plain
  // JSON merge body. The client defaults PATCH to application/json-patch+json (correct
  // for work-item JSON-Patch updates), and the Test Runs Update endpoint rejected that
  // with HTTP 415 (TF400898). The fix overrides Content-Type to application/json.
  it('sends Content-Type application/json (not json-patch) on the run-state PATCH', async () => {
    mockedAxios
      // 1: run-state PATCH
      .mockResolvedValueOnce({
        data: { id: 123456, state: 'Completed', totalTests: 7, passedTests: 0, unanalyzedTests: 0 },
      } as any)
      // 2: GET results (used to aggregate counts)
      .mockResolvedValueOnce({ data: { value: [] } } as any);

    const service = makeService();
    const result = await service.completeTestRun('MyProject', 123456, 'done');

    const cfg = mockedAxios.mock.calls[0][0] as any;
    expect(cfg.method).toBe('PATCH');
    expect(cfg.url).toContain('/MyProject/_apis/test/runs/123456');
    expect(cfg.headers['Content-Type']).toBe('application/json');
    expect(cfg.data).toEqual({ state: 'Completed', comment: 'done' });

    expect(result.state).toBe('Completed');
  });

  // Regression: the run-state PATCH response returns passed/failed aggregates as 0 for
  // these Basic-license automated runs (ADO recomputes them lazily), so the summary used
  // to always report "Passed: 0, Failed: 0". The counts are now aggregated from the
  // per-result outcomes via a follow-up GET on the run's results.
  it('aggregates pass/fail counts from per-result outcomes, not the PATCH response', async () => {
    mockedAxios
      // 1: run-state PATCH — passed/failed come back 0 (the ADO quirk being worked around)
      .mockResolvedValueOnce({
        data: { id: 123456, state: 'Completed', totalTests: 7, passedTests: 0, unanalyzedTests: 0 },
      } as any)
      // 2: GET results — the source of truth: 4 Passed, 3 NotExecuted, 0 Failed
      .mockResolvedValueOnce({
        data: {
          value: [
            { id: 1, testCaseTitle: 'a', outcome: 'Passed' },
            { id: 2, testCaseTitle: 'b', outcome: 'Passed' },
            { id: 3, testCaseTitle: 'c', outcome: 'Passed' },
            { id: 4, testCaseTitle: 'd', outcome: 'Passed' },
            { id: 5, testCaseTitle: 'e', outcome: 'NotExecuted' },
            { id: 6, testCaseTitle: 'f', outcome: 'NotExecuted' },
            { id: 7, testCaseTitle: 'g', outcome: 'NotExecuted' },
          ],
        },
      } as any);

    const service = makeService();
    const result = await service.completeTestRun('MyProject', 123456, 'done');

    const resultsCfg = mockedAxios.mock.calls[1][0] as any;
    expect(resultsCfg.method).toBe('GET');
    expect(resultsCfg.url).toContain('/MyProject/_apis/test/runs/123456/results');

    expect(result.totalTests).toBe(7);
    expect(result.passedTests).toBe(4);
    expect(result.failedTests).toBe(0);
  });
});
