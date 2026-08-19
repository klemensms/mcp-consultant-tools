import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SECURITY_READER } from './tool-helpers.js';
import { DEFAULT_ALERT_RESULTS } from '../services/alert-service.js';

export function registerAlertTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-alerts',
    `Microsoft Defender for Cloud security alerts across the whole subscription - the active threat detections, as opposed to the configuration findings that defender-list-assessments returns. summary.byStatus and summary.bySeverity break the count down, and summary.topEntities names any resource carrying more than one alert, because clustering is usually the finding: 25 Active alerts on one domain controller and 25 spread over 25 machines are the same count and a different incident. The ARM operation accepts no server-side filter, so status and severity are applied AFTER the fetch: when either is set, summary.matchedOf is what ARM returned and summary.total is what matched, and summary.note says how many were removed. maxResults bounds the fetch (default ${DEFAULT_ALERT_RESULTS}) and therefore runs BEFORE the filter - if truncated is true on a filtered call, matching alerts may exist beyond the limit and summary.note says so. ${SECURITY_READER}`,
    {
      status: z
        .enum(['Active', 'InProgress', 'Resolved', 'Dismissed'])
        .optional()
        .describe('Filter to one alert lifecycle status. Applied client-side, after the fetch.'),
      severity: z
        .enum(['Informational', 'Low', 'Medium', 'High'])
        .optional()
        .describe(
          'Filter to one severity. Applied client-side. Note the enum has no Critical - alert severity tops out at High, unlike assessment severity.'
        ),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          `Maximum alerts to FETCH before filtering (default ${DEFAULT_ALERT_RESULTS}). Raise it for a filtered subscription-wide total.`
        ),
    },
    READ_ONLY,
    async (args: { status?: any; severity?: any; maxResults?: number }) =>
      runTool('listing security alerts', () => ctx.alert.listAlerts(args))
  );
}
