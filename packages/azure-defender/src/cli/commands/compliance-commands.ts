/**
 * Compliance CLI commands - 4 commands mapping to the compliance MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parseEnum, COMPLIANCE_STATES } from './helpers.js';

export function registerComplianceCommands(program: Command, ctx: ServiceContext): void {
  const compliance = program
    .command('compliance')
    .description('Regulatory compliance standards, controls and assessments');

  compliance
    .command('list-compliance-standards')
    .description('Regulatory compliance standards enabled on the subscription')
    .action(async () => {
      try {
        const result = await ctx.compliance.listStandards();
        outputResult(
          {
            fileName: 'defender-compliance-standards',
            data: result,
            summary: [
              `Found ${result.summary.total} compliance standard(s)`,
              ...Object.entries(result.summary.byState).map(([s, c]) => `  ${s}: ${c}`),
              result.summary.total === 0
                ? '  ℹ️ No standards enabled - this is not the same as being non-compliant'
                : '',
              '',
              ...result.standards.map(
                (s) =>
                  `  ${s.name}: ${s.properties.state} (${s.properties.passedControls} passed, ${s.properties.failedControls} failed)`
              ),
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list compliance standards');
      }
    });

  compliance
    .command('list-compliance-controls')
    .description('Controls within a compliance standard')
    .argument('<standardName>', "Compliance standard name (e.g. 'Azure-CIS-1.1.0')")
    .option('-s, --state <state>', `Filter by state (${COMPLIANCE_STATES.join('|')})`)
    .action(async (standardName: string, opts: { state?: string }) => {
      try {
        const stateFilter = parseEnum(opts.state, COMPLIANCE_STATES, '--state');
        const result = await ctx.compliance.listControls({ standardName, stateFilter });
        outputResult(
          {
            fileName: `defender-compliance-controls-${standardName}`,
            data: result,
            summary: [
              `Found ${result.summary.total} control(s) for ${standardName}`,
              ...Object.entries(result.summary.byState).map(([s, c]) => `  ${s}: ${c}`),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list compliance controls');
      }
    });

  compliance
    .command('list-compliance-assessments')
    .description('Assessments behind one control of one standard')
    .argument('<standardName>', 'Compliance standard name')
    .argument('<controlName>', "Control name within the standard (e.g. '1.1')")
    .option('-s, --state <state>', `Filter by state (${COMPLIANCE_STATES.join('|')})`)
    .action(async (standardName: string, controlName: string, opts: { state?: string }) => {
      try {
        const stateFilter = parseEnum(opts.state, COMPLIANCE_STATES, '--state');
        const result = await ctx.compliance.listControlAssessments({
          standardName,
          controlName,
          stateFilter,
        });
        outputResult(
          {
            fileName: `defender-compliance-assessments-${standardName}-${controlName}`,
            data: result,
            summary: [
              `Found ${result.summary.total} assessment(s) for ${standardName}/${controlName}`,
              `  Failed resources: ${result.summary.totalFailedResources}`,
              ...Object.entries(result.summary.byState).map(([s, c]) => `  ${s}: ${c}`),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list compliance assessments');
      }
    });

  compliance
    .command('get-compliance-summary')
    .description('Compliance rolled up per standard')
    .argument('[standardName]', 'Optional: focus on a single standard')
    .action(async (standardName?: string) => {
      try {
        const result = await ctx.compliance.getComplianceSummary(
          standardName ? { standardName } : undefined
        );
        outputResult(
          {
            fileName: 'defender-compliance-summary',
            data: result,
            summary: [
              `Compliance summary (${result.overallSummary.totalStandards} standard(s))`,
              `  Average compliance: ${result.overallSummary.averageCompliance}%`,
              `  Passed controls: ${result.overallSummary.totalPassed} | Failed: ${result.overallSummary.totalFailed}`,
              '',
              ...result.standards.map(
                (s) =>
                  `  ${s.name}: ${s.compliancePercentage}% (${s.passedControls}/${s.passedControls + s.failedControls} assessed controls passed)`
              ),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get compliance summary');
      }
    });
}
