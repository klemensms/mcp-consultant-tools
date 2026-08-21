/**
 * Analysis Prompts - 6 prompts for reports and analysis
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { formatBestPracticesReport } from '@mcp-consultant-tools/powerplatform-core';

function makePromptResult(text: string) {
  return {
    messages: [
      {
        role: "assistant" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

function makePromptError(message: string) {
  return makePromptResult(`Error: ${message}`);
}

export function registerAnalysisPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "flows-report",
    "Generate a comprehensive report of all Power Automate flows in the environment",
    {
      activeOnly: z.string().optional().describe("Set to 'true' to only include activated flows (default: false)"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getFlows({
          activeOnly: args.activeOnly === 'true',
          maxRecords: 100,
          excludeCustomerInsights: false,
          excludeSystem: false,
          excludeCopilotSales: false,
        });

        let report = `# Power Automate Flows Report\n\n`;
        report += `**Total Flows**: ${result.totalCount}\n\n`;

        if (result.flows.length === 0) {
          report += `No flows found in this environment.\n`;
        } else {
          const activeFlows = result.flows.filter((f: any) => f.state === 'Activated');
          const draftFlows = result.flows.filter((f: any) => f.state === 'Draft');
          const suspendedFlows = result.flows.filter((f: any) => f.state === 'Suspended');

          if (activeFlows.length > 0) {
            report += `## Active Flows (${activeFlows.length})\n\n`;
            activeFlows.forEach((flow: any) => {
              report += `### ${flow.name}\n`;
              report += `- **ID**: ${flow.workflowid}\n`;
              report += `- **Description**: ${flow.description || 'No description'}\n`;
              report += `- **Primary Entity**: ${flow.primaryEntity || 'None'}\n`;
              report += `- **Owner**: ${flow.owner}\n`;
              report += `- **Modified**: ${flow.modifiedOn} by ${flow.modifiedBy}\n`;
              report += `- **Managed**: ${flow.isManaged ? 'Yes' : 'No'}\n\n`;
            });
          }

          if (draftFlows.length > 0) {
            report += `## Draft Flows (${draftFlows.length})\n\n`;
            draftFlows.forEach((flow: any) => {
              report += `- **${flow.name}** (${flow.workflowid})\n`;
              report += `  - Owner: ${flow.owner}, Modified: ${flow.modifiedOn}\n`;
            });
            report += `\n`;
          }

          if (suspendedFlows.length > 0) {
            report += `## Suspended Flows (${suspendedFlows.length})\n\n`;
            suspendedFlows.forEach((flow: any) => {
              report += `- **${flow.name}** (${flow.workflowid})\n`;
              report += `  - Owner: ${flow.owner}, Modified: ${flow.modifiedOn}\n`;
            });
            report += `\n`;
          }
        }

        return makePromptResult(report);
      } catch (error: any) {
        console.error(`Error generating flows report:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "workflows-report",
    "Generate a comprehensive report of all classic Dynamics workflows in the environment",
    {
      activeOnly: z.string().optional().describe("Set to 'true' to only include activated workflows (default: false)"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getWorkflows(args.activeOnly === 'true', 100);

        let report = `# Classic Dynamics Workflows Report\n\n`;
        report += `**Total Workflows**: ${result.totalCount}\n\n`;

        // The report caps at 100 workflows, so it has to say so rather than present a
        // capped count as the environment's total.
        if (result.truncation.hasMore) {
          report += `> ⚠️ TRUNCATED: this report covers the ${result.totalCount} most recently modified workflows of an unknown total. More exist in the environment.\n\n`;
        }

        if (result.workflows.length === 0) {
          report += `No classic workflows found in this environment.\n`;
        } else {
          const activeWorkflows = result.workflows.filter((w: any) => w.state === 'Activated');
          const draftWorkflows = result.workflows.filter((w: any) => w.state === 'Draft');
          const suspendedWorkflows = result.workflows.filter((w: any) => w.state === 'Suspended');

          if (activeWorkflows.length > 0) {
            report += `## Active Workflows (${activeWorkflows.length})\n\n`;
            activeWorkflows.forEach((workflow: any) => {
              report += `### ${workflow.name}\n`;
              report += `- **ID**: ${workflow.workflowid}\n`;
              report += `- **Description**: ${workflow.description || 'No description'}\n`;
              report += `- **Primary Entity**: ${workflow.primaryEntity || 'None'}\n`;
              report += `- **Mode**: ${workflow.mode}\n`;
              report += `- **Triggers**:\n`;
              if (workflow.triggerOnCreate) report += `  - Create\n`;
              if (workflow.triggerOnDelete) report += `  - Delete\n`;
              if (workflow.isOnDemand) report += `  - On Demand\n`;
              report += `- **Owner**: ${workflow.owner}\n`;
              report += `- **Modified**: ${workflow.modifiedOn} by ${workflow.modifiedBy}\n`;
              report += `- **Managed**: ${workflow.isManaged ? 'Yes' : 'No'}\n\n`;
            });
          }

          if (draftWorkflows.length > 0) {
            report += `## Draft Workflows (${draftWorkflows.length})\n\n`;
            draftWorkflows.forEach((workflow: any) => {
              report += `- **${workflow.name}** (${workflow.workflowid})\n`;
              report += `  - Entity: ${workflow.primaryEntity}, Owner: ${workflow.owner}\n`;
            });
            report += `\n`;
          }

          if (suspendedWorkflows.length > 0) {
            report += `## Suspended Workflows (${suspendedWorkflows.length})\n\n`;
            suspendedWorkflows.forEach((workflow: any) => {
              report += `- **${workflow.name}** (${workflow.workflowid})\n`;
              report += `  - Entity: ${workflow.primaryEntity}, Owner: ${workflow.owner}\n`;
            });
            report += `\n`;
          }
        }

        return makePromptResult(report);
      } catch (error: any) {
        console.error(`Error generating workflows report:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "business-rules-report",
    "Generate a comprehensive report of all business rules in the environment (read-only for troubleshooting)",
    {
      activeOnly: z.string().optional().describe("Set to 'true' to only include activated business rules (default: false)"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getBusinessRules(args.activeOnly === 'true', 100);

        let report = `# Business Rules Report\n\n`;
        report += `**Total Business Rules**: ${result.totalCount}\n\n`;

        if (result.businessRules.length === 0) {
          report += `No business rules found in this environment.\n`;
        } else {
          const activeRules = result.businessRules.filter((r: any) => r.state === 'Activated');
          const draftRules = result.businessRules.filter((r: any) => r.state === 'Draft');
          const suspendedRules = result.businessRules.filter((r: any) => r.state === 'Suspended');

          if (activeRules.length > 0) {
            report += `## Active Business Rules (${activeRules.length})\n\n`;
            activeRules.forEach((rule: any) => {
              report += `### ${rule.name}\n`;
              report += `- **ID**: ${rule.workflowid}\n`;
              report += `- **Description**: ${rule.description || 'No description'}\n`;
              report += `- **Primary Entity**: ${rule.primaryEntity || 'None'}\n`;
              report += `- **Owner**: ${rule.owner}\n`;
              report += `- **Modified**: ${rule.modifiedOn} by ${rule.modifiedBy}\n`;
              report += `- **Managed**: ${rule.isManaged ? 'Yes' : 'No'}\n\n`;
            });
          }

          if (draftRules.length > 0) {
            report += `## Draft Business Rules (${draftRules.length})\n\n`;
            draftRules.forEach((rule: any) => {
              report += `- **${rule.name}** (${rule.workflowid})\n`;
              report += `  - Entity: ${rule.primaryEntity}, Owner: ${rule.owner}\n`;
            });
            report += `\n`;
          }

          if (suspendedRules.length > 0) {
            report += `## Suspended Business Rules (${suspendedRules.length})\n\n`;
            suspendedRules.forEach((rule: any) => {
              report += `- **${rule.name}** (${rule.workflowid})\n`;
              report += `  - Entity: ${rule.primaryEntity}, Owner: ${rule.owner}\n`;
            });
            report += `\n`;
          }
        }

        report += `\n---\n\n`;
        report += `*Note: Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.*\n`;

        return makePromptResult(report);
      } catch (error: any) {
        console.error(`Error generating business rules report:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "app-overview",
    "Generate a comprehensive overview report for a model-driven app including components and configuration",
    {
      appId: z.string().describe("The GUID of the app (appmoduleid)"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;

        const app = await service.getApp(args.appId) as any;
        const components = await service.getAppComponents(args.appId);
        const sitemap = await service.getAppSitemap(args.appId) as any;

        let report = `# Model-Driven App Overview: ${app.name}\n\n`;

        report += `## Basic Information\n`;
        report += `- **App ID**: ${app.appmoduleid}\n`;
        report += `- **Unique Name**: ${app.uniquename}\n`;
        report += `- **Description**: ${app.description || 'No description'}\n`;
        report += `- **State**: ${app.state}\n`;
        report += `- **Navigation Type**: ${app.navigationtype}\n`;
        report += `- **Featured**: ${app.isfeatured ? 'Yes' : 'No'}\n`;
        report += `- **Default App**: ${app.isdefault ? 'Yes' : 'No'}\n`;
        report += `- **Published On**: ${app.publishedon || 'Not published'}\n`;
        report += `- **Created**: ${app.createdon} by ${app.createdBy || 'Unknown'}\n`;
        report += `- **Modified**: ${app.modifiedon} by ${app.modifiedBy || 'Unknown'}\n\n`;

        if (app.publisher) {
          report += `## Publisher\n`;
          report += `- **Name**: ${app.publisher.friendlyname}\n`;
          report += `- **Unique Name**: ${app.publisher.uniquename}\n`;
          report += `- **Prefix**: ${app.publisher.customizationprefix}\n\n`;
        }

        report += `## Components Summary\n`;
        report += `**Total Components**: ${components.totalCount}\n\n`;

        if (components.totalCount > 0) {
          Object.keys(components.groupedByType).forEach((typeName: string) => {
            const typeComponents = components.groupedByType[typeName];
            report += `- **${typeName}**: ${typeComponents.length}\n`;
          });
          report += `\n`;

          report += `## Detailed Components\n\n`;
          Object.keys(components.groupedByType).forEach((typeName: string) => {
            const typeComponents = components.groupedByType[typeName];
            report += `### ${typeName} (${typeComponents.length})\n`;
            typeComponents.forEach((comp: any, idx: number) => {
              report += `${idx + 1}. ID: ${comp.objectid}\n`;
            });
            report += `\n`;
          });
        }

        if (sitemap.hasSitemap) {
          report += `## Navigation (Sitemap)\n`;
          report += `- **Sitemap Name**: ${sitemap.sitemapname}\n`;
          report += `- **App Aware**: ${sitemap.isappaware ? 'Yes' : 'No'}\n`;
          report += `- **Collapsible Groups**: ${sitemap.enablecollapsiblegroups ? 'Yes' : 'No'}\n`;
          report += `- **Show Home**: ${sitemap.showhome ? 'Yes' : 'No'}\n`;
          report += `- **Show Pinned**: ${sitemap.showpinned ? 'Yes' : 'No'}\n`;
          report += `- **Show Recents**: ${sitemap.showrecents ? 'Yes' : 'No'}\n`;
          report += `- **Managed**: ${sitemap.ismanaged ? 'Yes' : 'No'}\n\n`;
        } else {
          report += `## Navigation (Sitemap)\n`;
          report += `⚠ No sitemap configured for this app\n\n`;
        }

        report += `## Available Actions\n`;
        report += `- Add entities: Use \`add-entities-to-app\` tool\n`;
        report += `- Validate app: Use \`validate-app\` tool\n`;
        report += `- Publish app: Use \`publish-app\` tool\n`;
        report += `- View sitemap XML: Use \`get-app-sitemap\` tool\n\n`;

        report += `---\n\n`;
        report += `*Generated by MCP Consultant Tools*\n`;

        return makePromptResult(report);
      } catch (error: any) {
        console.error(`Error generating app overview:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "dataverse-best-practices-report",
    "Generate formatted markdown report from Dataverse best practice validation results. Groups violations by severity, provides actionable recommendations, and highlights compliant entities.",
    {
      validationResult: z.string().describe("JSON result from validate-dataverse tool")
    },
    async (args: any) => {
      try {
        const result = JSON.parse(args.validationResult);
        const report = formatBestPracticesReport(result);

        return makePromptResult(report);
      } catch (error: any) {
        console.error("Error generating best practices report:", error);
        return makePromptError(`${error.message}\n\nPlease ensure the validationResult is valid JSON from the validate-dataverse tool.`);
      }
    }
  );

  server.prompt(
    "integration-audit-report",
    "Generate a comprehensive integration audit report with drill-down capability",
    {},
    async () => {
      try {
        const service = ctx.pp;
        const result = await service.generateIntegrationAuditReport(50);

        return makePromptResult(result.markdownReport);
      } catch (error: any) {
        console.error("Error generating integration audit report:", error);
        return makePromptError(error.message);
      }
    }
  );
}
