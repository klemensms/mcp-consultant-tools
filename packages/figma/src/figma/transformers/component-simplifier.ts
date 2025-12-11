import type { SimplifiedNode } from "../extractors/types.js";

/**
 * Simplify an INSTANCE node to keep only semantic data.
 * Preserves componentId, componentProperties, and text content.
 * Removes all visual styling properties.
 *
 * This is specifically designed for ADO User Story components where:
 * - componentProperties contains the ADO links and implementation details
 * - Text content may contain important labels or descriptions
 * - Visual styling is not relevant for understanding the architecture
 *
 * Non-INSTANCE nodes are passed through with recursive child processing.
 *
 * @param node - The node to simplify
 * @returns Simplified node for INSTANCE, or original with processed children
 */
export function simplifyComponentInstance(node: SimplifiedNode): SimplifiedNode {
  if (node.type !== "INSTANCE") {
    // For non-INSTANCE nodes, just recursively process children
    if (node.children) {
      return {
        ...node,
        children: node.children.map(simplifyComponentInstance),
      };
    }
    return node;
  }

  // For INSTANCE nodes, keep only essential properties
  const simplified: SimplifiedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Always preserve componentId - this links to the component definition
  if (node.componentId !== undefined) {
    simplified.componentId = node.componentId;
  }

  // Always preserve componentProperties - this is where ADO links and other
  // critical data lives
  if (node.componentProperties !== undefined) {
    simplified.componentProperties = node.componentProperties;
  }

  // Preserve text content if present
  if (node.text !== undefined) {
    simplified.text = node.text;
  }

  // Recursively simplify children - they may contain nested text or instances
  if (node.children) {
    // For INSTANCE children, we extract text content but simplify structure
    const simplifiedChildren = node.children.map(simplifyComponentInstance);

    // Only include children if there are any after simplification
    if (simplifiedChildren.length > 0) {
      simplified.children = simplifiedChildren;
    }
  }

  return simplified;
}

/**
 * Apply component instance simplification to all nodes in an array.
 *
 * @param nodes - Array of SimplifiedNodes to process
 * @returns Array with simplified component instances
 */
export function simplifyAllComponentInstances(nodes: SimplifiedNode[]): SimplifiedNode[] {
  return nodes.map(simplifyComponentInstance);
}

/**
 * Extract all text content from an INSTANCE node and its children.
 * Useful for getting a flat text representation of a component.
 *
 * @param node - The node to extract text from
 * @returns All text content concatenated
 */
export function extractAllTextFromInstance(node: SimplifiedNode): string {
  const texts: string[] = [];

  if (node.text) {
    texts.push(node.text);
  }

  if (node.children) {
    for (const child of node.children) {
      const childText = extractAllTextFromInstance(child);
      if (childText) {
        texts.push(childText);
      }
    }
  }

  return texts.join(" ").trim();
}

/**
 * Create an ultra-simplified version of an INSTANCE node.
 * Returns just the componentProperties and flattened text content.
 * Use this for maximum context window savings when you only need
 * the ADO links and text content.
 *
 * @param node - The INSTANCE node to flatten
 * @returns Ultra-simplified node
 */
export function flattenComponentInstance(node: SimplifiedNode): SimplifiedNode {
  if (node.type !== "INSTANCE") {
    // Recursively process children for non-INSTANCE nodes
    if (node.children) {
      return {
        ...node,
        children: node.children.map(flattenComponentInstance),
      };
    }
    return node;
  }

  const flattened: SimplifiedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (node.componentId !== undefined) {
    flattened.componentId = node.componentId;
  }

  if (node.componentProperties !== undefined) {
    flattened.componentProperties = node.componentProperties;
  }

  // Flatten all nested text into a single text field
  const allText = extractAllTextFromInstance(node);
  if (allText) {
    flattened.text = allText;
  }

  // No children - text is flattened into the text field

  return flattened;
}
