/**
 * Test Service - ADO Test Management API
 *
 * Uses _apis/test/ (not _apis/testplan/) to avoid Azure Test Plans license requirement.
 * All runs are created with isAutomated: true to bypass the Test Plan requirement.
 */

import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { WorkItemService } from './work-item-service.js';

export class TestService {
  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly workItem: WorkItemService,
  ) {}

  /**
   * Create a test run. Always sets isAutomated: true (no Test Plan needed).
   * Optionally links test cases to the run via hyperlinks.
   */
  async createTestRun(
    project: string,
    name: string,
    options?: {
      comment?: string;
      testCaseIds?: number[];
      buildId?: number;
    }
  ): Promise<{ runId: number; name: string; url: string; webAccessUrl: string }> {
    this.client.validateProject(project);

    const body: any = {
      name,
      isAutomated: true,
    };
    if (options?.comment) body.comment = options.comment;
    if (options?.buildId) body.build = { id: options.buildId };

    const response = await this.client.post<any>(
      `${project}/_apis/test/runs?api-version=7.0`,
      body
    );

    const runId = response.id;
    const webAccessUrl = response.webAccessUrl ||
      `https://dev.azure.com/${this.client.organization}/${encodeURIComponent(project)}/_testManagement/runs?runId=${runId}&_a=runCharts`;

    // Link test cases to run via hyperlinks (workaround for missing artifact link support)
    if (options?.testCaseIds && options.testCaseIds.length > 0) {
      const dateStr = new Date().toISOString().split('T')[0];
      for (const testCaseId of options.testCaseIds) {
        try {
          await this.workItem.updateWorkItem(project, testCaseId, [
            {
              op: 'add',
              path: '/relations/-',
              value: {
                rel: 'Hyperlink',
                url: webAccessUrl,
                attributes: { comment: `Test Run #${runId} — ${name} (${dateStr})` },
              },
            },
          ]);
        } catch (err: any) {
          // Non-fatal: log but don't fail the run creation
          console.error(`Warning: failed to link test case #${testCaseId} to run #${runId}: ${err.message}`);
        }
      }
    }

    return {
      runId,
      name: response.name,
      url: response.url,
      webAccessUrl,
    };
  }

  /**
   * Add test results to an existing run.
   */
  async addTestResults(
    project: string,
    runId: number,
    results: Array<{
      title: string;
      outcome: string;
      comment?: string;
      testCaseId?: number;
      automatedTestName?: string;
    }>
  ): Promise<{ count: number; results: Array<{ id: number; title: string; outcome: string }> }> {
    this.client.validateProject(project);

    const body = results.map(r => {
      const result: any = {
        testCaseTitle: r.title,
        outcome: r.outcome,
        automatedTestName: r.automatedTestName || r.title,
        automatedTestStorage: 'mcp-test',
      };
      if (r.comment) result.comment = r.comment;
      if (r.testCaseId) result.testCase = { id: r.testCaseId };
      return result;
    });

    const response = await this.client.post<any>(
      `${project}/_apis/test/runs/${runId}/results?api-version=7.0`,
      body
    );

    const resultItems = Array.isArray(response) ? response :
      (response.value || response.results || [response]);

    return {
      count: resultItems.length,
      results: resultItems.map((r: any) => ({
        id: r.id,
        title: r.testCaseTitle || r.title,
        outcome: r.outcome,
      })),
    };
  }

  /**
   * Mark a test run as completed.
   */
  async completeTestRun(
    project: string,
    runId: number,
    comment?: string
  ): Promise<{ runId: number; state: string; totalTests: number; passedTests: number; failedTests: number; url: string }> {
    this.client.validateProject(project);

    const body: any = { state: 'Completed' };
    if (comment) body.comment = comment;

    // Test Runs - Update expects a plain JSON merge body, NOT JSON-Patch. The client
    // defaults PATCH to application/json-patch+json (correct for work-item updates),
    // which this endpoint rejects with HTTP 415 (TF400898). Override to application/json.
    const response = await this.client.patch<any>(
      `${project}/_apis/test/runs/${runId}?api-version=7.0`,
      body,
      { 'Content-Type': 'application/json' }
    );

    // The run-state PATCH response does not reliably populate the pass/fail aggregate
    // counts for these Basic-license automated runs — they come back 0 (ADO recomputes
    // them lazily). Aggregate from the actual per-result outcomes instead, the same way
    // add-test-results reports its counts.
    const results = await this.getTestRunResults(project, runId);
    const passedTests = results.filter(r => r.outcome === 'Passed').length;
    const failedTests = results.filter(r => r.outcome === 'Failed').length;

    return {
      runId: response.id,
      state: response.state,
      totalTests: results.length,
      passedTests,
      failedTests,
      url: response.webAccessUrl || response.url,
    };
  }

  /**
   * List test runs, optionally filtered by state and date.
   */
  async getTestRuns(
    project: string,
    options?: {
      state?: string;
      maxRuns?: number;
      fromDate?: string;
    }
  ): Promise<Array<{ runId: number; name: string; state: string; totalTests: number; passedTests: number; failedTests: number; completedDate: string; url: string }>> {
    this.client.validateProject(project);

    const params: string[] = ['api-version=7.0'];
    const maxRuns = options?.maxRuns ?? 25;
    params.push(`$top=${maxRuns}`);
    if (options?.state) params.push(`state=${options.state}`);
    if (options?.fromDate) params.push(`minLastUpdatedDate=${options.fromDate}`);

    const response = await this.client.get<any>(
      `${project}/_apis/test/runs?${params.join('&')}`
    );

    return (response.value || []).map((r: any) => ({
      runId: r.id,
      name: r.name,
      state: r.state,
      totalTests: r.totalTests ?? 0,
      passedTests: r.passedTests ?? 0,
      failedTests: r.unanalyzedTests ?? 0,
      completedDate: r.completedDate || '',
      url: r.webAccessUrl || r.url,
    }));
  }

  /**
   * Get results for a specific test run.
   */
  async getTestRunResults(
    project: string,
    runId: number,
    outcome?: string
  ): Promise<Array<{ resultId: number; title: string; outcome: string; comment: string; testCaseId: number | null; duration: number }>> {
    this.client.validateProject(project);

    let endpoint = `${project}/_apis/test/runs/${runId}/results?api-version=7.0`;
    if (outcome) endpoint += `&outcomes=${outcome}`;

    const response = await this.client.get<any>(endpoint);

    return (response.value || []).map((r: any) => ({
      resultId: r.id,
      title: r.testCaseTitle || r.automatedTestName || '',
      outcome: r.outcome,
      comment: r.comment || '',
      testCaseId: r.testCase?.id || null,
      duration: r.durationInMs ?? 0,
    }));
  }

  /**
   * Get test run history for a specific test case.
   * Queries recent runs and filters results by testCase.id.
   */
  async getTestCaseHistory(
    project: string,
    testCaseId: number
  ): Promise<Array<{ runId: number; runName: string; outcome: string; completedDate: string; url: string }>> {
    this.client.validateProject(project);

    // Get recent completed runs (last 100)
    const runsResponse = await this.client.get<any>(
      `${project}/_apis/test/runs?api-version=7.0&state=Completed&$top=100`
    );

    const runs = runsResponse.value || [];
    const history: Array<{ runId: number; runName: string; outcome: string; completedDate: string; url: string }> = [];

    // Check each run for results referencing this test case
    for (const run of runs) {
      try {
        const resultsResponse = await this.client.get<any>(
          `${project}/_apis/test/runs/${run.id}/results?api-version=7.0`
        );
        const results = resultsResponse.value || [];
        const match = results.find((r: any) => r.testCase?.id === testCaseId);
        if (match) {
          history.push({
            runId: run.id,
            runName: run.name,
            outcome: match.outcome,
            completedDate: run.completedDate || '',
            url: run.webAccessUrl || run.url,
          });
        }
      } catch {
        // Skip runs we can't read results for
      }
    }

    // Sort by completedDate descending
    history.sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
    return history;
  }

  /**
   * Link a test case to a user story (TestedBy) and/or a test run (Hyperlink).
   * Idempotent — checks existing relations before adding.
   */
  async linkTestCase(
    project: string,
    testCaseId: number,
    options: {
      storyId?: number;
      runId?: number;
      runSummary?: string;
    }
  ): Promise<{ linked: string[] }> {
    this.client.validateProject(project);

    const linked: string[] = [];

    // Get existing relations to check for duplicates
    const workItemResponse = await this.client.get<any>(
      `${project}/_apis/wit/workitems/${testCaseId}?$expand=relations&api-version=${this.client.apiVersion}`
    );
    const existingRelations = workItemResponse.relations || [];

    // Link to story via TestedBy-Reverse (test case → story)
    if (options.storyId) {
      const storyUrl = `${this.client.baseUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${options.storyId}`;
      const alreadyLinked = existingRelations.some(
        (r: any) => r.rel === 'Microsoft.VSTS.Common.TestedBy-Reverse' && r.url?.includes(`/${options.storyId}`)
      );
      if (!alreadyLinked) {
        await this.workItem.updateWorkItem(project, testCaseId, [
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
              url: storyUrl,
            },
          },
        ]);
        linked.push(`TestedBy → Story #${options.storyId}`);
      } else {
        linked.push(`TestedBy → Story #${options.storyId} (already exists)`);
      }
    }

    // Link to run via Hyperlink (no artifact link support for test runs)
    if (options.runId) {
      const runUrl = `https://dev.azure.com/${this.client.organization}/${encodeURIComponent(project)}/_testManagement/runs?runId=${options.runId}&_a=runCharts`;
      const alreadyLinked = existingRelations.some(
        (r: any) => r.rel === 'Hyperlink' && r.url === runUrl
      );
      if (!alreadyLinked) {
        const comment = options.runSummary
          ? `Test Run #${options.runId} — ${options.runSummary}`
          : `Test Run #${options.runId}`;
        await this.workItem.updateWorkItem(project, testCaseId, [
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'Hyperlink',
              url: runUrl,
              attributes: { comment },
            },
          },
        ]);
        linked.push(`Hyperlink → Run #${options.runId}`);
      } else {
        linked.push(`Hyperlink → Run #${options.runId} (already exists)`);
      }
    }

    return { linked };
  }
}
