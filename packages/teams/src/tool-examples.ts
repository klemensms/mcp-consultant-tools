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

// ========================================
// Message Read Examples
// ========================================

export const MESSAGE_TOP_EXAMPLES = [
  { label: "Default recent window", value: "20" },
  { label: "Quick skim", value: "5" },
  { label: "Graph maximum per page", value: "50" },
];

export const MESSAGE_DATE_EXAMPLES = [
  { label: "Since a specific day", value: "2026-08-01T00:00:00Z" },
  { label: "Since a specific time", value: "2026-08-12T09:30:00Z" },
];

export const MESSAGE_ID_EXAMPLES = [
  { label: "Channel message id (epoch millis)", value: "1616990032035" },
];

export const CHAT_ID_EXAMPLES = [
  { label: "Group or meeting chat", value: "19:561082c0f3f847a58069deb8eb300807@thread.v2" },
  { label: "One-on-one chat", value: "19:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_11111111-2222-3333-4444-555555555555@unq.gbl.spaces" },
];
