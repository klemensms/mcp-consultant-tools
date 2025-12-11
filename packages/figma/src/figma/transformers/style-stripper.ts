import type { SimplifiedNode, SimplifiedDesign } from "../extractors/types.js";

/**
 * Properties to remove when excludeStyles is true.
 * These are all visual styling properties that don't affect the semantic structure.
 *
 * Note: We preserve the following critical properties:
 * - id, name, type (node identity)
 * - text (content)
 * - componentId, componentProperties (component relationships)
 * - startNodeId, endNodeId (connector relationships)
 * - children (hierarchy)
 */
const STYLE_PROPERTIES: (keyof SimplifiedNode)[] = [
  "fills",
  "strokes",
  "strokeWeight",
  "strokeDashes",
  "strokeWeights",
  "effects",
  "textStyle",
  "opacity",
  "borderRadius",
  "layout",
  "styles", // Named style references
];

/**
 * Remove all style-related properties from a single node.
 * Recursively processes children.
 *
 * This preserves:
 * - Node identity (id, name, type)
 * - Text content (text)
 * - Component data (componentId, componentProperties)
 * - Connector endpoints (startNodeId, endNodeId)
 * - Hierarchy (children)
 *
 * @param node - The node to strip styles from
 * @returns A new node without style properties
 */
export function stripStylesFromNode(node: SimplifiedNode): SimplifiedNode {
  // Create a shallow copy
  const stripped: SimplifiedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Preserve text content
  if (node.text !== undefined) {
    stripped.text = node.text;
  }

  // Preserve component data (critical for ADO User Story components)
  if (node.componentId !== undefined) {
    stripped.componentId = node.componentId;
  }
  if (node.componentProperties !== undefined) {
    stripped.componentProperties = node.componentProperties;
  }

  // Preserve connector endpoints
  if (node.startNodeId !== undefined) {
    stripped.startNodeId = node.startNodeId;
  }
  if (node.endNodeId !== undefined) {
    stripped.endNodeId = node.endNodeId;
  }

  // Recursively strip children
  if (node.children) {
    stripped.children = node.children.map(stripStylesFromNode);
  }

  return stripped;
}

/**
 * Remove all style-related data from the entire design.
 * Clears globalVars.styles and strips styles from all nodes.
 *
 * @param design - The full SimplifiedDesign to process
 * @returns A new design without style data
 */
export function stripStylesFromDesign(design: SimplifiedDesign): SimplifiedDesign {
  return {
    ...design,
    nodes: design.nodes.map(stripStylesFromNode),
    globalVars: { styles: {} }, // Empty styles object
  };
}

/**
 * Check if a node has any style properties.
 * Useful for debugging or selective processing.
 *
 * @param node - The node to check
 * @returns true if the node has any style properties
 */
export function hasStyleProperties(node: SimplifiedNode): boolean {
  return STYLE_PROPERTIES.some((prop) => node[prop] !== undefined);
}
