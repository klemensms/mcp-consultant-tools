/**
 * Tool Examples for GitHub Enterprise PR Tools
 * Provides examples to improve LLM accuracy when using these tools
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// Review Event Examples
// ========================================

export const REVIEW_EVENT_EXAMPLES = [
  { label: "Approve PR", value: "APPROVE" },
  { label: "Request changes", value: "REQUEST_CHANGES" },
  { label: "Add comment without approval", value: "COMMENT" },
];

// ========================================
// Merge Method Examples
// ========================================

export const MERGE_METHOD_EXAMPLES = [
  { label: "Squash all commits (default)", value: "squash" },
  { label: "Create merge commit", value: "merge" },
  { label: "Rebase and merge", value: "rebase" },
];

// ========================================
// Branch Examples
// ========================================

export const BRANCH_EXAMPLES = [
  { label: "Main branch", value: "main" },
  { label: "Release branch", value: "release/26.0" },
  { label: "Feature branch", value: "feature/add-auth" },
];

// ========================================
// PR Number Examples
// ========================================

export const PR_NUMBER_EXAMPLES = [
  { label: "Typical PR", value: "123" },
  { label: "Recent PR", value: "456" },
];

// ========================================
// Review Comment Path Examples
// ========================================

export const FILE_PATH_EXAMPLES = [
  { label: "TypeScript file", value: "src/services/UserService.ts" },
  { label: "Config file", value: "package.json" },
  { label: "Test file", value: "tests/UserService.test.ts" },
];

// ========================================
// Comment Body Examples
// ========================================

export const REVIEW_BODY_EXAMPLES = [
  { label: "Approval comment", value: "LGTM! Code looks clean and well-tested." },
  { label: "Change request", value: "Please add error handling for the edge case on line 45." },
  { label: "Question", value: "Could you explain the reasoning behind this approach?" },
];

export const INLINE_COMMENT_EXAMPLES = [
  { label: "Suggestion", value: "Consider using a Map here for O(1) lookups." },
  { label: "Bug concern", value: "This could cause a null reference if user is undefined." },
  { label: "Style note", value: "This function is quite long - consider breaking it into smaller helpers." },
];

// ========================================
// PR Title/Description Examples
// ========================================

export const PR_TITLE_EXAMPLES = [
  { label: "Feature", value: "feat: Add user authentication flow" },
  { label: "Bug fix", value: "fix: Resolve null pointer in checkout" },
  { label: "Refactor", value: "refactor: Simplify payment processing" },
];

export const PR_DESCRIPTION_EXAMPLES = [
  { label: "Feature PR", value: "## Summary\\nAdds OAuth2 authentication...\\n\\n## Test Plan\\n- [ ] Login works\\n- [ ] Logout clears session" },
  { label: "Bug fix PR", value: "## Problem\\nUsers see error on checkout...\\n\\n## Solution\\nAdded null check..." },
];

// ========================================
// Label Examples
// ========================================

export const LABEL_EXAMPLES = [
  { label: "Bug label", value: "bug" },
  { label: "Enhancement", value: "enhancement" },
  { label: "Needs review", value: "needs-review" },
  { label: "Priority", value: "priority:high" },
];

// ========================================
// Reviewer Examples
// ========================================

export const REVIEWER_EXAMPLES = [
  { label: "Single reviewer", value: "jsmith" },
  { label: "Multiple reviewers (JSON)", value: '["jsmith", "mjones"]' },
];

export const TEAM_REVIEWER_EXAMPLES = [
  { label: "Frontend team", value: "frontend-team" },
  { label: "Code owners", value: "platform-owners" },
];
