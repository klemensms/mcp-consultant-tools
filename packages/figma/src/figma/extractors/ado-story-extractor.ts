/**
 * ADO User Story Component Extractor
 *
 * Extracts ADO User Story Components from FigJam boards, returning
 * structured data with IDs, descriptions, states, parent context, and links.
 * Reduces ~200K raw node data to ~5K structured result.
 */

import type { SimplifiedDesign, SimplifiedNode } from "./types.js";
import type { ComponentProperties } from "../transformers/component.js";

// ============================================================================
// Types
// ============================================================================

export interface AdoStoryItem {
  /** Node ID of the ADO component */
  nodeId: string;
  /** ADO work item name/title */
  adoName: string;
  /** ADO work item description */
  adoDescription: string | null;
  /** ADO work item state (e.g. "New", "Active", "Closed") */
  adoState: string | null;
  /** Numeric ADO work item ID (null if placeholder) */
  adoId: number | null;
  /** Full ADO URL (null if no ID or missing org/project) */
  adoLink: string | null;
  /** Figma board URL pointing to parent context */
  figmaLink: string | null;
  /** Parent component type (e.g. "Dataverse Table", "API Endpoint") */
  parentType: string | null;
  /** Parent context string "{Header}: {Description}" */
  parentContext: string | null;
  /** Node ID of the parent INSTANCE */
  parentNodeId: string | null;
}

export interface AdoStoryExtractResult {
  /** All extracted ADO story items */
  items: AdoStoryItem[];
  /** Total count of items */
  totalCount: number;
  /** Count of items with placeholder IDs that were filtered */
  placeholderCount: number;
  /** Counts by ADO state */
  byState: Record<string, number>;
  /** Counts by parent type */
  byParentType: Record<string, number>;
}

export interface AdoStoryExtractOptions {
  /** Figma file key (for constructing Figma links) */
  fileKey: string;
  /** ADO organization name (for constructing ADO links) */
  adoOrganization?: string;
  /** ADO project name (for constructing ADO links) */
  adoProject?: string;
  /** Whether to include items with placeholder IDs (default: false) */
  includePlaceholders?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Target component name to match */
const ADO_COMPONENT_NAME = "ADO User Story Component";

/** Map of parent component names to display types */
const PARENT_TYPE_MAP: Record<string, string> = {
  "API Endpoint": "API Endpoint",
  "Power Automate Flow Component": "Power Automate Flow",
  "Dataverse Table Component": "Dataverse Table",
  "Plugin Component": "Dataverse Plugin",
  "Customer Insights Component": "Customer Insights",
  "Azure Function Component": "Azure Function",
  "Service Bus Queue Component": "Service Bus Queue",
  "SPO Component": "SharePoint Online",
};

/** Detect placeholder ADO IDs */
const PLACEHOLDER_PATTERN = /xxxxx/i;

/** Extract numeric ADO ID from name */
const ADO_ID_PATTERN = /ADO\s+(\d+)/i;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a component property value by matching its name prefix (before # separator).
 * Figma component property names have format "Property Name#311:0" where the
 * hash suffix varies between files.
 */
function getPropertyValue(
  props: ComponentProperties[] | undefined,
  prefix: string,
): string | null {
  if (!props) return null;
  for (const prop of props) {
    const cleanName = prop.name.replace(/#\d+:\d+$/, "").trim();
    if (cleanName === prefix) {
      return prop.value || null;
    }
  }
  return null;
}

/**
 * Resolve parent component type and context from a parent INSTANCE node.
 * Returns [parentType, parentContext] tuple.
 */
function resolveParentContext(
  parentNode: SimplifiedNode | null,
): [string | null, string | null] {
  if (!parentNode || parentNode.type !== "INSTANCE") {
    return [null, null];
  }

  // Match parent name against known component types
  let parentType: string | null = null;
  for (const [componentName, displayType] of Object.entries(PARENT_TYPE_MAP)) {
    if (parentNode.name === componentName) {
      parentType = displayType;
      break;
    }
  }

  if (!parentType) return [null, null];

  // Extract context from parent's component properties
  const rawHeader = getPropertyValue(parentNode.componentProperties, "Header");
  const rawDescription = getPropertyValue(parentNode.componentProperties, "Description");

  // Clean newlines and excessive whitespace from values
  const header = rawHeader?.replace(/\n/g, " ").replace(/\s+/g, " ").trim() || null;
  const description = rawDescription?.replace(/\n/g, " ").replace(/\s+/g, " ").trim() || null;

  let parentContext: string | null = null;
  if (header && description) {
    parentContext = `${header}: ${description}`;
  } else if (header) {
    parentContext = header;
  } else if (description) {
    parentContext = description;
  }

  return [parentType, parentContext];
}

/**
 * Construct an ADO work item URL.
 */
function constructAdoLink(
  id: number,
  org?: string,
  project?: string,
): string | null {
  if (!org || !project) return null;
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

/**
 * Construct a Figma board URL pointing to a specific node.
 * Replaces : with - in node IDs for URL format.
 */
function constructFigmaLink(
  fileKey: string,
  nodeId: string,
): string {
  const urlNodeId = nodeId.replace(/:/g, "-");
  return `https://www.figma.com/board/${fileKey}/?node-id=${urlNodeId}`;
}

// ============================================================================
// Main Extraction
// ============================================================================

/**
 * Recursively walk the node tree, tracking the nearest INSTANCE ancestor
 * as a potential parent. When an ADO User Story Component is found,
 * extract its properties and resolve parent context.
 */
function walkTree(
  node: SimplifiedNode,
  parentInstance: SimplifiedNode | null,
  items: AdoStoryItem[],
  options: AdoStoryExtractOptions,
): void {
  const isInstance = node.type === "INSTANCE";

  if (isInstance && node.name === ADO_COMPONENT_NAME) {
    // Extract ADO properties
    const adoName = getPropertyValue(node.componentProperties, "ADO Name") || node.name;
    const adoDescription = getPropertyValue(node.componentProperties, "ADO Description");
    const adoState = getPropertyValue(node.componentProperties, "ADO State");

    // Extract ADO ID from name
    const isPlaceholder = PLACEHOLDER_PATTERN.test(adoName);
    let adoId: number | null = null;
    if (!isPlaceholder) {
      const idMatch = adoName.match(ADO_ID_PATTERN);
      if (idMatch) {
        adoId = parseInt(idMatch[1], 10);
      }
    }

    // Resolve parent context
    const [parentType, parentContext] = resolveParentContext(parentInstance);

    // Construct links
    const adoLink = adoId ? constructAdoLink(adoId, options.adoOrganization, options.adoProject) : null;
    const linkTargetNodeId = parentInstance?.id || node.id;
    const figmaLink = constructFigmaLink(options.fileKey, linkTargetNodeId);

    items.push({
      nodeId: node.id,
      adoName,
      adoDescription,
      adoState,
      adoId,
      adoLink,
      figmaLink,
      parentType,
      parentContext,
      parentNodeId: parentInstance?.id || null,
    });

    // ADO components don't contain nested ADO components, so return
    return;
  }

  // Track nearest INSTANCE ancestor as potential parent
  const nextParent = isInstance ? node : parentInstance;

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      walkTree(child, nextParent, items, options);
    }
  }
}

/**
 * Extract all ADO User Story Components from a simplified Figma design.
 *
 * @param design - The simplified design from getFigmaData
 * @param options - Extraction options (file key, ADO org/project, placeholder filtering)
 * @returns Structured result with items, counts, and summaries
 */
export function extractAdoStories(
  design: SimplifiedDesign,
  options: AdoStoryExtractOptions,
): AdoStoryExtractResult {
  const allItems: AdoStoryItem[] = [];

  // Walk all root nodes
  for (const node of design.nodes) {
    walkTree(node, null, allItems, options);
  }

  // Count placeholders before filtering
  const placeholderCount = allItems.filter((item) => item.adoId === null).length;

  // Filter placeholders unless requested
  const items = options.includePlaceholders
    ? allItems
    : allItems.filter((item) => item.adoId !== null);

  // Build summary counts
  const byState: Record<string, number> = {};
  const byParentType: Record<string, number> = {};

  for (const item of items) {
    const state = item.adoState || "Unknown";
    byState[state] = (byState[state] || 0) + 1;

    const pType = item.parentType || "Standalone";
    byParentType[pType] = (byParentType[pType] || 0) + 1;
  }

  return {
    items,
    totalCount: items.length,
    placeholderCount,
    byState,
    byParentType,
  };
}
