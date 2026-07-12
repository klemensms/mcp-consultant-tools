/**
 * Log stream / detector CLI Commands - 4 commands mapping to the log-stream MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';
import {
  DEFAULT_STREAM_DURATION_SECONDS,
  MAX_STREAM_DURATION_SECONDS,
  DEFAULT_STREAM_MAX_LINES,
  MAX_STREAM_MAX_LINES,
  type LogStreamType,
} from '../../services/LogStreamService.js';

function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer, got: ${value}`);
  }
  return parsed;
}

const LOG_STREAM_TYPES: LogStreamType[] = ['application', 'http', 'all'];

function parseLogType(value: string | undefined): LogStreamType | undefined {
  if (value === undefined) return undefined;
  if (!LOG_STREAM_TYPES.includes(value as LogStreamType)) {
    throw new Error(`--log-type must be one of: ${LOG_STREAM_TYPES.join(', ')}. Got: ${value}`);
  }
  return value as LogStreamType;
}

export function registerLogStreamCommands(program: Command, ctx: ServiceContext): void {
  const log = program.command('log').description('App Service log streaming and diagnostics');

  log
    .command('stream')
    .description(`Collect live logs from an App Service or Function App (max ${MAX_STREAM_DURATION_SECONDS}s)`)
    .argument('<appName>', 'App Service or Function App name')
    .option('-t, --log-type <type>', `Log provider: ${LOG_STREAM_TYPES.join(', ')}`, 'application')
    .option('-d, --duration <seconds>', `Seconds to stream (default: ${DEFAULT_STREAM_DURATION_SECONDS}, max: ${MAX_STREAM_DURATION_SECONDS})`)
    .option('-n, --max-lines <count>', `Stop after this many lines (default: ${DEFAULT_STREAM_MAX_LINES}, max: ${MAX_STREAM_MAX_LINES})`)
    .option('-s, --slot <name>', 'Deployment slot name')
    .action(async (appName: string, opts: any) => {
      try {
        // Parsed before the service is touched, so a typo fails on the typo
        // rather than on a missing-credentials error further down.
        const logType = parseLogType(opts.logType);
        const durationSeconds = parsePositiveInt(opts.duration, 'duration');
        const maxLines = parsePositiveInt(opts.maxLines, 'max-lines');
        const result = await ctx.management.logStream.getLogStream({
          appName,
          logType,
          durationSeconds,
          maxLines,
          slotName: opts.slot,
        });
        outputResult(
          {
            fileName: `log-stream-${appName}`,
            data: result,
            summary: [
              `Log stream: ${appName} (${result.logType})`,
              `  Lines collected: ${result.summary.totalLines}`,
              `  Duration: ${result.summary.durationMs}ms`,
              `  Stopped: ${result.summary.terminationReason}`,
              ...(result.note ? ['', result.note] : []),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'stream logs'); }
    });

  log
    .command('config')
    .description('Read the logging configuration of an App Service or Function App')
    .argument('<appName>', 'App Service or Function App name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (appName: string, opts: any) => {
      try {
        const result = await ctx.management.logStream.getLogConfiguration({
          appName,
          resourceGroup: opts.resourceGroup,
        });
        outputResult(
          {
            fileName: `log-config-${appName}`,
            data: result,
            summary: [
              `Log configuration: ${appName}`,
              `  Application logging (filesystem): ${result.applicationLogging.fileSystemLevel}`,
              `  HTTP logging (filesystem): ${result.httpLogging.fileSystem.enabled ? 'Enabled' : 'Disabled'}`,
              `  Detailed errors: ${result.detailedErrorMessages ? 'Enabled' : 'Disabled'}`,
              `  Failed request tracing: ${result.failedRequestTracing ? 'Enabled' : 'Disabled'}`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get log configuration'); }
    });

  log
    .command('detectors')
    .description('List available diagnostic detectors for an App Service or Function App')
    .argument('<appName>', 'App Service or Function App name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (appName: string, opts: any) => {
      try {
        const result = await ctx.management.logStream.listDiagnosticDetectors({
          appName,
          resourceGroup: opts.resourceGroup,
        });
        outputResult(
          {
            fileName: `detectors-${appName}`,
            data: result,
            summary: [
              `Diagnostic detectors for ${appName}: ${result.summary.total} total`,
              ...Object.entries(result.summary.byCategory).map(([category, count]) => `  ${category}: ${count}`),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list detectors'); }
    });

  log
    .command('detector')
    .description('Run one diagnostic detector for an App Service or Function App')
    .argument('<appName>', 'App Service or Function App name')
    .argument('<detectorName>', 'Detector name (see: log detectors)')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--start-time <time>', 'Start of the window, ISO 8601 UTC')
    .option('--end-time <time>', 'End of the window, ISO 8601 UTC')
    .action(async (appName: string, detectorName: string, opts: any) => {
      try {
        const result = await ctx.management.logStream.getDiagnosticDetector({
          appName,
          detectorName,
          resourceGroup: opts.resourceGroup,
          startTime: opts.startTime,
          endTime: opts.endTime,
        });
        outputResult(
          {
            fileName: `detector-${appName}-${detectorName}`,
            data: result,
            summary: [
              `Detector: ${result.metadata.name} (${result.detectorName})`,
              `  Category: ${result.metadata.category}`,
              `  Status: ${result.status.statusId === 0 ? 'Healthy' : result.status.message || 'Issue detected'}`,
              `  Datasets: ${result.dataset.length}`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'run detector'); }
    });
}
