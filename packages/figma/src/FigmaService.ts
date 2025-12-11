import type {
  GetFileResponse,
  GetFileNodesResponse,
} from "@figma/rest-api-spec";
import { fetchWithRetry } from "./figma/utils/fetch-with-retry.js";
import { simplifyRawFigmaObject } from "./figma/extractors/design-extractor.js";
import {
  allExtractors,
  layoutExtractor,
  textExtractor,
  visualsExtractor,
  componentExtractor,
  connectorExtractor,
  simplifyAllConnectors,
} from "./figma/extractors/built-in.js";
import type { SimplifiedDesign, TraversalOptions, ExtractorFn } from "./figma/extractors/types.js";
import { stripStylesFromDesign } from "./figma/transformers/style-stripper.js";
import { simplifyAllComponentInstances } from "./figma/transformers/component-simplifier.js";

export interface FigmaConfig {
  apiKey?: string;
  oauthToken?: string;
  useOAuth: boolean;
}

/**
 * Options for controlling what data is extracted and how it's formatted.
 * All options default to false to preserve backward compatibility.
 */
export interface FigmaDataOptions {
  /** Remove all styling info (fills, strokes, effects, textStyle, opacity, borderRadius) */
  excludeStyles?: boolean;
  /** Convert TABLE nodes to markdown format */
  tablesToMarkdown?: boolean;
  /** Simplify CONNECTOR nodes to just endpoints (startNodeId, endNodeId) */
  simplifyConnectors?: boolean;
  /** Keep componentId and componentProperties but remove visual styling from INSTANCE nodes */
  simplifyComponentInstances?: boolean;
  /** Override which extractors to use: "layout", "text", "visuals", "component" */
  extractors?: ("layout" | "text" | "visuals" | "component")[];
}

/**
 * Service for interacting with the Figma API
 * Follows the service pattern established by PowerPlatformService
 */
export class FigmaService {
  private config: FigmaConfig;
  private readonly baseUrl = "https://api.figma.com/v1";

  constructor(config: FigmaConfig) {
    this.config = config;

    // Validate configuration
    if (!this.config.apiKey && !this.config.oauthToken) {
      throw new Error(
        "Figma configuration requires either apiKey or oauthToken"
      );
    }

    if (this.config.useOAuth && !this.config.oauthToken) {
      throw new Error(
        "useOAuth is true but oauthToken is not provided"
      );
    }
  }

  /**
   * Get authentication headers based on configuration
   */
  private getAuthHeaders(): Record<string, string> {
    if (this.config.useOAuth && this.config.oauthToken) {
      console.error("Using OAuth Bearer token for authentication");
      return { Authorization: `Bearer ${this.config.oauthToken}` };
    } else if (this.config.apiKey) {
      console.error("Using Personal Access Token for authentication");
      return { "X-Figma-Token": this.config.apiKey };
    }

    throw new Error("No valid authentication method configured");
  }

  /**
   * Make an authenticated request to the Figma API
   */
  private async request<T>(endpoint: string): Promise<T> {
    try {
      console.error(`Calling ${this.baseUrl}${endpoint}`);
      const headers = this.getAuthHeaders();

      return await fetchWithRetry<T & { status?: number }>(`${this.baseUrl}${endpoint}`, {
        headers,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to make request to Figma API endpoint '${endpoint}': ${errorMessage}`,
      );
    }
  }

  /**
   * Get raw Figma API response for a file
   * @param fileKey - The Figma file key from the URL
   * @param depth - Optional depth limit for traversal
   */
  private async getFigmaFile(fileKey: string, depth?: number): Promise<GetFileResponse> {
    const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
    console.error(`Retrieving Figma file: ${fileKey} (depth: ${depth ?? "default"})`);

    const response = await this.request<GetFileResponse>(endpoint);
    return response;
  }

  /**
   * Get raw Figma API response for specific nodes
   * @param fileKey - The Figma file key from the URL
   * @param nodeIds - Array of node IDs to fetch
   * @param depth - Optional depth limit for traversal
   */
  private async getFigmaNodes(
    fileKey: string,
    nodeIds: string[],
    depth?: number,
  ): Promise<GetFileNodesResponse> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeIds.join(",")}${depth ? `&depth=${depth}` : ""}`;
    console.error(
      `Retrieving Figma nodes: ${nodeIds.join(", ")} from ${fileKey} (depth: ${depth ?? "default"})`,
    );

    const response = await this.request<GetFileNodesResponse>(endpoint);
    return response;
  }

  /**
   * Get comprehensive Figma design data in simplified, AI-friendly format
   * This is the main method exposed to MCP tools
   *
   * @param fileKey - The Figma file key from the URL
   * @param nodeId - Optional specific node ID(s) to fetch (format: "1:10" or "1:10;2:20")
   * @param depth - Optional tree traversal depth limit
   * @param dataOptions - Optional optimization options for reducing output size
   * @returns Simplified design data ready for AI consumption
   */
  async getFigmaData(
    fileKey: string,
    nodeId?: string,
    depth?: number,
    dataOptions?: FigmaDataOptions,
  ): Promise<SimplifiedDesign> {
    try {
      // Apply defaults - optimizations ON by default for reduced context usage
      const effectiveOptions = {
        excludeStyles: dataOptions?.excludeStyles ?? true,
        tablesToMarkdown: dataOptions?.tablesToMarkdown ?? true,
        simplifyConnectors: dataOptions?.simplifyConnectors ?? true,
        simplifyComponentInstances: dataOptions?.simplifyComponentInstances ?? true,
        extractors: dataOptions?.extractors,
      };

      // Fetch raw data from Figma API
      let rawData: GetFileResponse | GetFileNodesResponse;

      if (nodeId) {
        // Parse node IDs (support both single and multiple, semicolon-separated)
        const nodeIds = nodeId.split(";").map(id => id.trim()).filter(id => id.length > 0);
        rawData = await this.getFigmaNodes(fileKey, nodeIds, depth);
      } else {
        rawData = await this.getFigmaFile(fileKey, depth);
      }

      // Build extractor array based on options
      let extractorList: ExtractorFn[] = [...allExtractors];

      if (effectiveOptions.extractors) {
        // Use custom extractor selection
        extractorList = [];
        if (effectiveOptions.extractors.includes("layout")) {
          extractorList.push(layoutExtractor);
        }
        if (effectiveOptions.extractors.includes("text")) {
          extractorList.push(textExtractor);
        }
        if (effectiveOptions.extractors.includes("visuals")) {
          extractorList.push(visualsExtractor);
        }
        if (effectiveOptions.extractors.includes("component")) {
          extractorList.push(componentExtractor);
        }
      }

      // Always add connector extractor for relationship data
      extractorList.push(connectorExtractor);

      // Transform raw Figma data into simplified format using extractors
      const traversalOptions: TraversalOptions = {
        maxDepth: depth,
        optimization: {
          tablesToMarkdown: effectiveOptions.tablesToMarkdown,
          // Note: simplifyConnectors and simplifyComponentInstances are applied post-processing
        },
      };

      let simplifiedData = simplifyRawFigmaObject(
        rawData,
        extractorList,
        traversalOptions,
      );

      // Apply post-processing transformations
      // Order matters: apply connector simplification before style stripping
      // so connector endpoints are preserved

      if (effectiveOptions.simplifyConnectors) {
        simplifiedData = {
          ...simplifiedData,
          nodes: simplifyAllConnectors(simplifiedData.nodes),
        };
      }

      if (effectiveOptions.simplifyComponentInstances) {
        simplifiedData = {
          ...simplifiedData,
          nodes: simplifyAllComponentInstances(simplifiedData.nodes),
        };
      }

      // Apply style stripping last - it removes styling from all nodes
      if (effectiveOptions.excludeStyles) {
        simplifiedData = stripStylesFromDesign(simplifiedData);
      }

      return simplifiedData;
    } catch (error: any) {
      console.error("Error fetching Figma data:", error);
      throw new Error(`Failed to fetch Figma data: ${error.message}`);
    }
  }
}
