/**
 * Assessment CLI commands — 3 commands mapping to the assessment MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import {
  parsePositiveInt,
  parseEnum,
  truncationNote,
  ASSESSMENT_STATUSES,
  ASSESSMENT_SEVERITIES,
} from './helpers.js';

export function registerAssessmentCommands(program: Command, ctx: ServiceContext): void {
  const assessment = program
    .command('assessment')
    .description('Security assessments (Defender for Cloud recommendations)');

  assessment
    .command('list-assessments')
    .description('Security assessments, optionally filtered by health status')
    .option('-s, --status <status>', `Filter by status (${ASSESSMENT_STATUSES.join('|')})`)
    .option('-m, --max-results <count>', 'Maximum assessments to return')
    .action(async (opts: { status?: string; maxResults?: string }) => {
      try {
        const statusFilter = parseEnum(opts.status, ASSESSMENT_STATUSES, '--status');
        const maxResults = parsePositiveInt(opts.maxResults, '--max-results');
        const result = await ctx.assessment.listAssessments({ statusFilter, maxResults });
        outputResult(
          {
            fileName: 'defender-assessments',
            data: result,
            summary: [
              `Found ${result.summary.total} assessment(s)`,
              ...Object.entries(result.summary.byStatus).map(([s, c]) => `  ${s}: ${c}`),
              result.summary.sources.resourceGraph.unique > 0
                ? `  ${result.summary.sources.resourceGraph.unique} of these are not visible to the ARM list (identity- or subscription-scoped)`
                : '',
              result.summary.note ? `  ${result.summary.note}` : '',
              truncationNote(result.truncated),
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list assessments');
      }
    });

  assessment
    .command('get-assessment')
    .description('One security assessment for one resource')
    .requiredOption('-r, --resource-id <id>', "Full ARM resource ID (starts with '/subscriptions/')")
    .requiredOption('-a, --assessment-name <name>', 'Assessment name/GUID')
    .action(async (opts: { resourceId: string; assessmentName: string }) => {
      try {
        const result = await ctx.assessment.getAssessment({
          resourceId: opts.resourceId,
          assessmentName: opts.assessmentName,
        });
        outputResult(
          {
            fileName: `defender-assessment-${opts.assessmentName}`,
            data: result,
            summary: [
              `Assessment: ${result.properties.displayName || result.name}`,
              `  Status: ${result.properties.status.code}`,
              `  Resource: ${result.properties.resourceDetails?.id ?? 'N/A'}`,
              result.properties.risk?.level ? `  Risk level: ${result.properties.risk.level}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get assessment');
      }
    });

  assessment
    .command('list-assessment-metadata')
    .description('Catalogue of assessment definitions: severity, categories, remediation')
    .option('-s, --severity <level>', `Filter by severity (${ASSESSMENT_SEVERITIES.join('|')})`)
    .action(async (opts: { severity?: string }) => {
      try {
        const severityFilter = parseEnum(opts.severity, ASSESSMENT_SEVERITIES, '--severity');
        const result = await ctx.assessment.listAssessmentMetadata({ severityFilter });
        outputResult(
          {
            fileName: 'defender-assessment-metadata',
            data: result,
            summary: [
              `Found ${result.summary.total} assessment definition(s)`,
              'By severity:',
              ...Object.entries(result.summary.bySeverity).map(([s, c]) => `  ${s}: ${c}`),
              'By category:',
              ...Object.entries(result.summary.byCategory).map(([c, n]) => `  ${c}: ${n}`),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list assessment metadata');
      }
    });
}
