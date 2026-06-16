/**
 * Test Management Tools - 7 tools for test runs, results, and linking
 *
 * Tools: create-test-run, add-test-results, complete-test-run,
 *        get-test-runs, get-test-run-results, get-test-case-history,
 *        link-test-case
 *
 * Uses _apis/test/ (Basic license), not _apis/testplan/ (requires Test Plans license).
 * All runs set isAutomated: true to bypass the Test Plan requirement.
 */
import { z } from 'zod';
import { zCoerceNumber, zCoerceNumberArray } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  TEST_OUTCOME_EXAMPLES,
  TEST_RUN_NAME_EXAMPLES,
  TEST_RUN_STATE_EXAMPLES,
  AUTOMATED_TEST_NAME_EXAMPLES,
} from '../tool-examples.js';

export function registerTestTools(server: any, ctx: ServiceContext): void {

  // ── Core: Test Run Lifecycle ─────────────────────────────────────

  server.tool(
    "create-test-run",
    "Create an automated test run in Azure DevOps. Sets isAutomated=true automatically (no Test Plan license needed). " +
    "Optionally links test case work items to the run via hyperlinks (ADO has no native artifact link for test runs).",
    {
      project: z.string().describe("Project name"),
      name: z.string().describe(
        descWithExamples("Run name — include story ID and date for traceability", TEST_RUN_NAME_EXAMPLES)
      ),
      comment: z.string().optional().describe("Run description/context"),
      testCaseIds: zCoerceNumberArray().optional().describe(
        "Test Case work item IDs to link to this run (adds hyperlink from each test case to the run URL)"
      ),
      buildId: zCoerceNumber().optional().describe("Build ID if run is tied to a pipeline"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, name, comment, testCaseIds, buildId }: any) => {
      try {
        const result = await ctx.test.createTestRun(project, name, { comment, testCaseIds, buildId });
        return {
          content: [{
            type: "text",
            text: `Created test run #${result.runId}: "${result.name}"\n` +
                  `URL: ${result.webAccessUrl}\n` +
                  (testCaseIds?.length ? `Linked ${testCaseIds.length} test case(s) via hyperlink\n` : '') +
                  `\nNext: Use add-test-results to record outcomes, then complete-test-run to finish.`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to create test run: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "add-test-results",
    "Add test results to an existing test run. Each result represents one test step or test case with pass/fail outcome.",
    {
      project: z.string().describe("Project name"),
      runId: zCoerceNumber().describe("Test run ID (from create-test-run)"),
      results: z.array(z.object({
        title: z.string().describe("Test step/case title"),
        outcome: z.string().describe(
          descWithExamples("Test outcome", TEST_OUTCOME_EXAMPLES)
        ),
        comment: z.string().optional().describe("What happened — actual values, error messages, assertions"),
        testCaseId: zCoerceNumber().optional().describe("Link to Test Case work item ID"),
        automatedTestName: z.string().optional().describe(
          descWithExamples("Dot-notation test name for filtering/grouping", AUTOMATED_TEST_NAME_EXAMPLES)
        ),
      })).describe("Array of test results to add"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, runId, results }: any) => {
      try {
        const result = await ctx.test.addTestResults(project, runId, results);
        const passed = results.filter((r: any) => r.outcome === 'Passed').length;
        const failed = results.filter((r: any) => r.outcome === 'Failed').length;
        return {
          content: [{
            type: "text",
            text: `Added ${result.count} result(s) to run #${runId}\n` +
                  `Passed: ${passed}, Failed: ${failed}, Other: ${result.count - passed - failed}\n` +
                  `\nResults:\n${result.results.map((r: any) => `  ${r.outcome === 'Passed' ? 'PASS' : r.outcome === 'Failed' ? 'FAIL' : r.outcome} — ${r.title}`).join('\n')}`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to add test results: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "complete-test-run",
    "Mark a test run as completed. Returns summary with pass/fail counts.",
    {
      project: z.string().describe("Project name"),
      runId: zCoerceNumber().describe("Test run ID"),
      comment: z.string().optional().describe("Completion summary"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, runId, comment }: any) => {
      try {
        const result = await ctx.test.completeTestRun(project, runId, comment);
        return {
          content: [{
            type: "text",
            text: `Test run #${result.runId} completed\n` +
                  `State: ${result.state}\n` +
                  `Total: ${result.totalTests}, Passed: ${result.passedTests}, Failed: ${result.failedTests}, Other: ${result.totalTests - result.passedTests - result.failedTests}\n` +
                  `URL: ${result.url}`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to complete test run: ${error.message}` }], isError: true };
      }
    }
  );

  // ── Query: Test History ──────────────────────────────────────────

  server.tool(
    "get-test-runs",
    "List test runs in a project, optionally filtered by state and date.",
    {
      project: z.string().describe("Project name"),
      state: z.string().optional().describe(
        descWithExamples("Filter by run state", TEST_RUN_STATE_EXAMPLES)
      ),
      maxRuns: zCoerceNumber().optional().describe("Maximum runs to return (default: 25)"),
      fromDate: z.string().optional().describe("Filter runs updated after this date (ISO format, e.g., '2026-04-01')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, state, maxRuns, fromDate }: any) => {
      try {
        const runs = await ctx.test.getTestRuns(project, { state, maxRuns, fromDate });
        if (runs.length === 0) {
          return { content: [{ type: "text", text: `No test runs found in ${project}${state ? ` with state ${state}` : ''}` }] };
        }
        const lines = runs.map(r =>
          `#${r.runId} — ${r.name} [${r.state}] (${r.passedTests}/${r.totalTests} passed)${r.completedDate ? ` — ${r.completedDate.split('T')[0]}` : ''}`
        );
        return {
          content: [{
            type: "text",
            text: `Test runs in ${project} (${runs.length}):\n\n${lines.join('\n')}`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to get test runs: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-test-run-results",
    "Get detailed results for a specific test run.",
    {
      project: z.string().describe("Project name"),
      runId: zCoerceNumber().describe("Test run ID"),
      outcome: z.string().optional().describe(
        descWithExamples("Filter by outcome", TEST_OUTCOME_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, runId, outcome }: any) => {
      try {
        const results = await ctx.test.getTestRunResults(project, runId, outcome);
        if (results.length === 0) {
          return { content: [{ type: "text", text: `No results found for run #${runId}${outcome ? ` with outcome ${outcome}` : ''}` }] };
        }
        const lines = results.map(r =>
          `${r.outcome === 'Passed' ? 'PASS' : r.outcome === 'Failed' ? 'FAIL' : r.outcome} — ${r.title}${r.comment ? ` (${r.comment})` : ''}${r.testCaseId ? ` [TC#${r.testCaseId}]` : ''}`
        );
        return {
          content: [{
            type: "text",
            text: `Results for run #${runId} (${results.length}):\n\n${lines.join('\n')}`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to get test run results: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-test-case-history",
    "Get test run history for a specific Test Case work item. Shows when it was last run and what the outcome was. " +
    "Searches recent completed runs for results referencing this test case.",
    {
      project: z.string().describe("Project name"),
      testCaseId: zCoerceNumber().describe("Test Case work item ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, testCaseId }: any) => {
      try {
        const history = await ctx.test.getTestCaseHistory(project, testCaseId);
        if (history.length === 0) {
          return { content: [{ type: "text", text: `No test run history found for Test Case #${testCaseId}` }] };
        }
        const lines = history.map(h =>
          `${h.outcome === 'Passed' ? 'PASS' : h.outcome === 'Failed' ? 'FAIL' : h.outcome} — Run #${h.runId} "${h.runName}" (${h.completedDate.split('T')[0]})`
        );
        return {
          content: [{
            type: "text",
            text: `Test history for Test Case #${testCaseId} (${history.length} runs):\n\n${lines.join('\n')}`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to get test case history: ${error.message}` }], isError: true };
      }
    }
  );

  // ── Linking: Test Case ↔ Story ↔ Run ──────────────────────────

  server.tool(
    "link-test-case",
    "Link a test case to a user story (TestedBy relation) and/or a test run (Hyperlink). " +
    "Idempotent — skips if link already exists. " +
    "Story link uses Microsoft.VSTS.Common.TestedBy. Run link uses Hyperlink (ADO has no artifact link for test runs).",
    {
      project: z.string().describe("Project name"),
      testCaseId: zCoerceNumber().describe("Test Case work item ID"),
      storyId: zCoerceNumber().optional().describe("User Story ID to link via Tests/Tested By relation"),
      runId: zCoerceNumber().optional().describe("Test Run ID to link via hyperlink"),
      runSummary: z.string().optional().describe("Comment for the run hyperlink (e.g., '8/8 Passed')"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, testCaseId, storyId, runId, runSummary }: any) => {
      try {
        if (!storyId && !runId) {
          return { content: [{ type: "text", text: "Provide at least one of storyId or runId to link" }], isError: true };
        }
        const result = await ctx.test.linkTestCase(project, testCaseId, { storyId, runId, runSummary });
        return {
          content: [{
            type: "text",
            text: `Test Case #${testCaseId} linking:\n${result.linked.map(l => `  ${l}`).join('\n')}`,
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Failed to link test case: ${error.message}` }], isError: true };
      }
    }
  );

}
