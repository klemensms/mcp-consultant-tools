import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  APP_SERVICE_NAME_EXAMPLES,
  LOG_STREAM_TYPE_EXAMPLES,
  DETECTOR_NAME_EXAMPLES,
} from '../tool-examples.js';
import {
  DEFAULT_STREAM_DURATION_SECONDS,
  MAX_STREAM_DURATION_SECONDS,
  DEFAULT_STREAM_MAX_LINES,
  MAX_STREAM_MAX_LINES,
} from '../services/LogStreamService.js';

export function registerLogStreamTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'get-log-stream',
    `Collect live log output from an App Service or Function App via the Kudu SCM stream. Blocks for up to ${MAX_STREAM_DURATION_SECONDS}s. Stops at durationSeconds or maxLines, whichever comes first. An empty result does NOT mean the app is idle - filesystem logging is off by default and self-disables 12 hours after being enabled; check get-log-config. Requires Website Contributor. Not available for Function Apps on Linux Consumption or Flex Consumption plans.`,
    {
      appName: z
        .string()
        .describe(descWithExamples('App Service or Function App name', APP_SERVICE_NAME_EXAMPLES)),
      logType: z
        .enum(['application', 'http', 'all'])
        .optional()
        .describe(
          descWithExamples("Log provider to stream (default: 'application')", LOG_STREAM_TYPE_EXAMPLES)
        ),
      durationSeconds: z
        .number()
        .int()
        .min(1)
        .max(MAX_STREAM_DURATION_SECONDS)
        .optional()
        .describe(
          `Seconds to hold the stream open (default: ${DEFAULT_STREAM_DURATION_SECONDS}, max: ${MAX_STREAM_DURATION_SECONDS}). Call again for a longer window.`
        ),
      maxLines: z
        .number()
        .int()
        .min(1)
        .max(MAX_STREAM_MAX_LINES)
        .optional()
        .describe(
          `Stop after this many lines (default: ${DEFAULT_STREAM_MAX_LINES}, max: ${MAX_STREAM_MAX_LINES}). Sets summary.truncated when it fires.`
        ),
      slotName: z.string().optional().describe('Deployment slot name (defaults to production)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.logStream.getLogStream(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error streaming logs:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-log-config',
    "Read the logging configuration of an App Service or Function App: application/HTTP logging levels, blob destinations, detailed errors and failed-request tracing. Blob SAS URLs are never returned. Check this first when get-log-stream or get-app-service-logs come back empty.",
    {
      appName: z
        .string()
        .describe(descWithExamples('App Service or Function App name', APP_SERVICE_NAME_EXAMPLES)),
      resourceGroup: z
        .string()
        .optional()
        .describe('Resource group (uses AZURE_RESOURCE_GROUP if not specified)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.logStream.getLogConfiguration(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error getting log configuration:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-detectors',
    'List the App Service diagnostic detectors available for an app - the same detectors behind "Diagnose and solve problems" in the portal. Use get-detector to run one.',
    {
      appName: z
        .string()
        .describe(descWithExamples('App Service or Function App name', APP_SERVICE_NAME_EXAMPLES)),
      resourceGroup: z
        .string()
        .optional()
        .describe('Resource group (uses AZURE_RESOURCE_GROUP if not specified)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.logStream.listDiagnosticDetectors(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing detectors:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get-detector',
    'Run a single App Service diagnostic detector over a time range and return its datasets. Omit the time range to let the detector choose its own window. Get detector names from list-detectors.',
    {
      appName: z
        .string()
        .describe(descWithExamples('App Service or Function App name', APP_SERVICE_NAME_EXAMPLES)),
      detectorName: z
        .string()
        .describe(
          descWithExamples('Detector name as returned by list-detectors', DETECTOR_NAME_EXAMPLES)
        ),
      resourceGroup: z
        .string()
        .optional()
        .describe('Resource group (uses AZURE_RESOURCE_GROUP if not specified)'),
      startTime: z
        .string()
        .optional()
        .describe('Start of the window, ISO 8601 UTC (e.g. 2026-07-10T00:00:00Z)'),
      endTime: z
        .string()
        .optional()
        .describe('End of the window, ISO 8601 UTC (e.g. 2026-07-10T06:00:00Z)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.logStream.getDiagnosticDetector(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error running detector:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
