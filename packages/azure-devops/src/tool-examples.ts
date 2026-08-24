/**
 * Tool Use Examples for Azure DevOps MCP Tools
 *
 * Provides inline examples embedded in Zod `.describe()` strings to improve
 * LLM accuracy when calling these tools. Based on Anthropic research showing
 * 72% → 90% accuracy improvement with examples.
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// WIQL Query Examples
// ========================================

export const WIQL_EXAMPLES = [
  {
    label: "Active bugs",
    value: "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.State] = 'Active'"
  },
  {
    label: "My assigned items",
    value: "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC"
  },
  {
    label: "Children of parent",
    value: "SELECT [System.Id] FROM WorkItems WHERE [System.Parent] = 12345"
  },
];

// ========================================
// JSON Patch Operation Examples
// ========================================

export const PATCH_OP_EXAMPLES = [
  {
    label: "Update state",
    value: '{ "op": "replace", "path": "/fields/System.State", "value": "Active" }'
  },
  {
    label: "Set description",
    value: '{ "op": "add", "path": "/fields/System.Description", "value": "Content here" }'
  },
  {
    label: "Clear assignee",
    value: '{ "op": "remove", "path": "/fields/System.AssignedTo" }'
  },
];

// ========================================
// Work Item Field Examples
// ========================================

export const WORK_ITEM_FIELD_EXAMPLES = [
  {
    label: "Bug with details",
    value: '{"System.Title": "Login fails on mobile", "System.Description": "Steps to reproduce...", "Microsoft.VSTS.TCM.ReproSteps": "1. Open app..."}'
  },
  {
    label: "User Story",
    value: '{"System.Title": "As a user, I want to...", "Microsoft.VSTS.Common.AcceptanceCriteria": "Given... When... Then..."}'
  },
  {
    label: "Task",
    value: '{"System.Title": "Implement API endpoint", "System.Description": "Details...", "Microsoft.VSTS.Scheduling.OriginalEstimate": 4}'
  },
];

// ========================================
// Sync Mode Examples
// ========================================

export const SYNC_TO_FILE_EXAMPLES = [
  {
    label: "Pull single work item",
    value: 'workItemIds: [1044]'
  },
  {
    label: "Pull multiple work items",
    value: 'workItemIds: [1044, 1045, 1046]'
  },
  {
    label: "Pull all User Stories under Feature",
    value: 'parentId: 12345'
  },
  {
    label: "Pull all Bugs under Feature",
    value: 'parentId: 12345, childType: "Bug"'
  },
];

export const SYNC_FROM_FILE_EXAMPLES = [
  {
    label: "Push specific work items",
    value: 'workItemIds: [1044, 1045]'
  },
  {
    label: "Auto-create new work items",
    value: 'project: "MyProject" (auto-detects new_*.md files)'
  },
];

export const SYNC_TASKS_TO_FILE_EXAMPLES = [
  {
    label: "Pull tasks for single User Story",
    value: 'parentIds: [12345]'
  },
  {
    label: "Pull tasks for multiple User Stories",
    value: 'parentIds: [12345, 12346, 12347]'
  },
];

export const SYNC_TASKS_FROM_FILE_EXAMPLES = [
  {
    label: "Push tasks for single parent",
    value: 'parentIds: [12345]'
  },
  {
    label: "Push tasks for multiple parents",
    value: 'parentIds: [12345, 12346]'
  },
];

// ========================================
// Pull Request Write Examples
// ========================================

export const PR_BRANCH_REF_EXAMPLES = [
  { label: "Feature branch", value: "refs/heads/feature/my-feature" },
  { label: "Main branch", value: "refs/heads/main" },
  { label: "Release branch", value: "refs/heads/release/2.0" },
];

export const PR_MERGE_STRATEGY_EXAMPLES = [
  { label: "Squash (default)", value: "squash" },
  { label: "No fast-forward merge commit", value: "noFastForward" },
  { label: "Rebase", value: "rebase" },
  { label: "Rebase merge", value: "rebaseMerge" },
];

export const PR_VOTE_EXAMPLES = [
  { label: "Approve", value: "approve" },
  { label: "Approve with suggestions", value: "approveWithSuggestions" },
  { label: "Wait for author", value: "waitForAuthor" },
  { label: "Reject", value: "reject" },
];

// ========================================
// Work Item Attachment Upload Examples
// ========================================

export const UPLOAD_ATTACHMENT_EXAMPLES = [
  {
    label: "Playwright screenshot for evidence",
    value: '/tmp/playwright-screenshot.png'
  },
  {
    label: "Local repro recording",
    value: '/Users/me/Desktop/bug-repro.gif'
  },
  {
    label: "Tied to a work item (auto-records in manifest)",
    value: 'filePath: "/tmp/evidence.png", workItemId: 73702'
  },
];

// ========================================
// Wiki Attachment Examples
// ========================================

export const ATTACHMENT_PATH_EXAMPLES = [
  { label: "Image with GUID", value: "/.attachments/image-3c114d08-35a1-4d31-a68f-5ddf3dabdd32.png" },
  { label: "Named screenshot", value: "/.attachments/screenshot-pipeline-config.png" },
];

// ========================================
// Wiki Page File Sync Examples
// ========================================

export const WIKI_SAVE_TO_FILE_EXAMPLES = [
  { label: "Save to specific path", value: 'outputPath: "./docs/wiki/auth-guide.md"' },
  { label: "Save with default naming", value: 'project: "MyProject", wikiId: "MyProject.wiki", pagePath: "/Setup/Authentication"' },
];

export const WIKI_UPLOAD_FROM_FILE_EXAMPLES = [
  { label: "Upload edited wiki page", value: 'filePath: "./docs/wiki/auth-guide.md"' },
  { label: "Upload from project folder", value: 'filePath: "docs/wiki-pages/Setup-Authentication.md"' },
];

// ========================================
// Create Work Item File Examples
// ========================================

// ========================================
// Checklist Examples
// ========================================

export const CHECKLIST_STATE_EXAMPLES = [
  { label: "Mark as completed", value: "Completed" },
  { label: "Mark as in progress", value: "In Progress" },
  { label: "Mark as blocked", value: "Blocked" },
  { label: "Mark as not applicable", value: "N/A" },
  { label: "Reset to new", value: "New" },
];

export const CHECKLIST_WIT_EXAMPLES = [
  { label: "User Story checklist", value: "User Story" },
  { label: "Bug checklist", value: "Bug" },
  { label: "Task checklist", value: "Task" },
  { label: "Feature checklist", value: "Feature" },
];

export const CHECKLIST_REPORT_EXAMPLES = [
  { label: "All active User Stories", value: 'workItemType: "User Story", workItemState: "Active"' },
  { label: "All bugs in testing", value: 'workItemType: "Bug", workItemState: "Testing"' },
  { label: "Everything in project", value: 'project: "MyProject"' },
];

export const CHECKLIST_TEMPLATE_ITEMS_EXAMPLES = [
  {
    label: "Simple checklist",
    value: '[{"text": "Update documentation", "required": true}, {"text": "Add tests", "required": true}]'
  },
  {
    label: "With optional item",
    value: '[{"text": "Update release notes", "required": true}, {"text": "Update wiki", "required": false}]'
  },
];

// ========================================
// Create Work Item File Examples
// ========================================

export const CREATE_WORK_ITEM_FILE_EXAMPLES = [
  {
    label: "User Story under Feature",
    value: 'project: "MyProject", parentId: 12345, workItemType: "User Story"'
  },
  {
    label: "Bug under Feature",
    value: 'project: "MyProject", parentId: 12345, workItemType: "Bug"'
  },
  {
    label: "Standalone Feature (no parent)",
    value: 'project: "MyProject", workItemType: "Feature"'
  },
  {
    label: "Standalone Epic",
    value: 'project: "MyProject", workItemType: "Epic"'
  },
];

// ========================================
// Test Management Examples
// ========================================

export const TEST_OUTCOME_EXAMPLES = [
  { label: "Passed", value: "Passed" },
  { label: "Failed", value: "Failed" },
  { label: "Not executed", value: "NotExecuted" },
  { label: "Blocked", value: "Blocked" },
  { label: "Not applicable", value: "NotApplicable" },
];

export const TEST_RUN_NAME_EXAMPLES = [
  { label: "Plugin test", value: "Plugin Test - #1928 - 2026-04-10" },
  { label: "API regression", value: "API Regression - Release 30.0" },
  { label: "Integration test", value: "Integration Test - Contact Form Rules" },
];

export const TEST_RUN_STATE_EXAMPLES = [
  { label: "In progress", value: "InProgress" },
  { label: "Completed", value: "Completed" },
  { label: "Aborted", value: "Aborted" },
];

export const AUTOMATED_TEST_NAME_EXAMPLES = [
  { label: "Plugin test", value: "Plugins.ContactPlugin.PreCreate.ValidateRequiredFields" },
  { label: "API test", value: "API.Users.GetById.Returns200WithValidId" },
];
