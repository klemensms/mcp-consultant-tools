/**
 * The two per-item failures `TestService` dropped without recording.
 *
 * `createTestRun` links each test case to the run with a hyperlink update. A case that
 * failed to link logged to stderr and the run was returned as if it had been created
 * cleanly, so a run missing half its cases was indistinguishable from a complete one.
 *
 * `getTestCaseHistory` walks the last 100 completed runs and reads each one's results. A
 * run whose results could not be read was skipped, so the returned history was silently
 * short - which reads as "this case has not been run recently" rather than "some runs
 * could not be checked".
 *
 * Both tests are PAIRS at the same visible count, because the count is the only part a
 * reader quotes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { AzureDevOpsClient } from '../../azure-devops-client.js';
import { TestService } from '../test-service.js';
import type { WorkItemService } from '../work-item-service.js';

vi.mock('axios', () => ({ default: vi.fn() }));
const mockedAxios = vi.mocked(axios);

function makeService(workItem: Partial<WorkItemService> = {}): TestService {
  const client = new AzureDevOpsClient(
    { organization: 'org', projects: ['MyProject'] } as any,
    { mode: 'pat', pat: 'fake-pat' },
  );
  return new TestService(client, workItem as WorkItemService);
}

describe('TestService.createTestRun test-case linking', () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  it('a run with an unlinked case and a run with fewer cases are not equal', async () => {
    const runCreated = {
      data: { id: 123456, name: 'Nightly', url: 'u', webAccessUrl: 'w' },
    } as any;

    mockedAxios.mockResolvedValue(runCreated);

    const unlinkable = new Set([1235]);
    const withFailure = makeService({
      updateWorkItem: vi.fn(async (_p: string, id: number) => {
        if (unlinkable.has(id)) throw new Error('TF401232: work item does not exist');
        return {} as any;
      }),
    });

    const withoutFailure = makeService({
      updateWorkItem: vi.fn(async () => ({}) as any),
    });

    const partial = await withFailure.createTestRun('MyProject', 'Nightly', {
      testCaseIds: [1234, 1235, 1236],
    });

    mockedAxios.mockResolvedValue(runCreated);
    const complete = await withoutFailure.createTestRun('MyProject', 'Nightly', {
      testCaseIds: [1234, 1236],
    });

    // Two cases actually linked in both. The old return said nothing either way.
    expect(partial.linkedTestCases.succeeded).toBe(2);
    expect(complete.linkedTestCases.succeeded).toBe(2);

    expect(partial.linkedTestCases).not.toEqual(complete.linkedTestCases);
    expect(partial.linkedTestCases.attempted).toBe(3);
    expect(partial.linkedTestCases.failed).toBe(1);
    expect(partial.linkedTestCases.failures[0].item).toBe('1235');
    expect(partial.linkedTestCases.failures[0].reason).toContain('TF401232');
    expect(complete.linkedTestCases.failed).toBe(0);
  });

  it('reports no linking attempts rather than a clean run when no cases were given', async () => {
    mockedAxios.mockResolvedValue({
      data: { id: 123456, name: 'Nightly', url: 'u', webAccessUrl: 'w' },
    } as any);

    const result = await makeService().createTestRun('MyProject', 'Nightly');

    expect(result.linkedTestCases.attempted).toBe(0);
    expect(result.linkedTestCases.failed).toBe(0);
  });
});

describe('TestService.getTestCaseHistory', () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  /** One completed run, plus the results payload the history walk reads from it. */
  const runsPage = (ids: number[]) => ({
    data: {
      value: ids.map((id) => ({
        id,
        name: `Run ${id}`,
        completedDate: `2026-08-${String(id).padStart(2, '0')}T09:00:00Z`,
        webAccessUrl: `https://dev.azure.com/org/MyProject/_testManagement/runs?runId=${id}`,
      })),
    },
  } as any);

  const resultsFor = (testCaseId: number) => ({
    data: { value: [{ testCase: { id: testCaseId }, outcome: 'Passed' }] },
  } as any);

  it('a history short by an unreadable run and a genuinely shorter one are not equal', async () => {
    // Three runs, the middle one 403s on its results.
    mockedAxios
      .mockResolvedValueOnce(runsPage([11, 12, 13]))
      .mockResolvedValueOnce(resultsFor(1234))
      .mockRejectedValueOnce(new Error('TF400813: access denied on run 12'))
      .mockResolvedValueOnce(resultsFor(1234));

    const partial = await makeService().getTestCaseHistory('MyProject', 1234);

    // Two runs, both readable.
    mockedAxios
      .mockResolvedValueOnce(runsPage([11, 13]))
      .mockResolvedValueOnce(resultsFor(1234))
      .mockResolvedValueOnce(resultsFor(1234));

    const complete = await makeService().getTestCaseHistory('MyProject', 1234);

    expect(partial.history).toHaveLength(2);
    expect(complete.history).toHaveLength(2);

    expect(partial.fanOut).not.toEqual(complete.fanOut);
    expect(partial.fanOut.attempted).toBe(3);
    expect(partial.fanOut.failed).toBe(1);
    expect(partial.fanOut.failures[0].item).toBe('Run 12');
    expect(partial.fanOut.failures[0].reason).toContain('TF400813');
    expect(complete.fanOut.failed).toBe(0);
  });
});
