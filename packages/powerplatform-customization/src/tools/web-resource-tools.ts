/**
 * Web Resource Tools - 4 tools for web resource management
 *
 * Tools: create-web-resource, update-web-resource, delete-web-resource, deploy-web-resource-file
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, WEB_RESOURCE_TYPE_EXAMPLES, WEB_RESOURCE_FILE_PATH_EXAMPLES, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerWebResourceTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-web-resource",
  "Create a new web resource (JavaScript, CSS, HTML, Image, etc.). Content must be base64-encoded. PREFER deploy-web-resource-file when the file exists locally — it handles encoding automatically and avoids large inline payloads. Requires publish-customizations afterwards.",
  {
    name: z.string().describe("Web resource name with publisher prefix and path (e.g., 'si_/scripts/validation.js', 'contoso_/images/logo.png')"),
    displayName: z.string().describe("Display name"),
    webResourceType: z.number().describe(
      descWithExamples("Web resource type number", WEB_RESOURCE_TYPE_EXAMPLES)
    ),
    content: z.string().describe("Base64-encoded content of the file"),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ name, displayName, webResourceType, content, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createWebResource(
        name, displayName, webResourceType, content,
        { description, solutionUniqueName: solution }
      ) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully created web resource '${name}'\n` +
                `Web Resource ID: ${result.webresourceid}\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error creating web resource:", error);
      return { content: [{ type: "text", text: `Failed to create web resource: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-web-resource",
  "Update an existing web resource. PREFER deploy-web-resource-file when the content exists as a local file — it reads and base64-encodes the file for you, avoids large inline payloads, and preserves exact formatting.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)"),
    displayName: z.string().optional().describe("Display name"),
    content: z.string().optional().describe("Base64-encoded content"),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ webResourceId, displayName, content, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      const updates: any = {};
      if (displayName) updates.displayname = displayName;
      if (content) updates.content = content;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateWebResource(webResourceId, updates, solution);

      return {
        content: [{
          type: "text",
          text: `Successfully updated web resource '${webResourceId}'\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error updating web resource:", error);
      return { content: [{ type: "text", text: `Failed to update web resource: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-web-resource",
  "Delete a web resource. WARNING: Use check-dependencies (read-only package) first to verify no forms or scripts reference this resource.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID). Get from get-web-resources in the read-only package.")
  },
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ webResourceId }: any) => {
    try {
      const service = ctx.pp;
      await service.deleteWebResource(webResourceId);

      return {
        content: [{
          type: "text",
          text: `Successfully deleted web resource '${webResourceId}'\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error deleting web resource:", error);
      return { content: [{ type: "text", text: `Failed to delete web resource: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deploy-web-resource-file",
  "PREFERRED tool for deploying web resources. Reads a local file, base64-encodes it server-side, and creates or updates the web resource — no need to pass content inline. " +
  "Auto-detects type from file extension (.html→HTML, .js→JavaScript, .css→CSS, etc.). " +
  "Always use this instead of create-web-resource/update-web-resource when the file exists on disk (e.g., checked into source control). " +
  "Avoids large base64 payloads in tool calls, preserves exact file formatting, and is significantly more efficient. " +
  "Requires publish-customizations afterwards.",
  {
    filePath: z.string().describe(
      descWithExamples(
        "Path to a local web resource file. Supports absolute and relative paths.",
        WEB_RESOURCE_FILE_PATH_EXAMPLES
      )
    ),
    webResourceId: z.string().optional().describe("If provided, updates this existing web resource. Omit to create a new one."),
    name: z.string().optional().describe("Web resource name with publisher prefix (e.g., 'si_/scripts/validation.js'). Required when creating new."),
    displayName: z.string().optional().describe("Display name. Required when creating new."),
    webResourceType: z.number().optional().describe(
      descWithExamples("Override auto-detected type from file extension", WEB_RESOURCE_TYPE_EXAMPLES)
    ),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ filePath, webResourceId, name, displayName, webResourceType, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.deployWebResourceFromFile(filePath, {
        webResourceId, name, displayName, webResourceType, description, solutionUniqueName: solution,
      });

      return {
        content: [{
          type: "text",
          text: `${result.message}\n` +
                (result.webResourceId ? `Web Resource ID: ${result.webResourceId}\n` : '') +
                `\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error deploying web resource from file:", error);
      return { content: [{ type: "text", text: `Failed to deploy web resource from file: ${error.message}` }], isError: true };
    }
  }
);

}
