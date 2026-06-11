/**
 * Tool Examples for Figma Tools
 * Provides examples to improve LLM accuracy when using these tools
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// File Key Examples
// ========================================

export const FILE_KEY_EXAMPLES = [
  { label: "From URL https://figma.com/file/abc123XYZ/...", value: "abc123XYZ" },
  { label: "FigJam board", value: "Abc123SampleFileKey000" },
];

// ========================================
// Node ID Examples
// ========================================

export const NODE_ID_EXAMPLES = [
  { label: "Root node", value: "0:1" },
  { label: "Specific frame", value: "1234:5678" },
  { label: "Section node", value: "1234-5678" },
];

// ========================================
// Extractor Examples
// ========================================

export const EXTRACTOR_EXAMPLES = [
  { label: "Structure only", value: "layout" },
  { label: "Text content", value: "text" },
  { label: "Colors and styles", value: "visuals" },
  { label: "Design system components", value: "component" },
];

// ========================================
// Sticky Category Examples
// ========================================

export const STICKY_CATEGORY_EXAMPLES = [
  { label: "Blocking issue", value: "blocker" },
  { label: "To be determined", value: "tbd" },
  { label: "Completed item", value: "done" },
  { label: "Informational note", value: "info" },
];

// ========================================
// Story ID Pattern Examples
// ========================================

export const STORY_ID_PATTERN_EXAMPLES = [
  { label: "Default pattern (US/Story/Task/Bug + number)", value: "(US|Story\\s*#?|Task\\s*#?|Bug\\s*#?)\\d+" },
  { label: "Simple numeric IDs", value: "#\\d+" },
];

// ========================================
// ADO Organization Examples
// ========================================

export const ADO_ORG_EXAMPLES = [
  { label: "Organization name", value: "myorg" },
];

export const ADO_PROJECT_EXAMPLES = [
  { label: "Project name", value: "MyProject" },
];
