/**
 * Semantic FigJam Data Extractor
 *
 * Extracts semantically meaningful data from FigJam boards while discarding
 * positional/visual information. Produces deterministic, diff-friendly output.
 */

import type { SimplifiedDesign, SimplifiedNode } from "./types.js";
import type { ComponentProperties } from "../transformers/component.js";

// ============================================================================
// Types
// ============================================================================

export type StickyCategory =
  | "blocker" // Pink/Red - needs client input
  | "tbd" // Purple - questions, non-blocking
  | "investigation" // Blue - internal investigation needed
  | "done" // Green - completed
  | "info" // Yellow - informational
  | "note" // Gray/Other - general notes
  | "unknown"; // Unrecognized color

/** Legacy alias for "investigation" (pre-v33 name) - accepted on input, never emitted. */
export type LegacyStickyCategory = "si-investigation";

function normalizeStickyCategory(category: StickyCategory | LegacyStickyCategory): StickyCategory {
  return category === "si-investigation" ? "investigation" : category;
}

export interface SemanticExtract {
  fileKey: string;
  nodeId: string | null;
  title: string;
  fetchedAt: string;

  sections: SectionSummary[];
  stickies: StickyNote[];
  components: ComponentSummary[];
  textNodes: TextNodeSummary[];
  shapes: ShapeSummary[];
  connectors: ConnectorSummary[];
  userStories: UserStoryRef[];

  stats: {
    totalNodes: number;
    nodesDropped: number;
  };
}

export interface SectionSummary {
  id: string;
  name: string;
  parentSectionId: string | null;
}

export interface StickyNote {
  id: string;
  category: StickyCategory;
  text: string;
  parentSectionId: string | null;
}

export interface ComponentSummary {
  id: string;
  type: string;
  name: string;
  text: string;
  parentSectionId: string | null;
  componentId?: string;
  properties?: Record<string, string>;
}

export interface TextNodeSummary {
  id: string;
  text: string;
  parentSectionId: string | null;
}

export interface ShapeSummary {
  id: string;
  text: string;
  parentSectionId: string | null;
}

export interface ConnectorSummary {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromNodeName?: string;
  toNodeName?: string;
  label?: string;
}

export interface UserStoryRef {
  id: number;
  type: "US" | "Story" | "Task" | "Bug";
  foundIn: string[];
  contexts: string[];
}

export interface SemanticExtractOptions {
  /** Custom sticky color category overrides (hex -> category). Accepts the legacy "si-investigation" alias. */
  stickyColorOverrides?: Record<string, StickyCategory | LegacyStickyCategory>;
  /** Custom regex pattern for story ID extraction */
  storyIdPattern?: RegExp;
}

// ============================================================================
// Constants
// ============================================================================

/** Strict pattern requiring prefix: US787, Story #787, Task787, Bug #787 */
const DEFAULT_STORY_PATTERN = /\b(US|Story|Task|Bug)[#:\s]*(\d+)\b/gi;

/** Section/grouping node types */
const SECTION_TYPES = new Set(["SECTION", "FRAME"]);

/** Sticky note node types */
const STICKY_TYPES = new Set(["STICKY", "STICKY_NOTE"]);

/** Component instance types */
const COMPONENT_TYPES = new Set(["INSTANCE", "COMPONENT"]);

/** Shape with text node types */
const SHAPE_TYPES = new Set(["SHAPE_WITH_TEXT"]);

// ============================================================================
// Color Categorization (HSL-based)
// ============================================================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * Convert RGB (0-1 range) to HSL
 */
function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic (gray)
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/**
 * Categorize a sticky note color using HSL hue ranges.
 * More robust than exact hex matching.
 */
function categorizeByHsl(hsl: HSL): StickyCategory {
  const { h, s, l } = hsl;

  // Low saturation = gray (note)
  if (s < 15) {
    return "note";
  }

  // Very light colors with low saturation are also notes
  if (l > 90 && s < 30) {
    return "note";
  }

  // Hue-based categorization
  // Red/Pink: 0-30° and 330-360°
  if (h <= 30 || h >= 330) {
    return "blocker";
  }

  // Yellow: 45-65°
  if (h >= 45 && h <= 65) {
    return "info";
  }

  // Green: 90-150°
  if (h >= 90 && h <= 150) {
    return "done";
  }

  // Blue: 200-259°
  if (h >= 200 && h < 260) {
    return "investigation";
  }

  // Purple: 260-330° (light purples can have hue as low as 260)
  if (h >= 260 && h <= 330) {
    return "tbd";
  }

  return "unknown";
}

/**
 * Parse a CSS color string to RGB values (0-1 range)
 */
function parseColorString(colorStr: string): RGB | null {
  // Handle hex: #RRGGBB or #RGB
  if (colorStr.startsWith("#")) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) return null;

    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { r, g, b };
  }

  // Handle rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10) / 255,
      g: parseInt(rgbaMatch[2], 10) / 255,
      b: parseInt(rgbaMatch[3], 10) / 255,
    };
  }

  return null;
}

/**
 * Categorize a sticky note based on its fill color.
 * Accepts fills in the format from SimplifiedNode (string reference to globalVars
 * or direct color value).
 */
export function categorizeStickyColor(
  fills: string | undefined,
  globalVars?: { styles?: Record<string, unknown> },
  overrides?: Record<string, StickyCategory | LegacyStickyCategory>,
): StickyCategory {
  if (!fills) return "unknown";

  // Resolve globalVars reference if needed
  let resolvedFills = fills;
  if (globalVars?.styles && fills.startsWith("$") && globalVars.styles[fills.slice(1)]) {
    const resolved = globalVars.styles[fills.slice(1)];
    if (Array.isArray(resolved) && resolved.length > 0) {
      resolvedFills = String(resolved[0]);
    } else if (typeof resolved === "string") {
      resolvedFills = resolved;
    }
  }

  // Check for override first (exact match)
  if (overrides && overrides[resolvedFills]) {
    return normalizeStickyCategory(overrides[resolvedFills]);
  }

  // Parse color string
  const rgb = parseColorString(resolvedFills);
  if (!rgb) return "unknown";

  // Check overrides with parsed hex
  const hex =
    "#" +
    Math.round(rgb.r * 255)
      .toString(16)
      .padStart(2, "0") +
    Math.round(rgb.g * 255)
      .toString(16)
      .padStart(2, "0") +
    Math.round(rgb.b * 255)
      .toString(16)
      .padStart(2, "0");

  if (overrides && overrides[hex.toUpperCase()]) {
    return normalizeStickyCategory(overrides[hex.toUpperCase()]);
  }

  // Use HSL-based categorization
  const hsl = rgbToHsl(rgb);
  return categorizeByHsl(hsl);
}

// ============================================================================
// Story ID Extraction
// ============================================================================

/**
 * Extract user story/task/bug IDs from text content.
 * Uses strict pattern requiring prefix.
 */
export function extractUserStories(
  nodes: SimplifiedNode[],
  pattern: RegExp = DEFAULT_STORY_PATTERN,
): UserStoryRef[] {
  const storyMap = new Map<number, UserStoryRef>();

  function processNode(node: SimplifiedNode): void {
    const textContent = getAllText(node);
    if (!textContent) return;

    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(textContent)) !== null) {
      const rawType = match[1].toUpperCase();
      const id = parseInt(match[2], 10);

      // Sanity check - skip unreasonable IDs
      if (id < 1 || id > 999999) continue;

      // Normalize type to our standard format
      let type: "US" | "Story" | "Task" | "Bug";
      if (rawType === "US") {
        type = "US";
      } else if (rawType === "STORY") {
        type = "Story";
      } else if (rawType === "TASK") {
        type = "Task";
      } else {
        type = "Bug";
      }

      if (!storyMap.has(id)) {
        storyMap.set(id, {
          id,
          type,
          foundIn: [],
          contexts: [],
        });
      }

      const ref = storyMap.get(id)!;
      if (!ref.foundIn.includes(node.id)) {
        ref.foundIn.push(node.id);
        ref.contexts.push(getContextSnippet(node, textContent, match.index));
      }
    }

    // Process children
    if (node.children) {
      for (const child of node.children) {
        processNode(child);
      }
    }
  }

  for (const node of nodes) {
    processNode(node);
  }

  // Sort by ID for determinism
  return Array.from(storyMap.values()).sort((a, b) => a.id - b.id);
}

/**
 * Get all text content from a node and its descendants
 */
function getAllText(node: SimplifiedNode): string {
  const parts: string[] = [];

  if (node.name) parts.push(node.name);
  if (node.text) parts.push(node.text);

  // Extract text from component properties
  if (node.componentProperties) {
    for (const prop of node.componentProperties) {
      if (prop.value && typeof prop.value === "string") {
        parts.push(prop.value);
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      parts.push(getAllText(child));
    }
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Get context snippet around a match
 */
function getContextSnippet(node: SimplifiedNode, text: string, matchIndex: number): string {
  // Prefer node name as context
  if (node.name && node.name.length > 0 && node.name.length < 100) {
    return node.name;
  }

  // Fall back to text snippet
  const start = Math.max(0, matchIndex - 30);
  const end = Math.min(text.length, matchIndex + 30);
  return text.slice(start, end).trim();
}

// ============================================================================
// Tree Walking
// ============================================================================

interface WalkContext {
  sections: SectionSummary[];
  stickies: StickyNote[];
  components: ComponentSummary[];
  textNodes: TextNodeSummary[];
  shapes: ShapeSummary[];
  connectors: ConnectorSummary[];
  nodeNameMap: Map<string, string>;
  totalNodes: number;
  nodesDropped: number;
  currentSectionId: string | null;
  globalVars?: { styles?: Record<string, unknown> };
  stickyColorOverrides?: Record<string, StickyCategory | LegacyStickyCategory>;
}

/**
 * Walk the node tree and extract semantic data
 */
function walkNode(node: SimplifiedNode, ctx: WalkContext): void {
  ctx.totalNodes++;

  const type = node.type;
  let nodeProcessed = false;

  // Track current section context
  let sectionId = ctx.currentSectionId;

  // Handle sections
  if (SECTION_TYPES.has(type)) {
    ctx.sections.push({
      id: node.id,
      name: node.name || "",
      parentSectionId: ctx.currentSectionId,
    });
    sectionId = node.id;
    ctx.nodeNameMap.set(node.id, node.name || "");
    nodeProcessed = true;
  }

  // Handle sticky notes
  if (STICKY_TYPES.has(type)) {
    ctx.stickies.push({
      id: node.id,
      category: categorizeStickyColor(node.fills, ctx.globalVars, ctx.stickyColorOverrides),
      text: node.text || node.name || "",
      parentSectionId: sectionId,
    });
    ctx.nodeNameMap.set(node.id, node.text || node.name || "");
    nodeProcessed = true;
  }

  // Handle shapes with text (e.g. SHAPE_WITH_TEXT nodes from FigJam)
  if (SHAPE_TYPES.has(type)) {
    ctx.shapes.push({
      id: node.id,
      text: node.text || node.name || "",
      parentSectionId: sectionId,
    });
    ctx.nodeNameMap.set(node.id, node.text || node.name || "");
    nodeProcessed = true;
  }

  // Handle components/instances
  if (COMPONENT_TYPES.has(type)) {
    const properties: Record<string, string> = {};
    if (node.componentProperties) {
      for (const prop of node.componentProperties) {
        if (prop.value !== undefined) {
          // Clean property name (remove #ID suffix)
          const cleanName = prop.name.replace(/#\d+:\d+$/, "");
          properties[cleanName] = String(prop.value);
        }
      }
    }

    ctx.components.push({
      id: node.id,
      type: type,
      name: node.name || "",
      text: node.text || getAllText(node),
      parentSectionId: sectionId,
      componentId: node.componentId,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    });
    ctx.nodeNameMap.set(node.id, node.name || "");
    nodeProcessed = true;
  }

  // Handle text nodes (standalone, not part of sticky or component)
  if (type === "TEXT" && !nodeProcessed) {
    if (node.text && node.text.trim().length > 0) {
      ctx.textNodes.push({
        id: node.id,
        text: node.text,
        parentSectionId: sectionId,
      });
      ctx.nodeNameMap.set(node.id, node.text.slice(0, 50));
    }
    nodeProcessed = true;
  }

  // Handle connectors
  if (type === "CONNECTOR") {
    if (node.startNodeId && node.endNodeId) {
      ctx.connectors.push({
        id: node.id,
        fromNodeId: node.startNodeId,
        toNodeId: node.endNodeId,
        label: node.text || undefined,
      });
    }
    nodeProcessed = true;
  }

  // Track dropped nodes (decorative, positional-only)
  if (!nodeProcessed && !node.children?.length) {
    ctx.nodesDropped++;
  }

  // Recurse into children with updated section context
  if (node.children) {
    const savedSection = ctx.currentSectionId;
    ctx.currentSectionId = sectionId;

    for (const child of node.children) {
      walkNode(child, ctx);
    }

    ctx.currentSectionId = savedSection;
  }
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract semantic data from a simplified Figma design.
 *
 * @param design - The simplified design from getFigmaData
 * @param fileKey - The Figma file key
 * @param nodeId - Optional node ID that was fetched
 * @param options - Extraction options
 * @returns Semantic extract with deterministic, diff-friendly structure
 */
export function extractSemanticData(
  design: SimplifiedDesign,
  fileKey: string,
  nodeId?: string,
  options?: SemanticExtractOptions,
): SemanticExtract {
  const ctx: WalkContext = {
    sections: [],
    stickies: [],
    components: [],
    textNodes: [],
    shapes: [],
    connectors: [],
    nodeNameMap: new Map(),
    totalNodes: 0,
    nodesDropped: 0,
    currentSectionId: null,
    globalVars: design.globalVars,
    stickyColorOverrides: options?.stickyColorOverrides,
  };

  // Walk all root nodes
  for (const node of design.nodes) {
    walkNode(node, ctx);
  }

  // Resolve connector node names
  for (const connector of ctx.connectors) {
    connector.fromNodeName = ctx.nodeNameMap.get(connector.fromNodeId);
    connector.toNodeName = ctx.nodeNameMap.get(connector.toNodeId);
  }

  // Extract user stories
  const storyPattern = options?.storyIdPattern || DEFAULT_STORY_PATTERN;
  const userStories = extractUserStories(design.nodes, storyPattern);

  // Sort all arrays by ID for determinism
  const sortById = <T extends { id: string | number }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    fileKey,
    nodeId: nodeId || null,
    title: design.name || "",
    fetchedAt: new Date().toISOString(),

    sections: sortById(ctx.sections),
    stickies: sortById(ctx.stickies),
    components: sortById(ctx.components),
    textNodes: sortById(ctx.textNodes),
    shapes: sortById(ctx.shapes),
    connectors: sortById(ctx.connectors),
    userStories,

    stats: {
      totalNodes: ctx.totalNodes,
      nodesDropped: ctx.nodesDropped,
    },
  };
}
