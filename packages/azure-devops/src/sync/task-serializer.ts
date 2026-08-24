/**
 * Task Serialization Utilities
 *
 * Convert between ADO Task work items and local markdown files.
 * Tasks are stored in a single file per parent User Story: {parentId}-tasks.md
 * Supports upsert: update existing tasks or create new ones.
 */

import { isHtmlContent } from './html-detection.js';
import { htmlToMarkdown, normalizeMarkdownForCompare } from './html-converter.js';

/**
 * Task field names in ADO API
 */
export const TASK_FIELDS = {
  title: 'System.Title',
  description: 'System.Description',
  state: 'System.State',
  assignedTo: 'System.AssignedTo',
  originalEstimate: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
  remainingWork: 'Microsoft.VSTS.Scheduling.RemainingWork',
  completedWork: 'Microsoft.VSTS.Scheduling.CompletedWork',
  effort: 'Microsoft.VSTS.Scheduling.Effort',
  parent: 'System.Parent',
  areaPath: 'System.AreaPath',
  iterationPath: 'System.IterationPath',
} as const;

/**
 * Parsed task from markdown
 */
export interface ParsedTask {
  id: number | null; // null = new task
  title: string;
  state: string;
  assignedTo?: string;
  iterationPath?: string;
  areaPath?: string;
  originalEstimate?: number;
  remainingWork?: number;
  completedWork?: number;
  effort?: number;
  revision?: number;
  description?: string;
}

/**
 * Tasks file frontmatter
 */
export interface TasksFileFrontmatter {
  parentId: number;
  parentTitle: string;
  project: string;
  lastSyncedAt: string;
}

/**
 * Parsed tasks file
 */
export interface ParsedTasksFile {
  frontmatter: TasksFileFrontmatter;
  tasks: ParsedTask[];
  rawContent: string;
}

/**
 * Simple YAML serializer for frontmatter
 */
function serializeFrontmatter(data: Record<string, any>): string {
  const lines: string[] = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      // Quote strings that might be parsed as other types or contain special chars
      if (value.includes(':') || value.includes('#') || value.includes('\n') ||
          value.match(/^[\d.]+$/) || value === 'true' || value === 'false' ||
          value === 'null' || value === '') {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Simple YAML parser for frontmatter
 */
function parseFrontmatter(yamlContent: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)?$/);
    if (match) {
      const key = match[1];
      const rawValue = match[2]?.trim();

      if (rawValue !== undefined && rawValue !== '') {
        result[key] = parseYamlValue(rawValue);
      }
    }
  }

  return result;
}

/**
 * Parse a YAML value string to appropriate type
 */
function parseYamlValue(value: string): any {
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null' || value === '~') return null;

  // Number
  if (value.match(/^-?\d+$/)) return parseInt(value, 10);
  if (value.match(/^-?\d+\.\d+$/)) return parseFloat(value);

  return value;
}

/**
 * Convert ADO tasks to markdown file content
 *
 * @param parentWorkItem - The parent work item (User Story)
 * @param tasks - Array of task work items
 * @param project - Project name
 * @returns Markdown content
 */
export function tasksToMarkdown(
  parentWorkItem: any,
  tasks: any[],
  project: string,
  /**
   * Child tasks that exist on the parent but could not be fetched. Rendered as a warning
   * rather than omitted, because the person editing this file is about to push it back and
   * a task missing from the file is a task they will not know they left behind.
   */
  unreadable: { id: string; reason: string }[] = []
): string {
  const parentFields = parentWorkItem.fields || {};

  const frontmatter: TasksFileFrontmatter = {
    parentId: parentWorkItem.id,
    parentTitle: parentFields['System.Title'] || '',
    project,
    lastSyncedAt: new Date().toISOString(),
  };

  let content = serializeFrontmatter(frontmatter);
  content += `\n\n# Tasks for User Story #${parentWorkItem.id}\n\n`;
  content += `> **Note**: This file supports upsert - edit existing tasks or add new ones below.\n\n`;

  if (unreadable.length > 0) {
    content += `> ⚠️ **${unreadable.length} child task(s) could not be read** and are missing from this file. Do not treat it as the complete task list for this story:\n`;
    for (const failure of unreadable) {
      content += `> - Task #${failure.id}: ${failure.reason}\n`;
    }
    content += `\n`;
  }

  if (tasks.length === 0) {
    content += `_No tasks found for this User Story._\n\n`;
    content += `---\n\n`;
    content += `## NEW TASK\n`;
    content += `**Title**: \n`;
    content += `**State**: New\n`;
    content += `**Assigned To**: \n`;
    content += `**Iteration Path**: \n`;
    content += `**Area Path**: \n`;
    content += `**Original Estimate**: \n`;
    content += `**Remaining Work**: \n`;
    content += `**Completed Work**: 0\n`;
    content += `**Effort**: \n\n`;
    content += `### Description\n\n`;
    content += `_Add task description here_\n`;
  } else {
    for (const task of tasks) {
      const fields = task.fields || {};
      const taskId = task.id;
      const revision = task.rev || task._rev || 1;

      content += `---\n\n`;
      content += `## Task #${taskId}\n`;
      content += `**Title**: ${fields['System.Title'] || ''}\n`;
      content += `**State**: ${fields['System.State'] || 'New'}\n`;
      content += `**Assigned To**: ${fields['System.AssignedTo']?.displayName || ''}\n`;
      content += `**Iteration Path**: ${fields['System.IterationPath'] || ''}\n`;
      content += `**Area Path**: ${fields['System.AreaPath'] || ''}\n`;
      content += `**Original Estimate**: ${fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] ?? ''}\n`;
      content += `**Remaining Work**: ${fields['Microsoft.VSTS.Scheduling.RemainingWork'] ?? ''}\n`;
      content += `**Completed Work**: ${fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? ''}\n`;
      content += `**Effort**: ${fields['Microsoft.VSTS.Scheduling.Effort'] ?? ''}\n`;
      content += `**Revision**: ${revision}\n\n`;
      content += `### Description\n\n`;

      const description = fields['System.Description'] || '';
      if (description) {
        // Fall back to local HTML → markdown conversion when the upstream
        // auto-convert (via ADO API) didn't run or didn't apply. Keeps the
        // serialized file free of HTML so push/pull round-trips cleanly.
        const rendered = isHtmlContent(description)
          ? htmlToMarkdown(description).trim()
          : description.trim();
        content += rendered || `_No description_`;
      } else {
        content += `_No description_`;
      }
      content += `\n\n`;
    }
  }

  return content;
}

/**
 * Parse a tasks markdown file to extract frontmatter and tasks
 */
export function parseTasksMarkdown(content: string): ParsedTasksFile {
  // Extract frontmatter between ---
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Invalid tasks markdown file: missing YAML frontmatter');
  }

  const frontmatterRaw = frontmatterMatch[1];
  const frontmatterData = parseFrontmatter(frontmatterRaw);

  // Validate required fields
  if (!frontmatterData.parentId || typeof frontmatterData.parentId !== 'number') {
    throw new Error('Invalid tasks markdown file: missing or invalid "parentId" in frontmatter');
  }

  const frontmatter: TasksFileFrontmatter = {
    parentId: frontmatterData.parentId,
    parentTitle: frontmatterData.parentTitle || '',
    project: frontmatterData.project || '',
    lastSyncedAt: frontmatterData.lastSyncedAt || '',
  };

  // Extract content after frontmatter
  const contentAfterFrontmatter = content.slice(frontmatterMatch[0].length);

  // Parse all task sections
  const tasks: ParsedTask[] = [];

  // Match task sections: either ## Task #NNNNN or ## NEW TASK
  // Delimit only on the next ## Task / ## NEW TASK heading (or EOF) so that
  // horizontal rules (`---`) used inside task Descriptions are not treated as
  // inter-task separators. Trailing `---\n` before the next heading is stripped
  // from the captured block before field extraction.
  const taskSectionRegex = /##\s+(Task\s+#(\d+)|NEW\s+TASK)\s*\n([\s\S]*?)(?=\n##\s+(?:Task|NEW)|$)/gi;
  let match;

  while ((match = taskSectionRegex.exec(contentAfterFrontmatter)) !== null) {
    const isNewTask = match[1].toUpperCase().startsWith('NEW');
    const taskId = isNewTask ? null : parseInt(match[2], 10);
    const taskContent = stripTrailingSeparator(match[3]);

    const task = parseTaskSection(taskContent, taskId);
    if (task.title) { // Only include tasks with a title
      tasks.push(task);
    }
  }

  return {
    frontmatter,
    tasks,
    rawContent: content,
  };
}

/**
 * Strip the trailing inter-task `---` separator (plus any surrounding blank
 * lines) from a captured task block. Horizontal rules inside a Description
 * are preserved - only a `---` that sits at the tail of the block (right
 * before the next task heading or EOF) is removed.
 */
function stripTrailingSeparator(content: string): string {
  return content.replace(/\n\s*---\s*\n?\s*$/, '\n').replace(/\s+$/, '');
}

/**
 * Parse a single task section
 */
function parseTaskSection(content: string, taskId: number | null): ParsedTask {
  const task: ParsedTask = {
    id: taskId,
    title: '',
    state: 'New',
  };

  // Extract field values using regex
  const extractField = (fieldName: string): string | undefined => {
    const regex = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.*)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : undefined;
  };

  const extractNumericField = (fieldName: string): number | undefined => {
    const value = extractField(fieldName);
    if (value === undefined || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  };

  task.title = extractField('Title') || '';
  task.state = extractField('State') || 'New';

  const assignedTo = extractField('Assigned To');
  if (assignedTo) task.assignedTo = assignedTo;

  const iterationPath = extractField('Iteration Path');
  if (iterationPath) task.iterationPath = iterationPath;

  const areaPath = extractField('Area Path');
  if (areaPath) task.areaPath = areaPath;

  const originalEstimate = extractNumericField('Original Estimate');
  if (originalEstimate !== undefined) task.originalEstimate = originalEstimate;

  const remainingWork = extractNumericField('Remaining Work');
  if (remainingWork !== undefined) task.remainingWork = remainingWork;

  const completedWork = extractNumericField('Completed Work');
  if (completedWork !== undefined) task.completedWork = completedWork;

  const effort = extractNumericField('Effort');
  if (effort !== undefined) task.effort = effort;

  const revision = extractNumericField('Revision');
  if (revision !== undefined) task.revision = revision;

  // Extract description (content after ### Description)
  const descriptionMatch = content.match(/###\s*Description\s*\n([\s\S]*?)$/i);
  if (descriptionMatch) {
    const desc = descriptionMatch[1].trim();
    if (desc && desc !== '_No description_' && desc !== '_Add task description here_' &&
        !desc.startsWith('_Description is HTML')) {
      task.description = desc;
    }
  }

  return task;
}

/**
 * ADO terminal states where scheduling fields (notably Remaining Work) must
 * be unset rather than zero. Setting Remaining Work = 0 on a transition to
 * one of these states triggers TF401320 "Rule Error ... InvalidNotEmpty".
 */
const TERMINAL_STATES = new Set(['Closed', 'Done', 'Resolved', 'Removed', 'Completed']);

/**
 * Build patch operations for updating a task in ADO
 */
export function buildTaskPatchOperations(
  parsedTask: ParsedTask,
  currentTask: any,
  skipAutoConvert: boolean = false
): { operations: any[]; fieldsUpdated: string[]; convertedFields: string[] } {
  const operations: any[] = [];
  const fieldsUpdated: string[] = [];
  const convertedFields: string[] = [];
  const currentFields = currentTask.fields || {};

  // Detect if state is changing (used to force-include scheduling fields for ADO process rules)
  const stateIsChanging = parsedTask.state !== (currentFields[TASK_FIELDS.state] || 'New');
  const transitioningToTerminal = stateIsChanging && TERMINAL_STATES.has(parsedTask.state);

  // Helper to add operation if value changed
  const addIfChanged = (
    fieldPath: string,
    newValue: any,
    fieldName: string,
    forceInclude: boolean = false
  ) => {
    const currentValue = currentFields[fieldPath];

    // Handle null/undefined/empty string comparisons - use strict checks to preserve 0
    const normalizedNew = newValue === '' || newValue === undefined ? null : newValue;
    const normalizedCurrent = currentValue === '' || currentValue === undefined ? null : currentValue;

    // For AssignedTo, we only get displayName from the file but ADO stores an object
    if (fieldPath === TASK_FIELDS.assignedTo) {
      // Skip if we can't properly compare (would need email/ID to set)
      return;
    }

    if (normalizedNew !== normalizedCurrent || forceInclude) {
      if (normalizedNew === null && !forceInclude) {
        // Remove the field
        operations.push({
          op: 'remove',
          path: `/fields/${fieldPath}`,
        });
      } else if (normalizedNew === null && forceInclude) {
        // Force-include with null value: re-send current value (or 0 if no current value).
        // ADO requires scheduling fields to be present during state transitions;
        // omitting them causes TF401320 InvalidNotEmpty.
        const fallback = normalizedCurrent !== null ? normalizedCurrent : 0;
        operations.push({
          op: currentValue !== undefined && currentValue !== null ? 'replace' : 'add',
          path: `/fields/${fieldPath}`,
          value: fallback,
        });
      } else if (normalizedNew !== null) {
        operations.push({
          op: currentValue !== undefined && currentValue !== null ? 'replace' : 'add',
          path: `/fields/${fieldPath}`,
          value: newValue,
        });
      }
      if (normalizedNew !== normalizedCurrent) {
        fieldsUpdated.push(fieldName);
      }
    }
  };

  // Check each field
  addIfChanged(TASK_FIELDS.title, parsedTask.title, 'Title');
  addIfChanged(TASK_FIELDS.state, parsedTask.state, 'State');
  addIfChanged(TASK_FIELDS.iterationPath, parsedTask.iterationPath, 'IterationPath');
  addIfChanged(TASK_FIELDS.areaPath, parsedTask.areaPath, 'AreaPath');

  // When state changes, always include scheduling fields even if values are unchanged.
  // ADO process rules may require these fields during state transitions (e.g., Remaining Work
  // must not be empty when closing). Without force-include, unchanged values are omitted and
  // ADO rejects the update with TF401320 InvalidNotEmpty.
  const forceScheduling = stateIsChanging;
  addIfChanged(TASK_FIELDS.originalEstimate, parsedTask.originalEstimate, 'OriginalEstimate', forceScheduling);

  // Remaining Work has an inverse rule on transitions to terminal states: ADO
  // requires the field to be *unset* (not zero) when the task closes. Auto-emit
  // a remove op so users don't have to know the ADO-specific "blank != 0" rule.
  // Zero or blank both map to remove; a non-zero value gets removed too (closing
  // a task implicitly means no work is left).
  if (transitioningToTerminal) {
    const currentRemaining = currentFields[TASK_FIELDS.remainingWork];
    if (currentRemaining !== undefined && currentRemaining !== null) {
      operations.push({ op: 'remove', path: `/fields/${TASK_FIELDS.remainingWork}` });
      fieldsUpdated.push('RemainingWork');
    }
  } else {
    addIfChanged(TASK_FIELDS.remainingWork, parsedTask.remainingWork, 'RemainingWork', forceScheduling);
  }

  addIfChanged(TASK_FIELDS.completedWork, parsedTask.completedWork, 'CompletedWork', forceScheduling);
  addIfChanged(TASK_FIELDS.effort, parsedTask.effort, 'Effort', forceScheduling);

  // Check description - always try to set markdown format when writing
  const currentDescription = currentFields[TASK_FIELDS.description] || '';
  const newDescription = parsedTask.description || '';
  const descriptionIsHtml = isHtmlContent(currentDescription);

  // ADO stores HTML descriptions but the file holds Markdown; compare against the
  // Markdown the pull produces so an *unedited* HTML description isn't re-pushed
  // (which would flip it to Markdown format and clobber a complex table).
  const currentDescriptionComparable = descriptionIsHtml
    ? htmlToMarkdown(currentDescription)
    : currentDescription;
  const descriptionChanged =
    normalizeMarkdownForCompare(newDescription) !==
    normalizeMarkdownForCompare(currentDescriptionComparable);

  if (descriptionIsHtml && skipAutoConvert) {
    // Skip HTML field when skipAutoConvert is true
    // Don't add to fieldsUpdated since we're skipping
  } else if (descriptionChanged) {
    // Write field value AND always try to set markdown format
    operations.push({
      op: currentDescription ? 'replace' : 'add',
      path: `/fields/${TASK_FIELDS.description}`,
      value: newDescription,
    });
    // Always add format op - API silently ignores if not applicable
    operations.push({
      op: 'add',
      path: `/multilineFieldsFormat/${TASK_FIELDS.description}`,
      value: 'Markdown',
    });
    fieldsUpdated.push('Description');
    if (descriptionIsHtml) {
      convertedFields.push('Description');
    }
  }

  return { operations, fieldsUpdated, convertedFields };
}

/**
 * Build fields object for creating a new task in ADO
 */
export function buildNewTaskFields(
  parsedTask: ParsedTask,
  areaPath?: string,
  iterationPath?: string
): Record<string, any> {
  const fields: Record<string, any> = {
    [TASK_FIELDS.title]: parsedTask.title,
    [TASK_FIELDS.state]: parsedTask.state || 'New',
  };

  if (parsedTask.description) {
    fields[TASK_FIELDS.description] = parsedTask.description;
  }

  if (parsedTask.originalEstimate !== undefined) {
    fields[TASK_FIELDS.originalEstimate] = parsedTask.originalEstimate;
  }

  if (parsedTask.remainingWork !== undefined) {
    fields[TASK_FIELDS.remainingWork] = parsedTask.remainingWork;
  }

  if (parsedTask.completedWork !== undefined) {
    fields[TASK_FIELDS.completedWork] = parsedTask.completedWork;
  }

  if (parsedTask.effort !== undefined) {
    fields[TASK_FIELDS.effort] = parsedTask.effort;
  }

  if (parsedTask.areaPath || areaPath) {
    fields[TASK_FIELDS.areaPath] = parsedTask.areaPath || areaPath;
  }

  if (parsedTask.iterationPath || iterationPath) {
    fields[TASK_FIELDS.iterationPath] = parsedTask.iterationPath || iterationPath;
  }

  return fields;
}

/**
 * Get the file path for a tasks file
 */
export function getTasksFilePath(folder: string, parentId: number): string {
  return `${folder}/${parentId}-tasks.md`;
}

/**
 * Update the tasks file after creating new tasks
 * Replaces "## NEW TASK" sections with "## Task #ID" after creation
 */
export function updateTasksFileAfterCreate(
  content: string,
  createdTasks: { title: string; id: number }[]
): string {
  let updatedContent = content;

  // Update lastSyncedAt
  updatedContent = updatedContent.replace(
    /lastSyncedAt:\s*[^\n]+/,
    `lastSyncedAt: ${new Date().toISOString()}`
  );

  // Replace each NEW TASK with its actual ID based on title matching
  for (const created of createdTasks) {
    // Find NEW TASK section with matching title
    const newTaskRegex = new RegExp(
      `(##\\s+NEW\\s+TASK\\s*\\n\\*\\*Title\\*\\*:\\s*${escapeRegex(created.title)}[\\s\\S]*?)(?=\\n---\\n|\\n##\\s+(?:Task|NEW)|$)`,
      'i'
    );

    const match = updatedContent.match(newTaskRegex);
    if (match) {
      // Replace the NEW TASK header with Task #ID
      const section = match[1];
      const updatedSection = section
        .replace(/##\s+NEW\s+TASK/i, `## Task #${created.id}`)
        // Add Revision: 1 after the last field before ### Description
        .replace(
          /(\*\*Effort\*\*:\s*[^\n]*\n)(\n###\s*Description)/i,
          `$1**Revision**: 1\n$2`
        );
      updatedContent = updatedContent.replace(section, updatedSection);
    }
  }

  return updatedContent;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
