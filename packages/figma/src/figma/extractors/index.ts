// Types
export type {
  ExtractorFn,
  TraversalContext,
  TraversalOptions,
  GlobalVars,
  StyleTypes,
} from "./types.js";

// Core traversal function
export { extractFromDesign } from "./node-walker.js";

// Design-level extraction (unified nodes + components)
export { simplifyRawFigmaObject } from "./design-extractor.js";

// Built-in extractors and afterChildren helpers
export {
  layoutExtractor,
  textExtractor,
  visualsExtractor,
  componentExtractor,
  // Convenience combinations
  allExtractors,
  layoutAndText,
  contentOnly,
  visualsOnly,
  layoutOnly,
  // afterChildren helpers
  collapseSvgContainers,
  SVG_ELIGIBLE_TYPES,
} from "./built-in.js";

// Semantic extraction for FigJam boards
export {
  extractSemanticData,
  categorizeStickyColor,
  extractUserStories,
  type SemanticExtract,
  type SemanticExtractOptions,
  type StickyCategory,
  type SectionSummary,
  type StickyNote,
  type ComponentSummary,
  type TextNodeSummary,
  type ConnectorSummary,
  type UserStoryRef,
} from "./semantic-extractor.js";
