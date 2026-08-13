/**
 * Pipeline CLI Commands - pipeline CRUD, queue, cancel, retry, rename, approvals
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

/**
 * Parse a positive integer, throwing on anything else.
 *
 * Call this BEFORE reaching into `ctx`: the service getters construct a client
 * and throw on missing config, so a parse evaluated inside the service-call
 * argument list never runs, and a typo surfaces as a credentials error.
 */
function parsePipelinePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer, got '${value}'`);
  }
  return parsed;
}

export function registerPipelineCommands(program: Command, ctx: ServiceContext): void {
  const pipeline = program.command('pipeline').alias('pl').description('Pipeline operations');

  pipeline
    .command('list')
    .description('List all YAML pipeline definitions in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.pipelines.listPipelineDefinitions(project);
        outputResult(
          { fileName: `pipelines-${project}`, data: result, summary: `Pipeline definitions in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list pipelines'); }
    });

  pipeline
    .command('get')
    .description('Get detailed pipeline definition')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .action(async (project: string, definitionId: string) => {
      try {
        const result = await ctx.pipelines.getPipelineDefinition(project, parseInt(definitionId));
        outputResult(
          { fileName: `pipeline-${definitionId}`, data: result, summary: `Pipeline definition #${definitionId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get pipeline definition'); }
    });

  pipeline
    .command('yaml')
    .description('Get the YAML content for a pipeline definition')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .action(async (project: string, definitionId: string) => {
      try {
        const result = await ctx.pipelines.getPipelineYaml(project, parseInt(definitionId));
        outputResult(
          { fileName: `pipeline-yaml-${definitionId}`, data: result, summary: `Pipeline YAML for definition #${definitionId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get pipeline YAML'); }
    });

  pipeline
    .command('runs')
    .description('List recent pipeline runs for a definition')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .option('-t, --top <n>', 'Maximum number of results', '10')
    .action(async (project: string, definitionId: string, opts: any) => {
      try {
        const result = await ctx.pipelines.listPipelineRuns(project, parseInt(definitionId), parseInt(opts.top));
        outputResult(
          { fileName: `pipeline-runs-${definitionId}`, data: result, summary: `Recent runs for pipeline #${definitionId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list pipeline runs'); }
    });

  pipeline
    .command('approvals')
    .description('List pending pipeline approvals for a build')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID to check for pending approvals')
    .action(async (project: string, buildId: string) => {
      try {
        const result = await ctx.pipelines.listPendingApprovals(project, parseInt(buildId));
        outputResult(
          { fileName: `approvals-build-${buildId}`, data: result, summary: `Pending approvals for build #${buildId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list pending approvals'); }
    });

  pipeline
    .command('create')
    .description('Create a new YAML pipeline definition')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Pipeline name')
    .argument('<repositoryId>', 'Repository ID (GUID for Azure Repos, org/repo for GitHub)')
    .argument('<yamlPath>', 'Path to YAML file in repository')
    .option('-f, --folder <folder>', 'Folder path')
    .option('--repo-type <type>', 'Repository type: TfsGit, GitHub, GitHubEnterprise', 'TfsGit')
    .option('--repo-url <url>', 'Repository URL (required for GitHub)')
    .option('--default-branch <branch>', 'Default branch (required for GitHub)')
    .option('--service-connection-id <id>', 'Service connection ID for GitHub auth')
    .action(async (project: string, name: string, repositoryId: string, yamlPath: string, opts: any) => {
      try {
        const result = await ctx.pipelines.createPipelineDefinition(
          project, name, repositoryId, yamlPath,
          opts.folder, opts.repoType, opts.repoUrl, opts.defaultBranch, opts.serviceConnectionId
        );
        outputResult(
          { persist: false, fileName: `pipeline-created-${name}`, data: result, summary: `Created pipeline '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create pipeline'); }
    });

  pipeline
    .command('update')
    .description('Update a pipeline definition')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .option('-n, --name <name>', 'New pipeline name')
    .option('-p, --path <path>', 'New folder path')
    .option('-q, --queue-status <status>', 'Queue status: enabled, disabled, paused')
    .option('--variables <json>', 'Pipeline variables as JSON')
    .action(async (project: string, definitionId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.path) updates.path = opts.path;
        if (opts.queueStatus) updates.queueStatus = opts.queueStatus;
        if (opts.variables) updates.variables = JSON.parse(opts.variables);
        const result = await ctx.pipelines.updatePipelineDefinition(project, parseInt(definitionId), updates);
        outputResult(
          { persist: false, fileName: `pipeline-updated-${definitionId}`, data: result, summary: `Updated pipeline #${definitionId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update pipeline'); }
    });

  pipeline
    .command('rename')
    .description('Rename a pipeline definition')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .argument('<newName>', 'New pipeline name')
    .action(async (project: string, definitionId: string, newName: string) => {
      try {
        const result = await ctx.pipelines.renamePipelineDefinition(project, parseInt(definitionId), newName);
        outputResult(
          { persist: false, fileName: `pipeline-renamed-${definitionId}`, data: result, summary: `Renamed pipeline #${definitionId} to '${newName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'rename pipeline'); }
    });

  pipeline
    .command('delete')
    .description('Delete a pipeline definition (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .action(async (project: string, definitionId: string) => {
      try {
        const result = await ctx.pipelines.deletePipelineDefinition(project, parseInt(definitionId));
        outputResult(
          { persist: false, fileName: `pipeline-deleted-${definitionId}`, data: result, summary: `Deleted pipeline #${definitionId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete pipeline'); }
    });

  pipeline
    .command('queue')
    .description('Queue a new pipeline build/run')
    .argument('<project>', 'Project name')
    .argument('<definitionId>', 'Pipeline definition ID')
    .option('-b, --branch <branch>', 'Source branch ref (e.g., refs/heads/main, refs/heads/feature/foo)')
    .option('--source-version <sha>', 'Commit SHA to build (pins to a specific commit)')
    .option('--variables <json>', 'Runtime variables as JSON')
    .option('--parameters <json>', 'Template parameters as JSON')
    .action(async (project: string, definitionId: string, opts: any) => {
      try {
        const variables = opts.variables ? JSON.parse(opts.variables) : undefined;
        const parameters = opts.parameters ? JSON.parse(opts.parameters) : undefined;
        const result = await ctx.pipelines.queueBuild(project, parseInt(definitionId), opts.branch, variables, parameters, opts.sourceVersion);
        outputResult(
          { persist: false, fileName: `pipeline-queued-${definitionId}`, data: result, summary: `Queued build for pipeline #${definitionId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'queue build'); }
    });

  pipeline
    .command('build-status')
    .description('Get build status and details')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID')
    .option('-d, --detail <level>', 'Detail level: summary, full', 'summary')
    .option('-s, --scope <scope>', 'Timeline scope: stages, jobs, all, problems', 'problems')
    .option('--max-issues <n>', 'Maximum issues to return', '5')
    .action(async (project: string, buildId: string, opts: any) => {
      try {
        const result = await ctx.pipelines.getBuildStatus(
          project, parseInt(buildId), opts.detail, opts.scope, parseInt(opts.maxIssues)
        );
        outputResult(
          { fileName: `build-status-${buildId}`, data: result, summary: `Build #${buildId} status` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get build status'); }
    });

  pipeline
    .command('build-timeline')
    .description('Get build timeline with stage/job/task details')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID')
    .option('-s, --scope <scope>', 'Timeline scope: stages, jobs, all, problems', 'problems')
    .option('--max-issues <n>', 'Maximum issues to return', '5')
    .action(async (project: string, buildId: string, opts: any) => {
      try {
        const result = await ctx.pipelines.getBuildTimeline(
          project, parseInt(buildId), opts.scope, parseInt(opts.maxIssues)
        );
        outputResult(
          { fileName: `build-timeline-${buildId}`, data: result, summary: `Build #${buildId} timeline` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get build timeline'); }
    });

  pipeline
    .command('build-logs')
    .description('Get build logs')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID')
    .option('-l, --log-id <id>', 'Specific log ID to retrieve')
    .option('-m, --mode <mode>', 'Log mode: summary, full, errors', 'summary')
    .action(async (project: string, buildId: string, opts: any) => {
      try {
        const logId = opts.logId ? parseInt(opts.logId) : undefined;
        const result = await ctx.pipelines.getBuildLogs(project, parseInt(buildId), logId, opts.mode);
        outputResult(
          { fileName: `build-logs-${buildId}`, data: result, summary: `Build #${buildId} logs` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get build logs'); }
    });

  pipeline
    .command('cancel')
    .description('Cancel a running build')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID to cancel')
    .action(async (project: string, buildId: string) => {
      try {
        const result = await ctx.pipelines.cancelBuild(project, parseInt(buildId));
        outputResult(
          { persist: false, fileName: `build-cancelled-${buildId}`, data: result, summary: `Cancelled build #${buildId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'cancel build'); }
    });

  pipeline
    .command('retry')
    .description('Retry a failed build')
    .argument('<project>', 'Project name')
    .argument('<buildId>', 'Build ID to retry')
    .action(async (project: string, buildId: string) => {
      try {
        const result = await ctx.pipelines.retryBuild(project, parseInt(buildId));
        outputResult(
          { persist: false, fileName: `build-retried-${buildId}`, data: result, summary: `Retried build #${buildId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'retry build'); }
    });

  pipeline
    .command('approve')
    .description('Approve or reject a pipeline stage gate')
    .argument('<project>', 'Project name')
    .argument('<approvalId>', 'Approval ID (from approvals command)')
    .argument('<status>', 'Status: approved or rejected')
    .option('-c, --comment <text>', 'Approval/rejection comment')
    .action(async (project: string, approvalId: string, status: string, opts: any) => {
      try {
        const result = await ctx.pipelines.approveStage(project, approvalId, status as any, opts.comment);
        outputResult(
          { persist: false, fileName: `approval-${approvalId}`, data: result, summary: `Stage ${status}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, `${status} stage`); }
    });

  pipeline
    .command('summary')
    .description('All pipelines with the status of their latest build')
    .argument('<project>', 'Project name')
    .option('-n, --name-contains <text>', 'Case-insensitive substring filter on pipeline name')
    .option('--max-results <n>', 'Maximum pipelines to inspect (default 25)')
    .action(async (project: string, opts: any) => {
      try {
        const maxResults = parsePipelinePositiveInt(opts.maxResults, '--max-results');
        const result = await ctx.pipelines.getPipelineSummaries(project, {
          nameContains: opts.nameContains,
          maxResults,
        });
        const b = result.resultBreakdown;
        outputResult(
          {
            fileName: `pipeline-summary-${project}`,
            data: result,
            summary: `${result.pipelineCount} pipeline(s): ${b.succeeded} succeeded, ${b.partiallySucceeded} partial, ${b.failed} failed, ${b.canceled} canceled, ${b.noBuilds} never built${result.truncated ? ' (truncated)' : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'summarise pipelines'); }
    });

  pipeline
    .command('last-deploys')
    .description('Latest successful deploy per stage, with templateParameters')
    .argument('<project>', 'Project name')
    .option('--pipeline-id <n>', 'Pipeline (build definition) ID — preferred')
    .option('--pipeline-name <name>', 'Exact pipeline name (case-insensitive)')
    .option('-s, --stages <list>', 'Comma-separated stage names (default Dev,UAT,Prod)')
    .option('--param <name>', 'Template parameter to surface per stage')
    .option('--search-top <n>', 'How many recent builds to scan (default 50)')
    .action(async (project: string, opts: any) => {
      try {
        const pipelineId = parsePipelinePositiveInt(opts.pipelineId, '--pipeline-id');
        const searchTop = parsePipelinePositiveInt(opts.searchTop, '--search-top');
        if (pipelineId === undefined && !opts.pipelineName) {
          throw new Error('Provide either --pipeline-id or --pipeline-name.');
        }
        const stages = opts.stages
          ? String(opts.stages).split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined;

        const result = await ctx.pipelines.getLastDeploys(project, {
          pipelineId,
          pipelineName: opts.pipelineName,
          stages,
          templateParameter: opts.param,
          searchTop,
        });
        const foundCount = result.requestedStages.length - result.stagesNotFound.length;
        outputResult(
          {
            fileName: `last-deploys-${result.pipelineId}`,
            data: result,
            summary: `${result.pipelineName}: ${foundCount}/${result.requestedStages.length} stage(s) found across ${result.buildsSearched} build(s)${result.stagesNotFound.length ? `; missing: ${result.stagesNotFound.join(', ')}` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get last deploys'); }
    });
}
