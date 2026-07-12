/**
 * Service Health CLI commands — 5 commands mapping 1:1 to the m365-* health MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import {
  parsePositiveInt,
  parseEnum,
  parseBoolean,
  truncationNote,
  ISSUE_CLASSIFICATIONS,
} from './helpers.js';
import type {
  GraphServiceHealth,
  GraphServiceHealthIssue,
} from '../../models/message-center-types.js';

function summariseIssue(issue: GraphServiceHealthIssue): string {
  const resolved = issue.isResolved ? 'resolved' : 'UNRESOLVED';
  return `  [${issue.id ?? '?'}] ${issue.title ?? '(no title)'} | ${issue.classification ?? '?'} | ${issue.status ?? '?'} | ${resolved} | ${issue.service ?? '?'}`;
}

export function registerHealthCommands(program: Command, ctx: ServiceContext): void {
  const health = program.command('health').description('Microsoft 365 service health');

  health
    .command('list-service-health')
    .description('Status of every subscribed Microsoft 365 service')
    .option('-m, --max-results <count>', 'Maximum services to return')
    .action(async (opts: { maxResults?: string }) => {
      try {
        const result = await ctx.health.listServiceHealth({
          maxResults: parsePositiveInt(opts.maxResults, '--max-results'),
        });

        outputResult(
          {
            fileName: 'm365-service-health',
            data: result,
            summary: [
              `Found ${result.total} service(s)`,
              truncationNote(result.truncated),
              '',
              ...result.services.map(
                (s: GraphServiceHealth) => `  ${s.service ?? s.id ?? '?'}: ${s.status ?? 'unknown'}`
              ),
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list service health');
      }
    });

  health
    .command('get-service-health <service>')
    .description('Detailed health of one service (display name or id, case-insensitive)')
    .action(async (service: string) => {
      try {
        const result = await ctx.health.getServiceHealth(service);
        const issues = result.issues ?? [];
        outputResult(
          {
            fileName: `m365-service-health-${(result.id ?? result.service ?? 'service').replace(/\s+/g, '-')}`,
            data: result,
            summary: [
              `Service: ${result.service ?? '?'} (${result.id ?? '?'})`,
              `Status:  ${result.status ?? 'unknown'}`,
              `Issues (${issues.length}):`,
              ...(issues.length === 0 ? ['  (none)'] : issues.map(summariseIssue)),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get service health');
      }
    });

  health
    .command('list-health-issues')
    .description('Service-health issues across all services (filtered client-side)')
    .option('-s, --service <name>', 'Substring match on the service name')
    .option('-c, --classification <type>', `Filter: ${ISSUE_CLASSIFICATIONS.join(', ')}`)
    .option('-r, --is-resolved <bool>', "Filter by resolved status: 'true' or 'false'")
    .option('-m, --max-results <count>', 'Maximum issues to return, newest first')
    .action(
      async (opts: { service?: string; classification?: string; isResolved?: string; maxResults?: string }) => {
        try {
          const result = await ctx.health.listIssues({
            service: opts.service,
            classification: parseEnum(opts.classification, ISSUE_CLASSIFICATIONS, '--classification'),
            isResolved: parseBoolean(opts.isResolved, '--is-resolved'),
            maxResults: parsePositiveInt(opts.maxResults, '--max-results'),
          });

          outputResult(
            {
              fileName: 'm365-health-issues',
              data: result,
              summary: [
                `Found ${result.total} issue(s)`,
                truncationNote(result.truncated),
                '',
                ...(result.issues.length === 0 ? ['  (none)'] : result.issues.map(summariseIssue)),
              ]
                .filter((line) => line !== '')
                .join('\n'),
            },
            getGlobalFlags(program)
          );
        } catch (error) {
          handleCliError(error, 'list health issues');
        }
      }
    );

  health
    .command('get-health-issue <issueId>')
    .description('Full detail for one service-health issue (e.g. EX226792)')
    .action(async (issueId: string) => {
      try {
        const issue = await ctx.health.getIssue(issueId);
        const posts = issue.posts ?? [];
        outputResult(
          {
            fileName: `m365-health-issue-${issue.id ?? issueId}`,
            data: issue,
            summary: [
              `Issue:          ${issue.id ?? '?'} - ${issue.title ?? '(no title)'}`,
              `Service:        ${issue.service ?? '?'}`,
              `Classification: ${issue.classification ?? '?'}`,
              `Status:         ${issue.status ?? '?'}`,
              `Resolved:       ${issue.isResolved ?? false}`,
              `Impact:         ${issue.impactDescription ?? '(none)'}`,
              `Start:          ${issue.startDateTime ?? '?'}`,
              issue.endDateTime ? `End:            ${issue.endDateTime}` : '',
              posts.length > 0
                ? `\nLatest update:\n${posts[posts.length - 1]?.description?.content ?? 'N/A'}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get health issue');
      }
    });

  health
    .command('get-incident-report <issueId>')
    .description('Post-incident review (PIR) document for a resolved issue')
    .action(async (issueId: string) => {
      try {
        const report = await ctx.health.getIncidentReport(issueId);
        outputResult(
          {
            fileName: `m365-incident-report-${report.issueId}`,
            data: report,
            summary: [
              `Incident report for ${report.issueId} (${report.format}):`,
              '',
              report.format === 'text' ? report.content : '(binary document — see JSON output for base64)',
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get incident report');
      }
    });
}
