#!/usr/bin/env node

/**
 * @mcp-consultant-tools/figma
 *
 * MCP server for Figma integration.
 * Provides design data extraction and transformation capabilities.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, createErrorResponse, createSuccessResponse } from "@mcp-consultant-tools/core";
import { FigmaService } from "./FigmaService.js";
import type { FigmaConfig, FigmaDataOptions } from "./FigmaService.js";

/**
 * Register Figma tools and prompts to an MCP server
 * @param server - The MCP server instance
 * @param figmaService - Optional pre-configured FigmaService (for testing or custom configs)
 */
export function registerFigmaTools(server: any, figmaService?: FigmaService) {
  let service: FigmaService | null = figmaService || null;

  function getFigmaService(): FigmaService {
    if (!service) {
      const missingConfig: string[] = [];
      if (!process.env.FIGMA_API_KEY && !process.env.FIGMA_OAUTH_TOKEN) {
        missingConfig.push("FIGMA_API_KEY or FIGMA_OAUTH_TOKEN");
      }

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required Figma configuration: ${missingConfig.join(", ")}. ` +
          `Set FIGMA_API_KEY or FIGMA_OAUTH_TOKEN environment variable.`
        );
      }

      const config: FigmaConfig = {
        apiKey: process.env.FIGMA_API_KEY,
        oauthToken: process.env.FIGMA_OAUTH_TOKEN,
        useOAuth: process.env.FIGMA_USE_OAUTH === "true",
      };

      service = new FigmaService(config);
      console.error("Figma service initialized");
    }

    return service;
  }

  // Tool: get-figma-data
  server.tool(
    "get-figma-data",
    "Get comprehensive Figma design data including layout, text, styles, and components. Fetches from Figma API and transforms into simplified, AI-friendly format. Can fetch entire files or specific nodes. Automatically deduplicates styles. Supports optimization options to reduce context window usage.",
    {
      fileKey: z.string().describe("Figma file key (alphanumeric string from URL). Example: From 'https://figma.com/file/ABC123/MyFile', use 'ABC123'"),
      nodeId: z.string().optional().describe("Optional specific node ID(s) to fetch. Format: '1234:5678' or multiple '1:10;2:20'. If omitted, fetches entire file."),
      depth: z.number().optional().describe("Optional tree traversal depth limit. Useful for large files. Example: depth=3 stops after 3 levels of children."),
      // Optimization options for reducing context window usage
      excludeStyles: z.boolean().optional().describe("Remove all styling info (fills, strokes, effects, textStyle, opacity, borderRadius) and globalVars.styles. Useful for understanding architecture without visual details. Default: true. Set to false for full styling data."),
      tablesToMarkdown: z.boolean().optional().describe("Convert TABLE nodes to markdown table format instead of nested node structures. Significantly reduces token usage for tables. Default: true. Set to false for full node tree."),
      simplifyConnectors: z.boolean().optional().describe("Simplify CONNECTOR nodes to just connection endpoints (startNodeId, endNodeId, text). Preserves relationship data while removing visual properties. Default: true. Set to false for full connector data."),
      simplifyComponentInstances: z.boolean().optional().describe("Keep componentId and componentProperties on INSTANCE nodes but remove visual styling. Ideal for ADO User Story components. Default: true. Set to false for full instance data."),
      extractors: z.array(z.enum(["layout", "text", "visuals", "component"])).optional().describe("Override which extractors to use. Options: layout, text, visuals, component. Default uses all. Example: ['text', 'component'] for content-focused extraction."),
    },
    async ({
      fileKey,
      nodeId,
      depth,
      excludeStyles,
      tablesToMarkdown,
      simplifyConnectors,
      simplifyComponentInstances,
      extractors
    }: {
      fileKey: string;
      nodeId?: string;
      depth?: number;
      excludeStyles?: boolean;
      tablesToMarkdown?: boolean;
      simplifyConnectors?: boolean;
      simplifyComponentInstances?: boolean;
      extractors?: ("layout" | "text" | "visuals" | "component")[];
    }) => {
      try {
        const figmaService = getFigmaService();

        // Build data options from parameters
        const dataOptions: FigmaDataOptions = {
          excludeStyles,
          tablesToMarkdown,
          simplifyConnectors,
          simplifyComponentInstances,
          extractors,
        };

        const result = await figmaService.getFigmaData(fileKey, nodeId, depth, dataOptions);
        return createSuccessResponse(result);
      } catch (error) {
        return createErrorResponse(error, "get-figma-data");
      }
    }
  );

  // Tool: download-figma-images (placeholder for v2)
  server.tool(
    "download-figma-images",
    "Download and process images from Figma designs (Coming in v2)",
    {
      fileKey: z.string().describe("Figma file key"),
      localPath: z.string().describe("Local path to save images"),
    },
    async ({ fileKey, localPath }: { fileKey: string; localPath: string }) => {
      return createErrorResponse(
        new Error("Image download functionality is coming in v2. Use get-figma-data for design metadata."),
        "download-figma-images"
      );
    }
  );

  console.error("Figma tools registered: 2 tools");
}

/**
 * Export service class for direct usage
 */
export { FigmaService } from "./FigmaService.js";
export type { FigmaConfig, FigmaDataOptions } from "./FigmaService.js";

/**
 * Standalone CLI server (when run directly)
 *
 * Uses realpathSync to resolve symlinks created by npx, ensuring import.meta.url
 * matches the resolved path in process.argv[1]
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/figma",
    version: "1.0.0",
    capabilities: {
      tools: {},
    },
  });

  registerFigmaTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Figma MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/figma server running on stdio");
}
