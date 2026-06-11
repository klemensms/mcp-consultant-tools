/**
 * Integration Tools - 5 tools for integration audit and environment variables
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, OUTPUT_FORMAT_EXAMPLES } from '../tool-examples.js';

export function registerIntegrationTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-service-endpoints",
    `Get all service endpoints (webhooks, Azure Service Bus, REST) configured in the environment.

Service endpoints are external URLs that Dataverse can call via SDK message processing steps.
Use this to discover outbound integration touchpoints.

Optionally validate endpoint URLs against required patterns (e.g. your organization's domains).
Flagged endpoints are those whose URLs do NOT match any of the provided patterns.

Returns:
- Endpoint name, full URL, contract type (OneWay/TwoWay/Queue/Topic/REST/EventHub/Webhook/EventGrid)
- Authentication type (Anonymous/HttpHeader/WebKey/SASKey/etc.)
- Number of SDK message steps using each endpoint
- Summary statistics by type and auth method
- Flagged endpoints (when requiredUrlStrings provided)`,
    {
      maxRecords: z.number().optional().describe("Maximum endpoints to return (default: 100)"),
      requiredUrlStrings: z.array(z.string()).optional().describe(
        "URL patterns to validate against. Endpoints not matching any pattern are flagged.\n\nExamples:\n  - Validate production URLs: `[\"mycompany.com\"]`\n  - Multiple environments: `[\"prod.mycompany.com\", \"staging.mycompany.com\"]`"
      ),
      outputFormat: z.enum(["summary", "full"]).optional().describe(
        descWithExamples("Output format", OUTPUT_FORMAT_EXAMPLES)
      ),
      excludeOotb: z.boolean().optional().describe("Exclude Microsoft out-of-the-box (OOTB) components from results (default: true). Set to false to include all items."),
    },
    async ({ maxRecords, requiredUrlStrings, outputFormat, excludeOotb }: any) => {
      try {
        const service = ctx.pp;
        const ootb = excludeOotb ?? true;

        if (requiredUrlStrings && requiredUrlStrings.length > 0) {
          const result = await service.getServiceEndpointsValidated(maxRecords ?? 100, requiredUrlStrings, ootb);

          const lines: string[] = [];
          lines.push(`# Service Endpoints (${result.summary.total} found, ${result.summary.flagged} flagged)`);
          lines.push('');

          if (result.flaggedEndpoints.length > 0) {
            lines.push('## Flagged Endpoints');
            lines.push('');
            lines.push('| Name | URL | Issue |');
            lines.push('|------|-----|-------|');
            for (const f of result.flaggedEndpoints) {
              lines.push(`| ${f.endpoint.name} | ${f.endpoint.url} | ${f.urlIssue} |`);
            }
            lines.push('');
          }

          if (outputFormat !== 'summary') {
            lines.push('## All Endpoints');
            lines.push('');
            lines.push('| Name | URL |');
            lines.push('|------|-----|');
            for (const ep of result.allEndpoints) {
              lines.push(`| ${ep.name} | ${ep.url} |`);
            }
            lines.push('');
          }

          return { content: [{ type: "text", text: lines.join('\n') }] };
        }

        const result = await service.getServiceEndpoints(maxRecords ?? 100, ootb);
        const ootbNote = result.summary.ootbExcluded ? `, ${result.summary.ootbExcluded} OOTB excluded` : '';
        return {
          content: [
            {
              type: "text",
              text: `Service Endpoints (${result.summary.total} found${ootbNote}):\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting service endpoints:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get service endpoints: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-webhook-registrations",
    `Get all webhook-type SDK message processing steps in the environment.

Webhooks are registrations that call external service endpoints when Dataverse events occur.
This identifies inbound integration patterns where external systems receive notifications.

Returns:
- Webhook name and endpoint URL
- Trigger entity and message (Create/Update/Delete)
- Filtering attributes and execution stage
- Enabled/disabled status
- Summary by entity and message type`,
    {
      maxRecords: z.number().optional().describe("Maximum webhooks to return (default: 100)"),
      excludeOotb: z.boolean().optional().describe("Exclude Microsoft out-of-the-box (OOTB) components from results (default: true). Set to false to include all items."),
    },
    async ({ maxRecords, excludeOotb }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getWebhookRegistrations(maxRecords ?? 100, excludeOotb ?? true);
        const ootbNote = result.summary.ootbExcluded ? `, ${result.summary.ootbExcluded} OOTB excluded` : '';

        return {
          content: [
            {
              type: "text",
              text: `Webhook Registrations (${result.summary.total} found, ${result.summary.enabledCount} enabled${ootbNote}):\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting webhook registrations:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get webhook registrations: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "analyze-flow-complexity",
    `Analyze Power Automate flow complexity and calculate risk scores.

Now includes URL extraction and hardcoded secret detection per flow.

Complexity scoring factors:
- Action count (base complexity)
- Unique connectors (integration surface, +2 each)
- HTTP/REST connectors (external dependency, +5 each)
- Premium connectors (licensing concern, +3 each)
- Conditions/switches (+2 each)
- Loops (+3 each)
- Parallel branches (+3 each)
- Error handling scopes (+1 each)

Risk levels: Low (0-20), Medium (21-50), High (51-100), Critical (>100)

Use flowId to analyze a single flow, or omit to analyze all flows.`,
    {
      flowId: z.string().optional().describe("Specific flow ID to analyze (omit for all flows)"),
      maxFlows: z.number().optional().describe("Maximum flows to analyze when flowId not specified (default: 0 = unlimited)"),
      outputFormat: z.enum(["summary", "full"]).optional().describe(
        descWithExamples("Output format", OUTPUT_FORMAT_EXAMPLES)
      ),
      excludeOotb: z.boolean().optional().describe("Exclude Microsoft out-of-the-box (OOTB/managed) flows from analysis (default: true). Set to false to include all flows."),
    },
    async ({ flowId, maxFlows, outputFormat, excludeOotb }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.analyzeFlowComplexity(flowId, maxFlows ?? 0, excludeOotb ?? true);

        const lines: string[] = [];
        const ootbNote = result.summary.ootbExcluded ? `, ${result.summary.ootbExcluded} OOTB excluded` : '';
        lines.push(`# Flow Complexity Analysis (${result.summary.total} flows${ootbNote})`);
        lines.push('');
        lines.push(`- Average Score: ${result.summary.averageComplexity}`);
        lines.push(`- By Risk: Low=${result.summary.byRiskLevel.Low}, Medium=${result.summary.byRiskLevel.Medium}, High=${result.summary.byRiskLevel.High}, Critical=${result.summary.byRiskLevel.Critical}`);
        lines.push(`- URLs Found: ${result.summary.totalUrlsFound ?? 0}`);
        lines.push(`- Secret Warnings: ${result.summary.totalSecretWarnings ?? 0} in ${result.summary.flowsWithSecretWarnings ?? 0} flows`);
        if (result.summary.uniqueEnvironmentVariables && result.summary.uniqueEnvironmentVariables.length > 0) {
          lines.push(`- Environment Variables Referenced: ${result.summary.uniqueEnvironmentVariables.join(', ')}`);
        }
        lines.push('');

        if (result.summary.highRiskFlows.length > 0) {
          lines.push('## High/Critical Risk Flows');
          for (const name of result.summary.highRiskFlows) {
            const flow = result.flows.find(f => f.name === name);
            if (flow) {
              lines.push(`- **${name}** - Score: ${flow.complexity.score} (${flow.complexity.riskLevel})`);
            }
          }
          lines.push('');
        }

        const flowsWithSecrets = result.flows.filter(f => f.secretWarnings && f.secretWarnings.length > 0);
        if (flowsWithSecrets.length > 0) {
          lines.push('## Security Warnings');
          lines.push('');
          lines.push('| Flow | Action | Field | Warning |');
          lines.push('|------|--------|-------|---------|');
          for (const flow of flowsWithSecrets) {
            for (const w of flow.secretWarnings!) {
              lines.push(`| ${flow.name} | ${w.actionName} | ${w.fieldPath} | ${w.message} |`);
            }
          }
          lines.push('');
        }

        if (outputFormat !== 'summary') {
          lines.push('## Full Details');
          lines.push('');
          lines.push('```json');
          lines.push(JSON.stringify(result, null, 2));
          lines.push('```');
        }

        return { content: [{ type: "text", text: lines.join('\n') }] };
      } catch (error: any) {
        console.error("Error analyzing flow complexity:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to analyze flow complexity: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "gen-integration-audit",
    `Generate a comprehensive integration audit report for the PowerPlatform environment.

This top-down report aggregates all integration touchpoints:

OUTBOUND: Service endpoints, flows with HTTP/external calls, plugins with external access
INBOUND: Webhook registrations, flows with external triggers
COMPLEXITY: Flow complexity scores, risk levels, URL extraction, secret detection
ENVIRONMENT: Environment variable inventory with URL validation
PLUGINS: Plugin assembly inventory

Includes URL validation (flag endpoints/variables not matching required patterns),
hardcoded secret detection in flows, and environment variable analysis.

Returns a pre-formatted Markdown report. Use outputFormat="summary" for a compact view.`,
    {
      maxFlows: z.number().optional().describe("Maximum flows to analyze (default: 0 = unlimited)"),
      maxRecords: z.number().optional().describe("Maximum records to return for service endpoints, webhooks, and plugin assemblies (default: 100). Increase to get all items in large environments."),
      requiredUrlStrings: z.array(z.string()).optional().describe(
        "URL patterns to validate against. Endpoints and env vars not matching are flagged.\n\nExamples:\n  - `[\"mycompany.com\"]`\n  - `[\"prod.api.com\", \"staging.api.com\"]`"
      ),
      outputFormat: z.enum(["summary", "full"]).optional().describe(
        descWithExamples("Output format", OUTPUT_FORMAT_EXAMPLES)
      ),
      excludeOotb: z.boolean().optional().describe("Exclude Microsoft out-of-the-box (OOTB) components from results (default: true). Set to false to include all items."),
    },
    async ({ maxFlows, maxRecords, requiredUrlStrings, outputFormat, excludeOotb }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.generateIntegrationAuditReport(
          maxFlows ?? 0,
          requiredUrlStrings,
          outputFormat,
          excludeOotb ?? true,
          maxRecords ?? 100
        );

        return {
          content: [
            {
              type: "text",
              text: result.markdownReport,
            },
            {
              type: "text",
              text: `\n\n---\n\n**Full JSON Data:**\n\n${JSON.stringify({
                summary: result.summary,
                riskAssessment: result.riskAssessment,
                outbound: {
                  serviceEndpointCount: result.outbound.serviceEndpoints.length,
                  httpFlowCount: result.outbound.httpFlows.length,
                  externalPluginCount: result.outbound.externalPlugins.length,
                },
                inbound: {
                  webhookCount: result.inbound.webhooks.length,
                  externalTriggerFlowCount: result.inbound.externalTriggerFlows.length,
                },
                complexity: result.complexity.summary,
              }, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating integration audit report:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate integration audit report: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-env-variables",
    `Get all environment variable definitions from the PowerPlatform environment.

Environment variables store configuration values (URLs, connection strings, feature flags)
that can be referenced by flows and other components. Sensitive variables are masked.

Optionally validate URL-type variables against required patterns to flag diverging values
(e.g. variables pointing to wrong environments).

Returns:
- Schema name, display name, type (String/Number/Boolean/JSON/Secret)
- Current value, default value, and effective value
- Managed status and sensitivity flag
- Diverging variables (when requiredUrlStrings provided)`,
    {
      maxRecords: z.number().optional().describe("Maximum variables to return (default: 500)"),
      requiredUrlStrings: z.array(z.string()).optional().describe(
        "URL patterns to validate against. URL-type variables not matching any pattern are flagged.\n\nExamples:\n  - `[\"mycompany.com\"]`\n  - `[\"prod.api.com\", \"staging.api.com\"]`"
      ),
      outputFormat: z.enum(["summary", "full"]).optional().describe(
        descWithExamples("Output format", OUTPUT_FORMAT_EXAMPLES)
      ),
      excludeOotb: z.boolean().optional().describe("Exclude Microsoft out-of-the-box (OOTB) components from results (default: true). Set to false to include all items."),
    },
    async ({ maxRecords, requiredUrlStrings, outputFormat, excludeOotb }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getEnvironmentVariables(maxRecords ?? 500, requiredUrlStrings, excludeOotb ?? true);
        const ootbNote = result.summary.ootbExcluded ? `, ${result.summary.ootbExcluded} OOTB excluded` : '';

        const lines: string[] = [];
        lines.push(`# Environment Variables (${result.summary.total} found${ootbNote})`);
        lines.push('');
        lines.push(`Types: ${Object.entries(result.summary.byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        lines.push('');

        if (result.divergingVariables.length > 0) {
          lines.push('## Diverging Variables');
          lines.push('');
          lines.push('| Schema Name | Display Name | Value | Reason |');
          lines.push('|-------------|-------------|-------|--------|');
          for (const d of result.divergingVariables) {
            const val = d.variable.isSensitive ? '***' : (d.variable.effectiveValue ?? '(none)');
            lines.push(`| ${d.variable.schemaName} | ${d.variable.displayName} | ${val} | ${d.reason} |`);
          }
          lines.push('');
        }

        if (outputFormat !== 'summary') {
          lines.push('## All Variables');
          lines.push('');
          lines.push('| Schema Name | Display Name | Type | Effective Value | Managed |');
          lines.push('|-------------|-------------|------|-----------------|---------|');
          for (const v of result.allVariables) {
            const val = v.isSensitive ? (v.maskedValue ?? '***') : (v.effectiveValue ?? v.defaultValue ?? '(none)');
            const managed = v.isManaged ? 'Yes' : 'No';
            lines.push(`| ${v.schemaName} | ${v.displayName} | ${v.type} | ${val} | ${managed} |`);
          }
          lines.push('');
        }

        return { content: [{ type: "text", text: lines.join('\n') }] };
      } catch (error: any) {
        console.error("Error getting environment variables:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get environment variables: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
