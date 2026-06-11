/**
 * Tool description examples for azure-devops-admin package.
 *
 * Anthropic research shows 72% -> 90% accuracy improvement when tools include examples.
 * Re-exports descWithExamples from core and defines domain-specific example arrays.
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

/** Build status values returned by the API */
export const BUILD_STATUS_EXAMPLES = [
  { label: 'Completed successfully', value: 'Succeeded' },
  { label: 'Build failed', value: 'Failed' },
  { label: 'Currently executing', value: 'Running' },
  { label: 'Queued, waiting for agent', value: 'Waiting' },
  { label: 'Manually cancelled', value: 'Cancelled' },
];

/** Build result values for filtering completed builds */
export const BUILD_RESULT_EXAMPLES = [
  { label: 'All steps passed', value: 'succeeded' },
  { label: 'Some steps had warnings', value: 'partiallySucceeded' },
  { label: 'Build failed', value: 'failed' },
  { label: 'Build was cancelled', value: 'canceled' },
];

/** Timeline scope options to control output verbosity */
export const TIMELINE_SCOPE_EXAMPLES = [
  { label: 'Only errors/warnings (default, smallest)', value: 'problems' },
  { label: 'Stage-level summary', value: 'stages' },
  { label: 'Stages + jobs (moderate)', value: 'jobs' },
  { label: 'Everything including tasks (can be large)', value: 'all' },
];

/** Variable expression syntax for pipeline variables */
export const VARIABLE_EXPRESSION_EXAMPLES = [
  { label: 'Reference a variable', value: '$(variableName)' },
  { label: 'Auto-incrementing counter', value: '$[counter(\'prefix\', 0)]' },
  { label: 'Built-in variable', value: '$(Build.BuildId)' },
  { label: 'Secret variable', value: '$(mySecret)' },
];

/** Common deployment environment names */
export const ENVIRONMENT_NAME_EXAMPLES = [
  { label: 'Production environment', value: 'Production' },
  { label: 'Staging/pre-prod', value: 'Staging' },
  { label: 'Development environment', value: 'Development' },
  { label: 'QA/testing', value: 'QA' },
];

/** Agent online/offline status values */
export const AGENT_STATUS_EXAMPLES = [
  { label: 'Agent is available', value: 'Online' },
  { label: 'Agent is unreachable', value: 'Offline' },
];

/** Feed scope - organization-wide vs project-scoped */
export const FEED_SCOPE_EXAMPLES = [
  { label: 'Organization-wide feed', value: 'organization' },
  { label: 'Project-scoped feed', value: 'project' },
];

/** Pipeline folder path format (backslash-delimited) */
export const PIPELINE_FOLDER_EXAMPLES = [
  { label: 'Root folder', value: '\\' },
  { label: 'Build folder', value: '\\Build' },
  { label: 'Nested folder', value: '\\Release\\Production' },
];

/** Approval status for stage gates */
export const APPROVAL_STATUS_EXAMPLES = [
  { label: 'Approve the stage', value: 'approved' },
  { label: 'Reject the stage', value: 'rejected' },
];

/** Common service connection types */
export const SVC_CONN_TYPE_EXAMPLES = [
  { label: 'Azure Resource Manager', value: 'AzureRM' },
  { label: 'GitHub repository', value: 'GitHub' },
  { label: 'npm registry', value: 'npm' },
  { label: 'NuGet feed', value: 'NuGet' },
  { label: 'Docker registry', value: 'Docker' },
];

/** Pool type filter for agent pools */
export const POOL_TYPE_EXAMPLES = [
  { label: 'Build/release pipelines', value: 'automation' },
  { label: 'Environment deployment groups', value: 'deployment' },
];

/** Package protocol types for artifact feeds */
export const PACKAGE_TYPE_EXAMPLES = [
  { label: 'NuGet (.NET)', value: 'nuget' },
  { label: 'npm (Node.js)', value: 'npm' },
  { label: 'Maven (Java)', value: 'maven' },
  { label: 'Universal packages', value: 'upack' },
  { label: 'PyPI (Python)', value: 'pypi' },
];

/** Build detail level options */
export const BUILD_DETAIL_EXAMPLES = [
  { label: 'Basic status only (default)', value: 'summary' },
  { label: 'Include step breakdown', value: 'timeline' },
  { label: 'Include logs (verbose)', value: 'full' },
];

/** Log filter mode options */
export const LOG_MODE_EXAMPLES = [
  { label: 'Filtered, no progress indicators (default)', value: 'summary' },
  { label: 'Complete unfiltered output', value: 'full' },
  { label: 'Only errors and warnings', value: 'errors' },
];

/** Check types for environment gates */
export const CHECK_TYPE_EXAMPLES = [
  { label: 'Manual approval gate', value: 'Approval' },
  { label: 'Time-based restriction', value: 'BusinessHours' },
  { label: 'Branch policy check', value: 'BranchControl' },
  { label: 'REST API validation', value: 'InvokeRESTAPI' },
  { label: 'Exclusive resource lock', value: 'ExclusiveLock' },
];

/** Process template types for project creation */
export const PROJECT_PROCESS_EXAMPLES = [
  { label: 'Agile process (default)', value: 'Agile' },
  { label: 'Scrum process', value: 'Scrum' },
  { label: 'Basic process', value: 'Basic' },
  { label: 'CMMI process', value: 'CMMI' },
];

/** Project visibility options */
export const PROJECT_VISIBILITY_EXAMPLES = [
  { label: 'Organization members only (default)', value: 'private' },
  { label: 'Public (visible to everyone)', value: 'public' },
];

/** Project state filter for listing */
export const PROJECT_STATE_FILTER_EXAMPLES = [
  { label: 'All states', value: 'all' },
  { label: 'Active projects (default)', value: 'wellFormed' },
  { label: 'Being created', value: 'createPending' },
  { label: 'Being deleted', value: 'deleting' },
];

/** Version control type for project creation */
export const PROJECT_VERSION_CONTROL_EXAMPLES = [
  { label: 'Git (default)', value: 'Git' },
  { label: 'Team Foundation Version Control', value: 'Tfvc' },
];
