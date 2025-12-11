import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import type { ExtractorFn, SimplifiedNode } from "./types.js";
import { hasValue } from "../utils/identity.js";

/**
 * Interface for Figma connector endpoint data.
 * Connectors have start and end points that reference other nodes.
 */
interface ConnectorEndpoint {
  endpointNodeId?: string;
  position?: { x: number; y: number };
}

/**
 * Extracts connector-related properties from CONNECTOR nodes.
 * Preserves connection endpoints which are critical for understanding relationships.
 *
 * This is the full connector extractor - it includes visual properties.
 */
export const connectorExtractor: ExtractorFn = (node, result, _context) => {
  if (node.type !== "CONNECTOR") return;

  // Extract connection endpoints - these contain the connected node IDs
  if (hasValue("connectorStart", node)) {
    const start = node.connectorStart as ConnectorEndpoint;
    if (start.endpointNodeId) {
      result.startNodeId = start.endpointNodeId;
    }
  }

  if (hasValue("connectorEnd", node)) {
    const end = node.connectorEnd as ConnectorEndpoint;
    if (end.endpointNodeId) {
      result.endNodeId = end.endpointNodeId;
    }
  }
};

/**
 * Simplified connector extractor for optimization mode.
 * Only extracts connection endpoints and text labels, ignoring all visual properties.
 *
 * Use this when simplifyConnectors is true to reduce token usage while
 * preserving the essential relationship data.
 *
 * Output: { id, name, type: "CONNECTOR", startNodeId?, endNodeId?, text? }
 */
export const simplifiedConnectorExtractor: ExtractorFn = (node, result, _context) => {
  if (node.type !== "CONNECTOR") return;

  // Clear any visual properties that may have been added by other extractors
  // This ensures the simplified output is clean
  delete result.fills;
  delete result.strokes;
  delete result.strokeWeight;
  delete result.strokeDashes;
  delete result.strokeWeights;
  delete result.effects;
  delete result.layout;
  delete result.opacity;
  delete result.borderRadius;
  delete result.textStyle;

  // Extract only connection endpoints
  if (hasValue("connectorStart", node)) {
    const start = node.connectorStart as ConnectorEndpoint;
    if (start.endpointNodeId) {
      result.startNodeId = start.endpointNodeId;
    }
  }

  if (hasValue("connectorEnd", node)) {
    const end = node.connectorEnd as ConnectorEndpoint;
    if (end.endpointNodeId) {
      result.endNodeId = end.endpointNodeId;
    }
  }

  // Keep text label if present (extracted by textExtractor)
  // result.text is preserved as it's critical for understanding the connector's purpose
};

/**
 * Post-processor to simplify connector nodes in the final output.
 * This is an alternative approach that runs after all extraction is complete.
 *
 * @param node - The SimplifiedNode to process
 * @returns Simplified connector or original node
 */
export function simplifyConnectorNode(node: SimplifiedNode): SimplifiedNode {
  if (node.type !== "CONNECTOR") {
    // Recursively process children
    if (node.children) {
      return {
        ...node,
        children: node.children.map(simplifyConnectorNode),
      };
    }
    return node;
  }

  // For CONNECTOR nodes, keep only essential properties
  const simplified: SimplifiedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Preserve connection endpoints
  if (node.startNodeId) {
    simplified.startNodeId = node.startNodeId;
  }
  if (node.endNodeId) {
    simplified.endNodeId = node.endNodeId;
  }

  // Preserve text label if present
  if (node.text) {
    simplified.text = node.text;
  }

  return simplified;
}

/**
 * Apply connector simplification to all nodes in an array.
 *
 * @param nodes - Array of SimplifiedNodes to process
 * @returns Array with simplified connector nodes
 */
export function simplifyAllConnectors(nodes: SimplifiedNode[]): SimplifiedNode[] {
  return nodes.map(simplifyConnectorNode);
}
