import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SERVICE_HEALTH_READ, CLIENT_SIDE_FILTER_NOTE } from './tool-helpers.js';
import type { ListIssuesOptions } from '../models/message-center-types.js';

export function registerHealthTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'm365-list-service-health',
    `Current health status of every Microsoft 365 service the tenant subscribes to (Exchange Online, SharePoint Online, Teams, and so on). ` +
      `Returns one row per service with its serviceHealthStatus. Use this first to discover the exact service names accepted by m365-get-service-health and the service filters. ` +
      `${SERVICE_HEALTH_READ}`,
    {
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum services to return. Omit for all.'),
    },
    READ_ONLY,
    async ({ maxResults }: { maxResults?: number }) =>
      runTool('listing service health', () => ctx.health.listServiceHealth({ maxResults }))
  );

  server.tool(
    'm365-get-service-health',
    `Detailed health of one Microsoft 365 service, including its active and recent issues. ` +
      `The service is matched case-insensitively against both the display name ("Exchange Online") and the stable id ("Exchange") returned by m365-list-service-health, so casing does not matter; an unknown name returns the list of available services rather than a bare not-found. ` +
      `${SERVICE_HEALTH_READ}`,
    {
      service: z
        .string()
        .describe(
          'The service display name or id, e.g. "Exchange Online" or "Exchange". Case-insensitive. Call m365-list-service-health to see valid values.'
        ),
    },
    READ_ONLY,
    async ({ service }: { service: string }) =>
      runTool('getting service health', () => ctx.health.getServiceHealth(service))
  );

  server.tool(
    'm365-list-health-issues',
    `Service-health issues (incidents and advisories) across all Microsoft 365 services. ` +
      `Resolved status comes from the authoritative isResolved flag, not from the status text. ` +
      `${CLIENT_SIDE_FILTER_NOTE} ${SERVICE_HEALTH_READ}`,
    {
      service: z
        .string()
        .optional()
        .describe('Case-insensitive substring match on the issue\'s service name, e.g. "Exchange".'),
      classification: z
        .enum(['advisory', 'incident'])
        .optional()
        .describe('advisory = informational; incident = a service-impacting event. Compared case-insensitively.'),
      isResolved: z
        .boolean()
        .optional()
        .describe('true = only resolved issues; false = only unresolved (still-active) issues. Omit for both.'),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum issues to return, newest first. Omit for all.'),
    },
    READ_ONLY,
    async (args: {
      service?: string;
      classification?: ListIssuesOptions['classification'];
      isResolved?: boolean;
      maxResults?: number;
    }) => runTool('listing service health issues', () => ctx.health.listIssues(args))
  );

  server.tool(
    'm365-get-health-issue',
    `Full detail for one service-health issue by ID, including its update posts and impact description. ` +
      `${SERVICE_HEALTH_READ}`,
    {
      issueId: z
        .string()
        .describe('The service-announcement issue ID, e.g. "EX226792". Letters and digits only.'),
    },
    READ_ONLY,
    async ({ issueId }: { issueId: string }) =>
      runTool('getting health issue', () => ctx.health.getIssue(issueId))
  );

  server.tool(
    'm365-get-incident-report',
    `The post-incident review (PIR) document for a resolved service-health issue. ` +
      `Microsoft only publishes a PIR for issues whose status is postIncidentReviewPublished; for any other issue this returns a clear error rather than an empty document. ` +
      `The document is returned as text when it decodes as UTF-8, otherwise base64 (format field says which). ` +
      `${SERVICE_HEALTH_READ}`,
    {
      issueId: z
        .string()
        .describe('The service-announcement issue ID, e.g. "EX226792". Letters and digits only.'),
    },
    READ_ONLY,
    async ({ issueId }: { issueId: string }) =>
      runTool('getting incident report', () => ctx.health.getIncidentReport(issueId))
  );
}
