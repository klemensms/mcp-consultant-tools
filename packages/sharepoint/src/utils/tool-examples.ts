/**
 * Tool Examples for SharePoint Tools
 * Provides examples to improve LLM accuracy when using these tools
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// Site ID Examples
// ========================================

export const SITE_ID_EXAMPLES = [
  { label: "Named site", value: "intranet" },
  { label: "Default site", value: "default" },
  { label: "Project site", value: "project-alpha" },
];

// ========================================
// Drive ID Examples
// ========================================

export const DRIVE_ID_EXAMPLES = [
  { label: "Drive GUID", value: "b!abc123..." },
];

// ========================================
// File Path Examples
// ========================================

export const FILE_PATH_EXAMPLES = [
  { label: "Root file", value: "/Report.xlsx" },
  { label: "Nested file", value: "/Projects/2024/proposal.docx" },
  { label: "Folder path", value: "/Shared Documents/Archive" },
];

// ========================================
// Upload Path Examples
// ========================================

export const UPLOAD_PATH_EXAMPLES = [
  { label: "Root upload", value: "/NewFile.txt" },
  { label: "Subfolder upload", value: "/Reports/Q1/summary.csv" },
];

// ========================================
// Folder Name Examples
// ========================================

export const FOLDER_NAME_EXAMPLES = [
  { label: "Simple folder", value: "Archive" },
  { label: "Dated folder", value: "2024-Q1-Reports" },
];
