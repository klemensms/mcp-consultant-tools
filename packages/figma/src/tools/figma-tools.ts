/**
 * Figma tool registrations
 */
import { z } from "zod";
import {
  createErrorResponse,
  createContextSafeResponse,
  getContextSafeConfig,
  withContextSafeParam,
} from "@mcp-consultant-tools/core";
import type { ServiceContext } from "../types.js";
import type { FigmaDataOptions } from "../models/index.js";
import { extractSemanticData } from "../figma/extractors/semantic-extractor.js";
import type { StickyCategory, LegacyStickyCategory } from "../figma/extractors/semantic-extractor.js";
import { extractAdoStories } from "../figma/extractors/ado-story-extractor.js";
import {
  descWithExamples,
  FILE_KEY_EXAMPLES,
  NODE_ID_EXAMPLES,
  EXTRACTOR_EXAMPLES,
  STICKY_CATEGORY_EXAMPLES,
  STORY_ID_PATTERN_EXAMPLES,
  ADO_ORG_EXAMPLES,
  ADO_PROJECT_EXAMPLES,
} from "../tool-examples.js";

export function registerFigmaTools(server: any, ctx: ServiceContext): void {
  const csConfig = getContextSafeConfig('.mcp-figma-cache');

  // Tool: get-figma-data
  server.tool(
    "get-figma-data",
    "Get comprehensive Figma design data including layout, text, styles, and components. Fetches from Figma API and transforms into simplified, AI-friendly format. Can fetch entire files or specific nodes. Automatically deduplicates styles. Supports optimization options to reduce context window usage.",
    withContextSafeParam({
      fileKey: z.string().describe(descWithExamples("Figma file key (alphanumeric string from URL)", FILE_KEY_EXAMPLES)),
      nodeId: z.string().optional().describe(descWithExamples("Optional specific node ID(s) to fetch. Format: '1234:5678' or multiple '1:10;2:20'. If omitted, fetches entire file.", NODE_ID_EXAMPLES)),
      depth: z.number().optional().describe("Optional tree traversal depth limit. Useful for large files. Example: depth=3 stops after 3 levels of children."),
      excludeStyles: z.boolean().optional().describe("Remove all styling info (fills, strokes, effects, textStyle, opacity, borderRadius) and globalVars.styles. Useful for understanding architecture without visual details. Default: true. Set to false for full styling data."),
      tablesToMarkdown: z.boolean().optional().describe("Convert TABLE nodes to markdown table format instead of nested node structures. Significantly reduces token usage for tables. Default: true. Set to false for full node tree."),
      simplifyConnectors: z.boolean().optional().describe("Simplify CONNECTOR nodes to just connection endpoints (startNodeId, endNodeId, text). Preserves relationship data while removing visual properties. Default: true. Set to false for full connector data."),
      simplifyComponentInstances: z.boolean().optional().describe("Keep componentId and componentProperties on INSTANCE nodes but remove visual styling. Ideal for ADO User Story components. Default: true. Set to false for full instance data."),
      extractors: z.array(z.enum(["layout", "text", "visuals", "component"])).optional().describe(descWithExamples("Override which extractors to use. Default uses all.", EXTRACTOR_EXAMPLES)),
    }),
    async ({
      fileKey,
      nodeId,
      depth,
      excludeStyles,
      tablesToMarkdown,
      simplifyConnectors,
      simplifyComponentInstances,
      extractors,
      returnFullResponse,
    }: {
      fileKey: string;
      nodeId?: string;
      depth?: number;
      excludeStyles?: boolean;
      tablesToMarkdown?: boolean;
      simplifyConnectors?: boolean;
      simplifyComponentInstances?: boolean;
      extractors?: ("layout" | "text" | "visuals" | "component")[];
      returnFullResponse?: boolean;
    }) => {
      try {
        const dataOptions: FigmaDataOptions = {
          excludeStyles,
          tablesToMarkdown,
          simplifyConnectors,
          simplifyComponentInstances,
          extractors,
        };

        const result = await ctx.figma.getFigmaData(fileKey, nodeId, depth, dataOptions);
        return createContextSafeResponse({
          toolName: 'get-figma-data',
          data: result,
          config: csConfig,
          returnFullResponse,
          summaryHint: (d) => {
            const nodeCount = d?.nodes?.length ?? d?.children?.length ?? 'unknown';
            return `${nodeCount} nodes extracted from file ${fileKey}${nodeId ? ` (node ${nodeId})` : ''}`;
          },
        });
      } catch (error) {
        return createErrorResponse(error, "get-figma-data");
      }
    }
  );

  // Tool: get-figma-semantic
  server.tool(
    "get-figma-semantic",
    "Extract semantically meaningful data from FigJam boards while discarding positional/visual information. Produces deterministic, diff-friendly output ideal for change detection. Categorizes sticky notes by color, extracts user story IDs, and preserves connector relationships.",
    withContextSafeParam({
      fileKey: z.string().describe(descWithExamples("Figma file key (alphanumeric string from URL)", FILE_KEY_EXAMPLES)),
      nodeId: z.string().optional().describe(descWithExamples("Optional specific node/section ID to fetch. If omitted, fetches entire file.", NODE_ID_EXAMPLES)),
      stickyColorOverrides: z.record(z.enum([
        "blocker", "tbd", "investigation", "done", "info", "note", "unknown",
        "si-investigation" // deprecated alias for "investigation", accepted for backward compatibility
      ])).optional().describe(descWithExamples("Optional color to category overrides. Map hex colors to categories. ('si-investigation' is a deprecated alias for 'investigation' — output always uses 'investigation'.)", STICKY_CATEGORY_EXAMPLES)),
      storyIdPattern: z.string().optional().describe(descWithExamples("Optional custom regex pattern for extracting story IDs", STORY_ID_PATTERN_EXAMPLES)),
      includeScreenshot: z.boolean().optional().describe(
        "When true and nodeId is set, returns a 2x PNG screenshot of the node as an image content block alongside the semantic data."
      ),
    }),
    async ({
      fileKey,
      nodeId,
      stickyColorOverrides,
      storyIdPattern,
      includeScreenshot,
      returnFullResponse,
    }: {
      fileKey: string;
      nodeId?: string;
      stickyColorOverrides?: Record<string, StickyCategory | LegacyStickyCategory>;
      storyIdPattern?: string;
      includeScreenshot?: boolean;
      returnFullResponse?: boolean;
    }) => {
      try {
        const dataOptions: FigmaDataOptions = {
          excludeStyles: false,
          simplifyConnectors: true,
          simplifyComponentInstances: true,
          tablesToMarkdown: true,
        };

        const rawData = await ctx.figma.getFigmaData(fileKey, nodeId, undefined, dataOptions);

        let customPattern: RegExp | undefined;
        if (storyIdPattern) {
          try {
            customPattern = new RegExp(storyIdPattern, "gi");
          } catch (e) {
            return createErrorResponse(
              new Error(`Invalid storyIdPattern regex: ${storyIdPattern}`),
              "get-figma-semantic"
            );
          }
        }

        const semanticData = extractSemanticData(rawData, fileKey, nodeId, {
          stickyColorOverrides,
          storyIdPattern: customPattern,
        });

        const response = createContextSafeResponse({
          toolName: 'get-figma-semantic',
          data: semanticData,
          config: csConfig,
          returnFullResponse,
          summaryHint: (d) => {
            const sectionCount = d?.sections?.length ?? 0;
            const stickyCount = d?.stickies?.length ?? 0;
            return `${sectionCount} sections, ${stickyCount} stickies extracted from file ${fileKey}${nodeId ? ` (node ${nodeId})` : ''}`;
          },
        });

        // Optionally prepend a screenshot of the node
        if (includeScreenshot && nodeId) {
          try {
            const imageMap = await ctx.figma.getNodeImages(fileKey, [nodeId], { format: 'png', scale: 2 });
            const imageUrl = imageMap[nodeId];
            if (imageUrl) {
              const imageResponse = await fetch(imageUrl);
              const arrayBuffer = await imageResponse.arrayBuffer();
              const base64 = Buffer.from(arrayBuffer).toString('base64');
              // MCP SDK supports image content blocks in CallToolResult
              (response.content as any[]).unshift({
                type: "image",
                data: base64,
                mimeType: "image/png",
              });
            }
          } catch (screenshotError) {
            // Non-fatal: log but don't fail the whole response
            console.error('Screenshot fetch failed:', screenshotError);
          }
        }

        return response;
      } catch (error) {
        return createErrorResponse(error, "get-figma-semantic");
      }
    }
  );

  // Tool: extract-ado-stories
  server.tool(
    "extract-ado-stories",
    "Extract all ADO User Story Components from a FigJam board or section. Returns structured data with IDs, descriptions, states, parent context, and links. Reduces ~200K raw node data to ~5K structured result.",
    withContextSafeParam({
      fileKey: z.string().describe(descWithExamples("Figma file key (alphanumeric string from URL)", FILE_KEY_EXAMPLES)),
      nodeId: z.string().optional().describe(descWithExamples("Optional section node ID to scope extraction. If omitted, extracts from entire file.", NODE_ID_EXAMPLES)),
      adoOrganization: z.string().optional().describe(descWithExamples("Azure DevOps organization name for constructing work item links", ADO_ORG_EXAMPLES)),
      adoProject: z.string().optional().describe(descWithExamples("Azure DevOps project name for constructing work item links", ADO_PROJECT_EXAMPLES)),
      includePlaceholders: z.boolean().optional().describe("Include ADO components with placeholder IDs (e.g. 'ADO xxxxx'). Default: false (placeholders are filtered out)."),
    }),
    async ({
      fileKey,
      nodeId,
      adoOrganization,
      adoProject,
      includePlaceholders,
      returnFullResponse,
    }: {
      fileKey: string;
      nodeId?: string;
      adoOrganization?: string;
      adoProject?: string;
      includePlaceholders?: boolean;
      returnFullResponse?: boolean;
    }) => {
      try {
        const dataOptions: FigmaDataOptions = {
          excludeStyles: true,
          simplifyComponentInstances: true,
          simplifyConnectors: true,
          tablesToMarkdown: true,
        };

        const rawData = await ctx.figma.getFigmaData(fileKey, nodeId, undefined, dataOptions);

        const result = extractAdoStories(rawData, {
          fileKey,
          adoOrganization,
          adoProject,
          includePlaceholders,
        });

        return createContextSafeResponse({
          toolName: 'extract-ado-stories',
          data: result,
          config: csConfig,
          returnFullResponse,
          summaryHint: (d) => {
            const count = d?.totalCount ?? d?.items?.length ?? 0;
            const states = d?.byState ? Object.entries(d.byState).map(([k, v]) => `${k}: ${v}`).join(', ') : 'unknown';
            return `${count} stories extracted (${states}) from file ${fileKey}`;
          },
        });
      } catch (error) {
        return createErrorResponse(error, "extract-ado-stories");
      }
    }
  );

  // Tool: download-figma-images
  server.tool(
    "download-figma-images",
    "Download rendered images of Figma nodes to local disk. Uses the Figma Images API to export nodes as PNG/SVG/JPG/PDF.",
    {
      fileKey: z.string().describe(descWithExamples("Figma file key", FILE_KEY_EXAMPLES)),
      nodeIds: z.string().describe(descWithExamples(
        "Node ID(s) to render. Semicolon-separated for multiple: '1234:5678;9101:1213'",
        NODE_ID_EXAMPLES
      )),
      localPath: z.string().describe("Local directory path to save images (created if needed)"),
      format: z.enum(["png", "svg", "jpg", "pdf"]).optional().describe("Image format. Default: png"),
      scale: z.number().optional().describe("Scale factor 0.01-4. Default: 2 (for retina)"),
    },
    async ({ fileKey, nodeIds, localPath, format, scale }: {
      fileKey: string;
      nodeIds: string;
      localPath: string;
      format?: "png" | "svg" | "jpg" | "pdf";
      scale?: number;
    }) => {
      try {
        const parsedIds = nodeIds.split(';').map(id => id.trim()).filter(Boolean);
        const imageMap = await ctx.figma.getNodeImages(fileKey, parsedIds, { format, scale });

        const results: { nodeId: string; filePath?: string; error?: string }[] = [];
        for (const nodeId of parsedIds) {
          const imageUrl = imageMap[nodeId];
          if (!imageUrl) {
            results.push({ nodeId, error: 'No image URL returned' });
            continue;
          }
          const safeId = nodeId.replace(/:/g, '_');
          const ext = format ?? 'png';
          const filePath = await ctx.figma.downloadNodeImage(imageUrl, localPath, `${safeId}.${ext}`);
          results.push({ nodeId, filePath });
        }

        const successCount = results.filter(r => r.filePath).length;
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              downloaded: successCount,
              total: parsedIds.length,
              results,
            }, null, 2),
          }],
        };
      } catch (error) {
        return createErrorResponse(error, "download-figma-images");
      }
    }
  );

  console.error("figma tools registered: 4 tools");
}
