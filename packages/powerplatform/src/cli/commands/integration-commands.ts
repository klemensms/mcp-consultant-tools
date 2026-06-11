/**
 * Integration CLI Commands - 5 commands for integration audit and environment variables
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerIntegrationCommands(program: Command, ctx: ServiceContext): void {
  const integration = program.command('integration').description('Integration audit and environment variables');

  integration
    .command('endpoints')
    .description('Get all service endpoints (webhooks, Azure Service Bus, REST)')
    .option('-m, --max <n>', 'Maximum endpoints to return', '100')
    .option('--required-urls <patterns...>', 'URL patterns to validate against (flags non-matching)')
    .option('-f, --format <fmt>', 'Output format: summary or full', 'full')
    .option('--include-ootb', 'Include Microsoft OOTB components', false)
    .action(async (opts: any) => {
      try {
        const excludeOotb = !opts.includeOotb;
        const maxRecords = parseInt(opts.max);

        if (opts.requiredUrls && opts.requiredUrls.length > 0) {
          const result = await ctx.pp.getServiceEndpointsValidated(maxRecords, opts.requiredUrls, excludeOotb);
          outputResult(
            { fileName: 'service-endpoints-validated', data: result, summary: `Service endpoints: ${result.summary.total} found, ${result.summary.flagged} flagged` },
            getGlobalFlags(program)
          );
        } else {
          const result = await ctx.pp.getServiceEndpoints(maxRecords, excludeOotb);
          outputResult(
            { fileName: 'service-endpoints', data: result, summary: `Service endpoints: ${result.summary.total} found` },
            getGlobalFlags(program)
          );
        }
      } catch (error) { handleCliError(error, 'get service endpoints'); }
    });

  integration
    .command('webhooks')
    .description('Get all webhook-type SDK message processing steps')
    .option('-m, --max <n>', 'Maximum webhooks to return', '100')
    .option('--include-ootb', 'Include Microsoft OOTB components', false)
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getWebhookRegistrations(parseInt(opts.max), !opts.includeOotb);
        outputResult(
          { fileName: 'webhook-registrations', data: result, summary: `Webhook registrations: ${result.summary.total} found, ${result.summary.enabledCount} enabled` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get webhook registrations'); }
    });

  integration
    .command('flow-complexity')
    .description('Analyze Power Automate flow complexity and risk scores')
    .option('--flow-id <guid>', 'Specific flow ID to analyze (omit for all)')
    .option('-m, --max-flows <n>', 'Maximum flows to analyze (0=unlimited)', '0')
    .option('-f, --format <fmt>', 'Output format: summary or full', 'full')
    .option('--include-ootb', 'Include OOTB/managed flows', false)
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.analyzeFlowComplexity(
          opts.flowId,
          parseInt(opts.maxFlows),
          !opts.includeOotb
        );
        const summary = result.summary;
        outputResult(
          { fileName: 'flow-complexity', data: result, summary: `Flow complexity: ${summary.total} flows analyzed, avg score ${summary.averageComplexity}, High/Critical: ${summary.byRiskLevel.High + summary.byRiskLevel.Critical}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'analyze flow complexity'); }
    });

  integration
    .command('audit')
    .description('Generate comprehensive integration audit report')
    .option('--max-flows <n>', 'Maximum flows to analyze (0=unlimited)', '0')
    .option('--max-records <n>', 'Maximum records for endpoints/webhooks/plugins', '100')
    .option('--required-urls <patterns...>', 'URL patterns to validate against')
    .option('-f, --format <fmt>', 'Output format: summary or full', 'full')
    .option('--include-ootb', 'Include OOTB components', false)
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.generateIntegrationAuditReport(
          parseInt(opts.maxFlows),
          opts.requiredUrls,
          opts.format as 'summary' | 'full',
          !opts.includeOotb,
          parseInt(opts.maxRecords)
        );
        outputResult(
          { fileName: 'integration-audit', data: result, summary: `Integration audit complete - ${result.summary.flowCount} flows, ${result.summary.webhookCount} webhooks, ${result.summary.serviceEndpointCount} endpoints, ${result.summary.pluginCount} plugins` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'generate integration audit'); }
    });

  integration
    .command('env-vars')
    .description('Get all environment variable definitions')
    .option('-m, --max <n>', 'Maximum variables to return', '500')
    .option('--required-urls <patterns...>', 'URL patterns to validate against (flags non-matching)')
    .option('-f, --format <fmt>', 'Output format: summary or full', 'full')
    .option('--include-ootb', 'Include OOTB components', false)
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getEnvironmentVariables(
          parseInt(opts.max),
          opts.requiredUrls,
          !opts.includeOotb
        );
        outputResult(
          { fileName: 'env-variables', data: result, summary: `Environment variables: ${result.summary.total} found${result.divergingVariables.length > 0 ? `, ${result.divergingVariables.length} diverging` : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get environment variables'); }
    });
}
