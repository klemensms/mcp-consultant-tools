/**
 * Figma API types and configuration interfaces
 */

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

export type FigmaImageFormat = 'png' | 'svg' | 'jpg' | 'pdf';

export interface FigmaNodeImageOptions {
  format?: FigmaImageFormat;
  /** Scale factor 0.01 to 4, default 2 (retina) */
  scale?: number;
}

export interface FigmaImagesApiResponse {
  err: string | null;
  images: Record<string, string | null>;
}
