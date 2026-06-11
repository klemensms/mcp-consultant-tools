/**
 * App Tools - 4 tools for model-driven app inspection
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerAppTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-apps",
    "Get all model-driven apps in the PowerPlatform environment. Returns app name, unique name, URL, published status, and solution association.",
    {
      activeOnly: z.boolean().optional().describe("Only return active apps (default: false)"),
      maxRecords: z.number().optional().describe("Maximum number of apps to return (default: 100)"),
      includeUnpublished: z.boolean().optional().describe("Include unpublished/draft apps (default: true)"),
      solutionUniqueName: z.string().optional().describe(
        descWithExamples("Filter apps by solution unique name", SOLUTION_NAME_EXAMPLES)
      ),
    },
    async ({ activeOnly, maxRecords, includeUnpublished, solutionUniqueName }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getApps(
          activeOnly || false,
          maxRecords || 100,
          includeUnpublished !== undefined ? includeUnpublished : true,
          solutionUniqueName
        );
        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Model-Driven Apps (found ${result.totalCount}):\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting apps:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get apps: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-app",
    "Get detailed information about a specific model-driven app",
    {
      appId: z.string().describe("The GUID of the app (appmoduleid)"),
    },
    async ({ appId }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getApp(appId);
        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Model-Driven App '${(result as any).name}':\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting app:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get app: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-app-components",
    "Get all components (entities, forms, views, sitemaps) in a model-driven app",
    {
      appId: z.string().describe("The GUID of the app (appmoduleid)"),
    },
    async ({ appId }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getAppComponents(appId);
        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `App Components (found ${result.totalCount}):\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting app components:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get app components: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-app-sitemap",
    "Get the sitemap (navigation) configuration for a model-driven app",
    {
      appId: z.string().describe("The GUID of the app (appmoduleid)"),
    },
    async ({ appId }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getAppSitemap(appId);
        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `App Sitemap:\n\n${resultStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting app sitemap:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get app sitemap: ${error.message}`,
            },
          ],
          isError: true
        };
      }
    }
  );
}
