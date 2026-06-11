/**
 * Azure DevOps API type definitions
 */

export interface AzureDevOpsConfig {
  organization: string;
  pat?: string;
  authMode?: 'pat' | 'entra-id';
  projects: string[];  // List of allowed projects
  apiVersion?: string;
  enableWorkItemWrite?: boolean;
  enableWorkItemDelete?: boolean;
  enableWikiWrite?: boolean;
  enableWikiDelete?: boolean;
  /**
   * Comment format for work item comments.
   * - 'markdown' (default): Send comments as Markdown (for orgs with Markdown preview enabled)
   * - 'html': Convert Markdown to HTML before sending (for legacy orgs without Markdown preview)
   */
  commentFormat?: 'markdown' | 'html';

  // Pull Request Operations
  enablePullRequestWrite?: boolean;
}

// Interface for API responses with value collections
export interface AdoApiCollectionResponse<T> {
  value: T[];
  count?: number;
  [key: string]: any; // For any additional properties
}

// ═══════════════════════════════════════════════════════════════════════════════
// PULL REQUEST TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface Repository {
  id: string;
  name: string;
  url: string;
  project: { id: string; name: string };
  defaultBranch?: string;
  size?: number;
  remoteUrl?: string;
  sshUrl?: string;
  webUrl?: string;
}

export interface PullRequest {
  pullRequestId: number;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'abandoned' | 'all';
  createdBy: { displayName: string; id: string; uniqueName: string };
  creationDate: string;
  closedDate?: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus?: string;
  isDraft?: boolean;
  reviewers?: PullRequestReviewer[];
  labels?: { id: string; name: string }[];
  autoCompleteSetBy?: { displayName: string; id: string };
  completionOptions?: any;
  repository: { id: string; name: string };
  supportsIterations?: boolean;
  _links?: Record<string, { href: string }>;
}

export interface PullRequestReviewer {
  id: string;
  displayName: string;
  uniqueName: string;
  vote: number;  // -10=Rejected, -5=Waiting, 0=NoResponse, 5=ApprovedWithSuggestions, 10=Approved
  isRequired?: boolean;
  hasDeclined?: boolean;
  isFlagged?: boolean;
}

export interface PullRequestThread {
  id: number;
  publishedDate: string;
  lastUpdatedDate: string;
  status: 'unknown' | 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending';
  threadContext?: {
    filePath?: string;
    leftFileStart?: { line: number; offset: number };
    leftFileEnd?: { line: number; offset: number };
    rightFileStart?: { line: number; offset: number };
    rightFileEnd?: { line: number; offset: number };
  };
  comments: PullRequestComment[];
  properties?: Record<string, any>;
  isDeleted?: boolean;
}

export interface PullRequestComment {
  id: number;
  parentCommentId?: number;
  author: { displayName: string; id: string };
  content: string;
  publishedDate: string;
  lastUpdatedDate?: string;
  lastContentUpdatedDate?: string;
  commentType: 'unknown' | 'text' | 'codeChange' | 'system';
  usersLiked?: any[];
}

export interface PullRequestIteration {
  id: number;
  description?: string;
  author: { displayName: string; id: string };
  createdDate: string;
  updatedDate?: string;
  sourceRefCommit: { commitId: string };
  targetRefCommit: { commitId: string };
  commonRefCommit?: { commitId: string };
  hasMoreCommits?: boolean;
  reason?: string;
}

export interface PullRequestChange {
  changeId: number;
  changeType: string;  // add, edit, delete, rename
  item: {
    objectId: string;
    originalObjectId?: string;
    gitObjectType: string;
    commitId?: string;
    path: string;
    url?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKLIST TYPE DEFINITIONS (mohitbagra/workitem-checklist extension)
// ═══════════════════════════════════════════════════════════════════════════════

export type ChecklistItemState = 'New' | 'In Progress' | 'Blocked' | 'N/A' | 'Completed';

export interface ChecklistIdentityRef {
  id?: string;
  displayName: string;
  uniqueName?: string;
  imageUrl?: string;
}

export interface IChecklistItem {
  id: string;
  text: string;
  required?: boolean;
  state: ChecklistItemState;
  completedBy?: ChecklistIdentityRef;
  completedDate?: string;
  labels?: string[];
}

export interface IChecklist {
  id: string;
  __etag?: number;
  checklistItems: IChecklistItem[];
}

export interface MergedChecklistItem extends IChecklistItem {
  /** Whether this item comes from the WIT template (true) or is a custom item (false) */
  isTemplateItem: boolean;
}

export interface MergedChecklist {
  workItemId: number;
  workItemType: string;
  project: string;
  templateItemCount: number;
  completedCount: number;
  totalCount: number;
  completionPercent: number;
  items: MergedChecklistItem[];
}

export interface ChecklistTemplateSummary {
  workItemType: string;
  itemCount: number;
  requiredCount: number;
}

export interface ChecklistReportEntry {
  workItemId: number;
  title: string;
  state: string;
  assignedTo: string | null;
  workItemType: string;
  totalItems: number;
  completedItems: number;
  completionPercent: number;
  incompleteRequired: number;
  incompleteItems: string[];
}

export interface ChecklistReport {
  project: string;
  workItemType: string | null;
  workItemState: string | null;
  totalWorkItems: number;
  fullyComplete: number;
  partiallyComplete: number;
  notStarted: number;
  entries: ChecklistReportEntry[];
}
