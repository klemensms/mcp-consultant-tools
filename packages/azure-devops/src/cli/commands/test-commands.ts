/**
 * Test Management CLI Commands - 7 commands for test runs, results, and linking
 */

import type { Command } from 'commander';
import { fanOutSuffix, getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerTestCommands(program: Command, ctx: ServiceContext): void {
  const test = program.command('test').description('Test management operations');

  test
    .command('create-run')
    .description('Create a test run (automated, no Test Plan needed)')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Run name')
    .option('-c, --comment <text>', 'Run description')
    .option('--test-case-ids <ids>', 'Comma-separated Test Case work item IDs to link', (v: string) => v.split(',').map(Number))
    .option('--build-id <id>', 'Build ID', parseInt)
    .action(async (project: string, name: string, opts: any) => {
      try {
        const result = await ctx.test.createTestRun(project, name, {
          comment: opts.comment,
          testCaseIds: opts.testCaseIds,
          buildId: opts.buildId,
        });
        outputResult(
          { persist: false, fileName: `test-run-${result.runId}`, data: result, summary: `Created test run #${result.runId}: ${result.name}\nURL: ${result.webAccessUrl}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create test run'); }
    });

  test
    .command('add-results')
    .description('Add test results to an existing run')
    .argument('<project>', 'Project name')
    .argument('<runId>', 'Test run ID')
    .argument('<results>', 'JSON array of results: [{"title":"...","outcome":"Passed|Failed","comment":"..."}]')
    .action(async (project: string, runId: string, resultsJson: string) => {
      try {
        const results = JSON.parse(resultsJson);
        const result = await ctx.test.addTestResults(project, parseInt(runId), results);
        outputResult(
          { persist: false, fileName: `test-results-run-${runId}`, data: result, summary: `Added ${result.count} result(s) to run #${runId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'add test results'); }
    });

  test
    .command('complete-run')
    .description('Mark a test run as completed')
    .argument('<project>', 'Project name')
    .argument('<runId>', 'Test run ID')
    .option('-c, --comment <text>', 'Completion summary')
    .action(async (project: string, runId: string, opts: any) => {
      try {
        const result = await ctx.test.completeTestRun(project, parseInt(runId), opts.comment);
        outputResult(
          { persist: false, fileName: `test-run-${runId}-complete`, data: result, summary: `Run #${result.runId}: ${result.state} — ${result.passedTests}/${result.totalTests} passed` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'complete test run'); }
    });

  test
    .command('list-runs')
    .description('List test runs')
    .argument('<project>', 'Project name')
    .option('-s, --state <state>', 'Filter by state: InProgress, Completed, Aborted')
    .option('-n, --max-runs <n>', 'Max runs to return', '25')
    .option('--from-date <date>', 'Filter runs after this date (ISO format)')
    .action(async (project: string, opts: any) => {
      try {
        const runs = await ctx.test.getTestRuns(project, {
          state: opts.state,
          maxRuns: parseInt(opts.maxRuns),
          fromDate: opts.fromDate,
        });
        outputResult(
          { fileName: `test-runs-${project}`, data: runs, summary: `Found ${runs.length} test run(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list test runs'); }
    });

  test
    .command('run-results')
    .description('Get results for a specific test run')
    .argument('<project>', 'Project name')
    .argument('<runId>', 'Test run ID')
    .option('-o, --outcome <outcome>', 'Filter by outcome: Passed, Failed, NotExecuted, Blocked')
    .action(async (project: string, runId: string, opts: any) => {
      try {
        const results = await ctx.test.getTestRunResults(project, parseInt(runId), opts.outcome);
        outputResult(
          { fileName: `test-run-${runId}-results`, data: results, summary: `Found ${results.length} result(s) for run #${runId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get test run results'); }
    });

  test
    .command('case-history')
    .description('Get test run history for a Test Case work item')
    .argument('<project>', 'Project name')
    .argument('<testCaseId>', 'Test Case work item ID')
    .action(async (project: string, testCaseId: string) => {
      try {
        const result = await ctx.test.getTestCaseHistory(project, parseInt(testCaseId));
        outputResult(
          {
            fileName: `test-case-${testCaseId}-history`,
            data: result,
            summary:
              `Found ${result.history.length} run(s) for Test Case #${testCaseId}` +
              `${fanOutSuffix(result.fanOut)}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get test case history'); }
    });

  test
    .command('link-case')
    .description('Link a test case to a story (TestedBy) and/or test run (Hyperlink)')
    .argument('<project>', 'Project name')
    .argument('<testCaseId>', 'Test Case work item ID')
    .option('-s, --story-id <id>', 'User Story ID to link', parseInt)
    .option('-r, --run-id <id>', 'Test Run ID to link', parseInt)
    .option('--run-summary <text>', 'Comment for the run hyperlink')
    .action(async (project: string, testCaseId: string, opts: any) => {
      try {
        const result = await ctx.test.linkTestCase(project, parseInt(testCaseId), {
          storyId: opts.storyId,
          runId: opts.runId,
          runSummary: opts.runSummary,
        });
        outputResult(
          { persist: false, fileName: `test-case-${testCaseId}-link`, data: result, summary: `Linked: ${result.linked.join(', ')}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'link test case'); }
    });
}
