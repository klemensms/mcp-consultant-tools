/**
 * Form/View Tools - 7 tools for forms, views, and web resources
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES } from '../tool-examples.js';

export function registerFormViewTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-webres-deps",
    "Get all dependencies for a web resource",
    {
      webResourceId: z.string().describe("Web resource ID (GUID)")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ webResourceId }: any) => {
      try {
        const service = ctx.pp;
        const dependencies = await service.getWebResourceDependencies(webResourceId);

        return {
          content: [{ type: "text", text: `Web Resource Dependencies:\n${JSON.stringify(dependencies, null, 2)}` }]
        };
      } catch (error: any) {
        console.error("Error getting web resource dependencies:", error);
        return { content: [{ type: "text", text: `Failed to get web resource dependencies: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "preview-unpublished",
    "Preview all components with unpublished customizations",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const service = ctx.pp;
        const unpublished = await service.previewUnpublishedChanges();

        return {
          content: [{ type: "text", text: `Unpublished Changes:\n${JSON.stringify(unpublished, null, 2)}` }]
        };
      } catch (error: any) {
        console.error("Error previewing unpublished changes:", error);
        return { content: [{ type: "text", text: `Failed to preview unpublished changes: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-forms",
    "Get all forms (Main, QuickCreate, QuickView, Card) for a Dataverse entity.",
    {
      entityLogicalName: z.string().describe(
        descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
      )
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityLogicalName }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getForms(entityLogicalName) as any;

        const forms = result.value || [];
        const typeNames: { [key: number]: string } = { 2: "Main", 7: "QuickCreate", 8: "QuickView", 10: "Card" };

        return {
          content: [
            {
              type: "text",
              text: `Found ${forms.length} form(s) for entity '${entityLogicalName}':\n\n` +
                    forms.map((f: any) =>
                      `- ${f.name} (${typeNames[f.type] || f.type})\n  ID: ${f.formid}`
                    ).join('\n')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting forms:", error);
        return {
          content: [{ type: "text", text: `Failed to get forms: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-views",
    "Get all saved views (system and personal) for a Dataverse entity, including default view indicator and query type.",
    {
      entityLogicalName: z.string().describe(
        descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
      )
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityLogicalName }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getViews(entityLogicalName) as any;

        const views = result.value || [];

        return {
          content: [
            {
              type: "text",
              text: `Found ${views.length} view(s) for entity '${entityLogicalName}':\n\n` +
                    views.map((v: any) =>
                      `- ${v.name}${v.isdefault ? ' [DEFAULT]' : ''}\n  ID: ${v.savedqueryid}\n  Query Type: ${v.querytype}`
                    ).join('\n')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting views:", error);
        return {
          content: [{ type: "text", text: `Failed to get views: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-view-fetchxml",
    "Get the FetchXML query from a view",
    {
      viewId: z.string().describe("View ID (GUID)")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ viewId }: any) => {
      try {
        const service = ctx.pp;
        const view = await service.getViewFetchXml(viewId) as any;

        return {
          content: [
            {
              type: "text",
              text: `View: ${view.name}\nEntity: ${view.returnedtypecode}\nQuery Type: ${view.querytype}\n\nFetchXML:\n${view.fetchxml}`
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting view FetchXML:", error);
        return {
          content: [{ type: "text", text: `Failed to get view FetchXML: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-web-resource",
    "Get a web resource by ID",
    {
      webResourceId: z.string().describe("Web resource ID (GUID)")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ webResourceId }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getWebResource(webResourceId) as any;

        return {
          content: [
            {
              type: "text",
              text: `Web Resource: ${result.name}\n` +
                    `Display Name: ${result.displayname}\n` +
                    `Type: ${result.webresourcetype}\n` +
                    `Description: ${result.description || 'N/A'}\n` +
                    `Modified: ${result.modifiedon}`
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting web resource:", error);
        return {
          content: [{ type: "text", text: `Failed to get web resource: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-web-resources",
    "Get web resources by name pattern (optional)",
    {
      nameFilter: z.string().optional().describe("Name filter (contains)")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ nameFilter }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getWebResources(nameFilter) as any;

        const webResources = result.value || [];

        return {
          content: [
            {
              type: "text",
              text: `Found ${webResources.length} web resource(s):\n\n` +
                    webResources.map((wr: any) =>
                      `- ${wr.name}\n  Type: ${wr.webresourcetype}\n  ID: ${wr.webresourceid}`
                    ).join('\n')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting web resources:", error);
        return {
          content: [{ type: "text", text: `Failed to get web resources: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}
