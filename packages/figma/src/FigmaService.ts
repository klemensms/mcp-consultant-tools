import type {
  GetFileResponse,
  GetFileNodesResponse,
} from "@figma/rest-api-spec";
import { fetchWithRetry } from "./figma/utils/fetch-with-retry.js";
import { simplifyRawFigmaObject } from "./figma/extractors/design-extractor.js";
import { allExtractors } from "./figma/extractors/built-in.js";
import type { SimplifiedDesign, TraversalOptions } from "./figma/extractors/types.js";

export interface FigmaConfig {
  apiKey?: string;
  oauthToken?: string;
  useOAuth: boolean;
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
   * @returns Simplified design data ready for AI consumption
   */
  async getFigmaData(
    fileKey: string,
    nodeId?: string,
    depth?: number,
  ): Promise<SimplifiedDesign> {
    try {
      // Fetch raw data from Figma API
      let rawData: GetFileResponse | GetFileNodesResponse;

      if (nodeId) {
        // Parse node IDs (support both single and multiple, semicolon-separated)
        const nodeIds = nodeId.split(";").map(id => id.trim()).filter(id => id.length > 0);
        rawData = await this.getFigmaNodes(fileKey, nodeIds, depth);
      } else {
        rawData = await this.getFigmaFile(fileKey, depth);
      }

      // Transform raw Figma data into simplified format using extractors
      const options: TraversalOptions = {
        maxDepth: depth,
      };

      const simplifiedData = simplifyRawFigmaObject(
        rawData,
        allExtractors,
        options,
      );

      return simplifiedData;
    } catch (error: any) {
      console.error("Error fetching Figma data:", error);
      throw new Error(`Failed to fetch Figma data: ${error.message}`);
    }
  }
}
