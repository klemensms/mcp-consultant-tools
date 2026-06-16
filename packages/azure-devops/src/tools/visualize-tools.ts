/**
 * Visualization Tools — Generative UI via MCP Apps
 *
 * Two-tool pattern:
 * 1. visualize-data: Fetches work items, returns data + design system prompt to host LLM
 * 2. render-visualization: Receives LLM-generated HTML, sanitizes it, returns structuredContent
 *
 * The host LLM generates the HTML using its own subscription — no API key, no extra cost.
 */
import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DESIGN_SYSTEM_PROMPT } from '../genui/design-system-prompt.js';
import { sanitizeGenUiHtml } from '../genui/sanitize-html.js';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerVisualizeTools(server: any, ctx: ServiceContext): void {
  const workItemsResourceUri = "ui://ado/work-items";

  // Tool 1: Fetch data and instruct host LLM to generate HTML
  server.tool(
    "visualize-data",
    "Fetch work item data and prepare it for a rich visual dashboard. ONLY use this tool when the user explicitly asks for a " +
    "visual, chart, dashboard, or graphic representation of their data (e.g. 'visualize', 'show me a chart', 'create a dashboard'). " +
    "Do NOT use for regular queries — use query-work-items or run-saved-query instead, which are faster. " +
    "Accepts either a WIQL query or a saved query ID (GUID). " +
    "After receiving the response, generate a complete HTML snippet following the design system rules, " +
    "then call render-visualization with the HTML.",
    {
      project: z.string().describe("The ADO project name"),
      wiql: z.string().optional().describe(
        "WIQL query to fetch work items. Provide either wiql OR queryId, not both. " +
        "Example: SELECT [System.Id], [System.Title], [System.State], " +
        "[System.WorkItemType], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = 'MyProject' " +
        "AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC"
      ),
      queryId: z.string().optional().describe(
        "Saved query GUID. Provide either queryId OR wiql, not both. " +
        "Found in ADO query URLs: https://dev.azure.com/{org}/{project}/_queries/query/{queryId}/"
      ),
      intent: z.string().describe(
        "What visualization to create. Examples: 'sprint status dashboard', 'burndown chart', " +
        "'team workload by assignee', 'priority breakdown', 'bug trend over time'"
      ),
      theme: z.enum(["light", "dark"]).optional().describe("Color theme (default: light)"),
      maxResults: zCoerceNumber().optional().describe("Maximum work items to fetch (default: 20 for visualization)"),
    },
    // Fetches work item data and returns a design prompt; reads ADO, never writes → read.
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, wiql, queryId, intent, theme, maxResults }: any) => {
      try {
        if (!wiql && !queryId) {
          return {
            content: [{ type: "text", text: "Error: Provide either 'wiql' or 'queryId' parameter." }],
            isError: true,
          };
        }

        const effectiveMaxResults = maxResults ?? 20;
        let items: any[];

        if (queryId) {
          // Execute saved query
          const result = await ctx.workItem.runSavedQuery(project, queryId, effectiveMaxResults);
          items = Array.isArray(result) ? result : (result as any)?.workItems ?? [];
        } else {
          // Execute WIQL query
          const result = await ctx.workItem.queryWorkItems(project, wiql, effectiveMaxResults);
          items = Array.isArray(result) ? result : (result as any)?.workItems ?? result;
        }
        const itemCount = Array.isArray(items) ? items.length : 0;

        const org = process.env.AZUREDEVOPS_ORGANIZATION || 'unknown-org';
        const effectiveTheme = theme || 'light';

        return {
          content: [{
            type: "text",
            text: [
              `## Visualization Data (${itemCount} work items)`,
              `**Intent:** ${intent}`,
              `**Theme:** ${effectiveTheme}`,
              `**Organization:** ${org}`,
              `**Project:** ${project}`,
              ``,
              `### Work Item Data`,
              '```json',
              JSON.stringify(items, null, 2),
              '```',
              ``,
              `### Design System Rules`,
              ``,
              DESIGN_SYSTEM_PROMPT,
              ``,
              `### Instructions`,
              ``,
              `Generate a complete HTML snippet following the design system rules above.`,
              `Use the organization "${org}" and project "${project}" to construct work item URLs.`,
              `The visualization intent is: "${intent}"`,
              `Theme: "${effectiveTheme}"`,
              ``,
              `After generating the HTML, call the \`render-visualization\` tool with:`,
              `- \`html\`: the complete HTML snippet`,
              `- \`title\`: a short title for the visualization`,
              ``,
              `Return ONLY the HTML when calling render-visualization. No markdown, no explanation.`,
            ].join('\n'),
          }],
        };
      } catch (error: any) {
        console.error("Error in visualize-data:", error);
        return {
          content: [{ type: "text", text: `Failed to fetch work item data: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: Receive generated HTML and render it via MCP App
  registerAppTool(
    server,
    "render-visualization",
    {
      title: "Render Visualization",
      description:
        "Render generated HTML as an interactive visualization in the MCP App. " +
        "Call this after generating HTML from visualize-data results. " +
        "Pass the complete HTML snippet — it will be sanitized and rendered in an iframe.",
      inputSchema: {
        html: z.string().describe("The complete HTML snippet to render. Must be self-contained with inline CSS and scripts."),
        title: z.string().optional().describe("Short title for the visualization (e.g. 'Sprint Status Dashboard')"),
      },
      // Sanitizes + renders HTML in an iframe locally; no ADO access → read, closed-world.
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: workItemsResourceUri } },
    },
    async ({ html, title }: any) => {
      try {
        // Validate: basic HTML check
        if (!html || (!html.includes('<') && !html.includes('>'))) {
          return {
            content: [{
              type: "text",
              text: "Error: The provided content does not appear to be valid HTML. Please regenerate following the design system rules.",
            }],
            isError: true,
          };
        }

        // Strip markdown code fences if the LLM wrapped the HTML
        let cleanHtml = html;
        if (cleanHtml.startsWith('```')) {
          cleanHtml = cleanHtml.replace(/^```(?:html)?\n?/i, '').replace(/\n?```$/i, '').trim();
        }

        // Sanitize
        const sanitized = sanitizeGenUiHtml(cleanHtml);

        const displayTitle = title || 'Visualization';
        return {
          content: [{ type: "text", text: `Rendered: ${displayTitle}` }],
          structuredContent: { type: "genui", html: sanitized, title: displayTitle },
        };
      } catch (error: any) {
        console.error("Error in render-visualization:", error);
        return {
          content: [{ type: "text", text: `Failed to render visualization: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
