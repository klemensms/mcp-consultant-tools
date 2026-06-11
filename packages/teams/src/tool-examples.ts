/**
 * Tool Examples for Microsoft Teams Tools
 * Provides examples to improve LLM accuracy when using these tools
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// Channel Name Examples
// ========================================

export const CHANNEL_NAME_EXAMPLES = [
  { label: "Default channel", value: "General" },
  { label: "Engineering channel", value: "Engineering" },
  { label: "Announcements channel", value: "Announcements" },
];

// ========================================
// Message Format Examples
// ========================================

export const MESSAGE_FORMAT_EXAMPLES = [
  { label: "Plain text", value: "text" },
  { label: "Rich markdown", value: "markdown" },
];

// ========================================
// Importance Examples
// ========================================

export const IMPORTANCE_EXAMPLES = [
  { label: "Standard message", value: "normal" },
  { label: "Important notification", value: "high" },
  { label: "Critical alert", value: "urgent" },
];

// ========================================
// Card Template Examples
// ========================================

export const CARD_TEMPLATE_EXAMPLES = [
  { label: "Standard release", value: "release-announcement" },
  { label: "Beta release", value: "beta-release" },
  { label: "Urgent hotfix", value: "hotfix" },
];

// ========================================
// Message Content Examples
// ========================================

export const MESSAGE_CONTENT_EXAMPLES = [
  { label: "Simple text", value: "Build succeeded for release/28.0" },
  { label: "Markdown with list", value: "## Release Notes\\n- Fixed auth bug\\n- Added new tools" },
  { label: "Status update", value: "Deployment to production completed successfully." },
];
