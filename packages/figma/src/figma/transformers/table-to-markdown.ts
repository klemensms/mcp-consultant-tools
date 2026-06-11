import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import type { MarkdownTableNode } from "../extractors/types.js";
import { hasValue } from "../utils/identity.js";

/**
 * Detect if a node is a native Figma TABLE node.
 * TABLE nodes have a specific type and contain TABLE_CELL children.
 */
export function isTableNode(node: FigmaDocumentNode): boolean {
  return node.type === "TABLE";
}

/**
 * Recursively extract text content from a node tree.
 * Searches through children to find all TEXT nodes and concatenates their content.
 */
function extractTextFromNode(node: FigmaDocumentNode): string {
  // Direct text node
  if (node.type === "TEXT" && hasValue("characters", node)) {
    return (node as { characters: string }).characters || "";
  }

  // Search children recursively
  if (hasValue("children", node) && Array.isArray(node.children)) {
    const texts = node.children.map((child) => extractTextFromNode(child));
    return texts.filter((t) => t.length > 0).join(" ").trim();
  }

  return "";
}

/**
 * Interface for a positioned cell (used for grid reconstruction).
 */
interface PositionedCell {
  x: number;
  y: number;
  text: string;
}

/**
 * Convert a Figma TABLE node to a markdown table.
 *
 * TABLE nodes in Figma have a flat list of TABLE_CELL children.
 * We reconstruct the grid by grouping cells by their Y position (rows)
 * and sorting within each row by X position (columns).
 *
 * @param node - The TABLE node to convert
 * @returns MarkdownTableNode or null if conversion fails
 */
export function convertTableToMarkdown(node: FigmaDocumentNode): MarkdownTableNode | null {
  if (!hasValue("children", node) || !Array.isArray(node.children)) {
    return null;
  }

  // Filter to TABLE_CELL nodes only
  const cells = node.children.filter((c) => c.type === "TABLE_CELL");
  if (cells.length === 0) {
    return null;
  }

  // Extract positioned cells with their bounding boxes
  const positionedCells: PositionedCell[] = [];

  for (const cell of cells) {
    if (!hasValue("absoluteBoundingBox", cell)) {
      continue;
    }

    const bbox = (cell as { absoluteBoundingBox: { x: number; y: number } }).absoluteBoundingBox;
    const text = extractTextFromNode(cell);

    positionedCells.push({
      x: bbox.x,
      y: Math.round(bbox.y), // Round Y to handle small floating point differences
      text,
    });
  }

  if (positionedCells.length === 0) {
    return null;
  }

  // Group cells by Y position to form rows
  const cellsByRow = new Map<number, PositionedCell[]>();
  for (const cell of positionedCells) {
    if (!cellsByRow.has(cell.y)) {
      cellsByRow.set(cell.y, []);
    }
    cellsByRow.get(cell.y)!.push(cell);
  }

  // Sort rows by Y position, then cells within each row by X position
  const sortedYs = Array.from(cellsByRow.keys()).sort((a, b) => a - b);
  const rows: string[][] = [];

  for (const y of sortedYs) {
    const rowCells = cellsByRow.get(y)!.sort((a, b) => a.x - b.x);
    rows.push(rowCells.map((c) => c.text));
  }

  if (rows.length === 0) {
    return null;
  }

  // Build markdown table
  const columnCount = Math.max(...rows.map((r) => r.length));
  const lines: string[] = [];

  // Helper to escape pipe characters and format cell content
  const formatCell = (text: string): string => {
    return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  };

  // Header row (first row)
  const headerRow = rows[0] || [];
  // Pad to column count
  while (headerRow.length < columnCount) {
    headerRow.push("");
  }
  lines.push("| " + headerRow.map(formatCell).join(" | ") + " |");

  // Separator row
  lines.push("| " + Array(columnCount).fill("---").join(" | ") + " |");

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    const row = [...rows[i]];
    // Pad row to match column count
    while (row.length < columnCount) {
      row.push("");
    }
    lines.push("| " + row.map(formatCell).join(" | ") + " |");
  }

  return {
    id: node.id,
    name: node.name,
    type: "TABLE_MARKDOWN",
    markdown: lines.join("\n"),
    rowCount: rows.length,
    columnCount,
  };
}

/**
 * Check if a node should be converted to markdown table.
 * Currently only handles native TABLE nodes.
 *
 * Note: We intentionally don't detect "table-like" FRAME structures
 * to avoid false positives. Only native TABLE nodes are converted.
 */
export function shouldConvertToMarkdown(node: FigmaDocumentNode): boolean {
  return isTableNode(node);
}
