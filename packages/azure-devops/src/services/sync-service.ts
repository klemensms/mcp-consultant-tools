/**
 * Sync Service - Orchestrates work item sync operations
 *
 * Wraps sync/ utilities and coordinates with WorkItemService for
 * local file <-> ADO synchronization.
 */
import { FanOutRecorder } from '@mcp-consultant-tools/core';
import type { WorkItemService } from './work-item-service.js';
import {
  checkFieldFormats,
  workItemToMarkdown,
  parseWorkItemMarkdown,
  commentsToMarkdown,
  buildPatchOperations,
  updateSyncRevision,
  getSyncConfig,
  ensureFolderExists,
  getWorkItemFilePath,
  getCommentsFilePath,
  fileExists,
  writeWorkItemFile,
  readWorkItemFile,
  readFileContent,
  listSyncedWorkItems,
  validateFolderPath,
  autoCommitMultipleFiles,
  tasksToMarkdown,
  parseTasksMarkdown,
  buildTaskPatchOperations,
  buildNewTaskFields,
  getTasksFilePath,
  updateTasksFileAfterCreate,
  parseNewWorkItemMarkdown,
  buildNewWorkItemFields,
  generateNewWorkItemTemplate,
  convertNewFileToSynced,
  getNewWorkItemFilePath,
  findNextNewFileIndex,
  findNewWorkItemFiles,
  renameFile,
  convertFieldsToMarkdownInMemory,
  isHtmlContent,
  pullWorkItemImages,
  pullCommentImages,
  pushWorkItemImages,
  templateBodyRefnamesForType,
} from '../sync/index.js';
import { getAllLargeTextFields } from '../sync/html-detection.js';

export class SyncService {
  constructor(
    private readonly workItemService: WorkItemService
  ) {}

  async syncWorkItemsToFile(
    project: string,
    providedWorkItemIds: number[],
    parentId?: number,
    childType?: string,
    folder?: string,
    includeComments?: boolean,
    skipAutoConvert?: boolean,
  ): Promise<any> {
    const syncConfig = getSyncConfig(folder);
    validateFolderPath(syncConfig.folder);

    let workItemIds: number[] = providedWorkItemIds || [];

    if (parentId) {
      const type = childType || 'User Story';
      const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.Parent] = ${parentId} AND [System.WorkItemType] = '${type}' ORDER BY [System.Id] ASC`;
      const queryResult = await this.workItemService.queryWorkItems(project, wiql, 200);

      if (queryResult.workItems && queryResult.workItems.length > 0) {
        const childIds = queryResult.workItems.map((wi: any) => wi.id);
        workItemIds = [...workItemIds, ...childIds];
      }
    }

    if (workItemIds.length === 0) {
      return {
        pulled: [],
        skipped: [],
        folder: syncConfig.folder,
        committed: false,
        message: parentId
          ? `No ${childType || 'User Story'} work items found under parent #${parentId}`
          : "No work item IDs provided. Specify workItemIds or parentId.",
      };
    }

    workItemIds = [...new Set(workItemIds)];

    const pulled: { id: number; file: string; revision: number; converted?: string[]; lossy?: string[]; images?: { downloaded: number; reused: number; failed: number } }[] = [];
    const skipped: { id: number; reason: string }[] = [];
    const commentsFiles: { id: number; file: string; count: number }[] = [];
    const filesToCommit: { filePath: string; workItemId: number }[] = [];
    const conversionWarnings: string[] = [];

    await ensureFolderExists(syncConfig.folder);

    for (const workItemId of workItemIds) {
      try {
        let workItem = await this.workItemService.getWorkItem(project, workItemId);

        // Guard: don't overwrite existing files with empty API data
        if (!workItem.id || !workItem.fields || Object.keys(workItem.fields).length === 0) {
          skipped.push({
            id: workItemId,
            reason: 'API returned empty data (no fields). Check authentication - PAT may be expired or unresolved.',
          });
          continue;
        }

        const revision = workItem.rev || workItem._rev || 1;
        let convertedFields: string[] = [];
        let lossyFields: string[] = [];

        // Convert HTML body fields to Markdown IN MEMORY only - never write the
        // conversion back to ADO. The work item in ADO is left exactly as the
        // client authored it (HTML, tables and all); only the local markdown
        // file is converted, so the ADO copy stays the lossless source of truth.
        const workItemType = (workItem.fields?.['System.WorkItemType'] as string) || 'Unknown';
        const bodyRefnames = getAllLargeTextFields(templateBodyRefnamesForType(workItemType));
        const fields = workItem.fields || {};
        const htmlFields = bodyRefnames.filter(
          (refname) => typeof fields[refname] === 'string' && isHtmlContent(fields[refname])
        );

        if (htmlFields.length > 0) {
          if (skipAutoConvert) {
            // Auto-convert disabled: don't convert, and skip this item rather than
            // writing a file with blanked-out HTML fields (preserves prior contract).
            skipped.push({
              id: workItemId,
              reason: `HTML fields: ${htmlFields.join(', ')}. skipAutoConvert=true, skipping.`,
            });
            continue;
          }

          const conversion = convertFieldsToMarkdownInMemory(fields, htmlFields);
          convertedFields = conversion.converted;
          lossyFields = conversion.lossy;

          if (lossyFields.length > 0) {
            conversionWarnings.push(
              `#${workItemId}: ${lossyFields.join(', ')} contained an HTML table - converted to a Markdown pipe table in the local file. ` +
              `Simple tables are faithful; complex tables (merged/styled cells) may lose structure. ADO still holds the original (this pull did NOT modify ADO) - ` +
              `use get-work-item to verify against the original before editing if the table was complex.`
            );
          }
        }

        // Image sync: download ADO attachments, rewrite field srcs to local paths.
        // Mutates workItem.fields in-place so workItemToMarkdown sees the rewritten content.
        let imageStats: { downloaded: number; reused: number; failed: number } | undefined;
        try {
          const imgResult = await pullWorkItemImages(workItem, project, syncConfig.folder, this.workItemService);
          if (imgResult.downloaded || imgResult.reused || imgResult.failed.length) {
            imageStats = {
              downloaded: imgResult.downloaded,
              reused: imgResult.reused,
              failed: imgResult.failed.length,
            };
          }
        } catch (imgError: any) {
          console.error(`Image sync failed for #${workItemId}: ${imgError.message}`);
        }

        const { content: markdown, skippedFields: secondarySkipped } = workItemToMarkdown(workItem, revision);
        const filePath = getWorkItemFilePath(syncConfig.folder, workItemId);
        await writeWorkItemFile(filePath, markdown);

        pulled.push({
          id: workItemId,
          file: filePath,
          revision,
          ...(convertedFields.length > 0 ? { converted: convertedFields } : {}),
          ...(lossyFields.length > 0 ? { lossy: lossyFields } : {}),
          ...(secondarySkipped.length > 0 ? { skippedFields: secondarySkipped } : {}),
          ...(imageStats ? { images: imageStats } : {}),
        });
        filesToCommit.push({ filePath, workItemId });

        if (includeComments) {
          const comments = await this.workItemService.getWorkItemComments(project, workItemId);
          const commentList = comments.comments || [];

          // Rewrite image refs in comment bodies before serialising the file
          try {
            await pullCommentImages(workItemId, commentList, project, syncConfig.folder, this.workItemService);
          } catch (imgError: any) {
            console.error(`Comment image sync failed for #${workItemId}: ${imgError.message}`);
          }

          const commentsMarkdown = commentsToMarkdown(workItem, commentList);
          const commentsPath = getCommentsFilePath(syncConfig.folder, workItemId);
          await writeWorkItemFile(commentsPath, commentsMarkdown);
          commentsFiles.push({
            id: workItemId,
            file: commentsPath,
            count: commentList.length,
          });
          filesToCommit.push({ filePath: commentsPath, workItemId });
        }
      } catch (error: any) {
        skipped.push({ id: workItemId, reason: error.message });
      }
    }

    let committed = false;
    if (syncConfig.autoCommit && filesToCommit.length > 0) {
      const commitResult = await autoCommitMultipleFiles(filesToCommit, 'synced');
      committed = commitResult.committed;
    }

    return {
      pulled,
      skipped,
      ...(conversionWarnings.length > 0 ? { conversionWarnings } : {}),
      ...(includeComments ? { commentsFiles } : {}),
      folder: syncConfig.folder,
      committed,
    };
  }

  async syncWorkItemsFromFile(
    project: string,
    workItemIds: number[],
    folder?: string,
    skipAutoConvert?: boolean,
  ): Promise<any> {
    const syncConfig = getSyncConfig(folder);
    validateFolderPath(syncConfig.folder);

    const pushed: { id: number; oldRevision: number; newRevision: number; fieldsUpdated: string[]; convertedFields?: string[]; images?: { uploaded: number; reused: number; failed: number; pushFailed?: string } }[] = [];
    const partial: { id: number; oldRevision: number; newRevision: number; fieldsUpdated: string[]; skippedFields: string[]; convertedFields?: string[]; images?: { uploaded: number; reused: number; failed: number; pushFailed?: string } }[] = [];
    const created: { id: number; oldFile: string; newFile: string; parentId?: number }[] = [];
    const failed: { id?: number; file?: string; error: string }[] = [];

    // Image pushes fan out per work item. A push that threw used to leave `imageStats`
    // undefined and the item was reported as pushed cleanly, so a push that left every
    // image behind looked identical to a push with no images in it.
    const imagePushes = new FanOutRecorder();

    // Step 1: Auto-detect and process new_*.md files
    const newFiles = await findNewWorkItemFiles(syncConfig.folder);

    for (const filePath of newFiles) {
      try {
        const content = await readFileContent(filePath);
        const parsed = parseNewWorkItemMarkdown(content);

        const parentWorkItem = parsed.frontmatter.parent
          ? await this.workItemService.getWorkItem(project, parsed.frontmatter.parent)
          : undefined;

        const { standardFields, customFields } = buildNewWorkItemFields(parsed, parentWorkItem);

        // Phase 1: Create with standard fields only (custom fields rejected during creation)
        const createdWorkItem = await this.workItemService.createWorkItem(
          project,
          parsed.frontmatter.type || 'User Story',
          standardFields,
          parsed.frontmatter.parent
        );

        const newId = createdWorkItem.id;
        let revision = createdWorkItem.rev || createdWorkItem._rev || 1;
        let customFieldWarning: string | undefined;

        // Phase 2: Set custom fields via follow-up update (MoSCoW, HowToTest, Deployment fields)
        if (Object.keys(customFields).length > 0) {
          try {
            const customOps = Object.entries(customFields).map(([field, value]) => ({
              op: 'add' as const,
              path: `/fields/${field}`,
              value,
            }));
            await this.workItemService.updateWorkItem(project, newId, customOps);
            const finalWorkItem = await this.workItemService.getWorkItem(project, newId);
            revision = finalWorkItem.rev || finalWorkItem._rev || revision;
          } catch (customError: any) {
            // Work item created but custom fields failed - still convert file to prevent
            // duplicate creation on retry. User gets a warning in the result.
            customFieldWarning = `Custom fields failed: ${customError.message}`;
            console.error(`Work item #${newId} created but custom fields update failed:`, customError.message);
          }
        }

        const url = createdWorkItem.url || `https://dev.azure.com/_workitems/edit/${newId}`;

        // Always convert file after successful creation (even if custom fields failed)
        // to prevent duplicate creation on retry
        const syncedContent = convertNewFileToSynced(content, newId, revision, url);

        const newFilePath = getWorkItemFilePath(syncConfig.folder, newId);
        await writeWorkItemFile(newFilePath, syncedContent);
        await renameFile(filePath, filePath + '.created');

        try {
          const fs = await import('node:fs/promises');
          await fs.unlink(filePath + '.created');
        } catch {
          // Ignore cleanup errors
        }

        created.push({
          id: newId,
          oldFile: filePath,
          newFile: newFilePath,
          parentId: parsed.frontmatter.parent,
          ...(customFieldWarning ? { warning: customFieldWarning } : {}),
        });
      } catch (error: any) {
        failed.push({ file: filePath, error: error.message });
      }
    }

    // Step 2: Process existing work items
    const idsToProcess = workItemIds || [];

    for (const workItemId of idsToProcess) {
      const filePath = getWorkItemFilePath(syncConfig.folder, workItemId);

      try {
        if (!await fileExists(filePath)) {
          failed.push({ id: workItemId, error: `File not found: ${filePath}` });
          continue;
        }

        const parsed = await readWorkItemFile(filePath);
        const oldRevision = parsed.frontmatter.lastSyncedRevision;

        const currentWorkItem = await this.workItemService.getWorkItem(project, workItemId);

        // Image push: rewrite local image refs in parsed content.
        //   - Manifest hit → reuse the original ADO URL (no upload).
        //   - New local file → upload, append to manifest, rewrite to new URL.
        let imageStats: { uploaded: number; reused: number; failed: number; pushFailed?: string } | undefined;
        const before = imagePushes.result().failed;
        const imgResult = await imagePushes.run(String(workItemId), 'push images', () =>
          pushWorkItemImages(parsed, workItemId, project, syncConfig.folder, this.workItemService)
        );

        if (imgResult === null) {
          // Recorded on the item as well as in the fan-out, because the per-item entry is
          // what a caller reads when deciding whether this push landed.
          imageStats = {
            uploaded: 0,
            reused: 0,
            failed: 0,
            pushFailed: imagePushes.result().failures[before]?.reason ?? 'unknown',
          };
        } else if (imgResult.uploaded || imgResult.reused || imgResult.failed.length) {
          imageStats = {
            uploaded: imgResult.uploaded,
            reused: imgResult.reused,
            failed: imgResult.failed.length,
          };
        }

        const { operations, skippedFields, convertedFields } = buildPatchOperations(parsed, currentWorkItem, skipAutoConvert);

        if (operations.length === 0 && skippedFields.length === 0) {
          pushed.push({
            id: workItemId,
            oldRevision,
            newRevision: currentWorkItem.rev || currentWorkItem._rev || oldRevision,
            fieldsUpdated: [],
            ...(imageStats ? { images: imageStats } : {}),
          });
          continue;
        }

        let newRevision = oldRevision;
        let fieldsUpdated: string[] = [];
        if (operations.length > 0) {
          const updatedWorkItem = await this.workItemService.updateWorkItem(project, workItemId, operations);
          newRevision = updatedWorkItem.rev || updatedWorkItem._rev || oldRevision + 1;
          fieldsUpdated = operations
            .filter(op => op.path.startsWith('/fields/'))
            .map(op => op.path.replace('/fields/', ''));

          const content = await readFileContent(filePath);
          const updatedContent = updateSyncRevision(content, newRevision);
          await writeWorkItemFile(filePath, updatedContent);
        }

        if (skippedFields.length > 0) {
          partial.push({
            id: workItemId,
            oldRevision,
            newRevision,
            fieldsUpdated,
            skippedFields,
            ...(convertedFields.length > 0 ? { convertedFields } : {}),
            ...(imageStats ? { images: imageStats } : {}),
          });
        } else {
          pushed.push({
            id: workItemId,
            oldRevision,
            newRevision,
            fieldsUpdated,
            ...(convertedFields.length > 0 ? { convertedFields } : {}),
            ...(imageStats ? { images: imageStats } : {}),
          });
        }
      } catch (error: any) {
        failed.push({ id: workItemId, error: error.message });
      }
    }

    return { created, pushed, partial, failed, folder: syncConfig.folder, imagePushes: imagePushes.result() };
  }

  async checkWorkItemMarkdown(project: string, workItemIds: number[]): Promise<any> {
    const results: any[] = [];
    let readyCount = 0;
    let needsConversionCount = 0;

    for (const workItemId of workItemIds) {
      try {
        const workItem = await this.workItemService.getWorkItem(project, workItemId);
        const workItemType = (workItem.fields?.['System.WorkItemType'] as string) || 'Unknown';
        const formats = checkFieldFormats(workItem, templateBodyRefnamesForType(workItemType));

        results.push({
          id: workItemId,
          description: formats.description,
          acceptanceCriteria: formats.acceptanceCriteria,
          reproSteps: formats.reproSteps,
          customBodyFields: formats.additionalFields,
          ready: formats.ready,
          ...(formats.warnings.length > 0 ? { warnings: formats.warnings } : {}),
        });

        if (formats.ready) {
          readyCount++;
        } else {
          needsConversionCount++;
        }
      } catch (error: any) {
        results.push({
          id: workItemId,
          description: 'error',
          acceptanceCriteria: 'error',
          ready: false,
          error: error.message || String(error),
        });
        needsConversionCount++;
      }
    }

    return {
      results,
      summary: {
        ready: readyCount,
        needsConversion: needsConversionCount,
      },
      autoConvertAvailable: true,
      message: needsConversionCount === 0
        ? 'All work items are markdown format - ready to sync'
        : `${needsConversionCount} work item(s) have HTML fields. Will be auto-converted to markdown on sync (unless skipAutoConvert=true).`,
    };
  }

  async listSyncedWorkItems(folder?: string): Promise<any> {
    const syncConfig = getSyncConfig(folder);
    validateFolderPath(syncConfig.folder);

    const { workItems, fanOut } = await listSyncedWorkItems(syncConfig.folder);

    return {
      workItems,
      folder: syncConfig.folder,
      count: workItems.length,
      fanOut,
    };
  }

  async createWorkItemFile(
    project: string,
    parentId: number | undefined,
    workItemType: string,
    folder?: string,
  ): Promise<any> {
    const syncConfig = getSyncConfig(folder);
    validateFolderPath(syncConfig.folder);

    let parentTitle = '';
    if (parentId !== undefined) {
      const parentWorkItem = await this.workItemService.getWorkItem(project, parentId);
      parentTitle = parentWorkItem.fields?.['System.Title'] || '';
    }

    const nextIndex = await findNextNewFileIndex(syncConfig.folder, parentId);
    const filePath = getNewWorkItemFilePath(syncConfig.folder, parentId, nextIndex);

    const template = generateNewWorkItemTemplate(parentId, parentTitle, project, workItemType);

    await ensureFolderExists(syncConfig.folder);
    await writeWorkItemFile(filePath, template);

    const result: Record<string, any> = {
      file: filePath,
      workItemType,
    };
    if (parentId !== undefined) {
      result.parentId = parentId;
      result.parentTitle = parentTitle;
    }
    result.instructions = [
      `1. Edit the file to update title, description, and acceptance criteria`,
      `2. Run sync-work-item-from-file(project: "${project}") to create in ADO`,
      `3. The file will be renamed to {newId}.md after creation`,
    ];

    return result;
  }

  async syncTasksToFile(
    project: string,
    parentIds: number[],
    folder?: string,
    skipAutoConvert?: boolean,
  ): Promise<any> {
    const syncConfig = getSyncConfig(folder);
    validateFolderPath(syncConfig.folder);

    const pulled: { parentId: number; file: string; taskCount: number; tasksUnreadable?: number }[] = [];
    const failed: { parentId: number; error: string }[] = [];
    const filesToCommit: { filePath: string; workItemId: number }[] = [];

    // One recorder across every parent's children. A task that could not be fetched used to
    // be logged to stderr and left out, so both the file and its `taskCount` came back
    // short with nothing to show they had.
    const taskFetches = new FanOutRecorder();

    await ensureFolderExists(syncConfig.folder);

    for (const parentId of parentIds) {
      try {
        const parentWorkItem = await this.workItemService.getWorkItem(project, parentId);

        const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.Parent] = ${parentId} AND [System.WorkItemType] = 'Task' ORDER BY [System.Id] ASC`;
        const queryResult = await this.workItemService.queryWorkItems(project, wiql, 200);

        const tasks: any[] = [];
        const unreadable: { id: string; reason: string }[] = [];

        if (queryResult.workItems && queryResult.workItems.length > 0) {
          for (const wi of queryResult.workItems) {
            const before = taskFetches.result().failed;

            const task = await taskFetches.run(String(wi.id), 'fetch task', async () => {
              const fetched = await this.workItemService.getWorkItem(project, wi.id);

              const description = fetched.fields?.['System.Description'];
              if (description && !skipAutoConvert && isHtmlContent(description)) {
                // Convert in memory only - never write the conversion back to ADO.
                convertFieldsToMarkdownInMemory(fetched.fields, ['System.Description']);
              }

              return fetched;
            });

            if (task !== null) {
              tasks.push(task);
            } else {
              const failure = taskFetches.result().failures[before];
              unreadable.push({ id: String(wi.id), reason: failure?.reason ?? 'unknown' });
            }
          }
        }

        const markdown = tasksToMarkdown(parentWorkItem, tasks, project, unreadable);
        const filePath = getTasksFilePath(syncConfig.folder, parentId);
        await writeWorkItemFile(filePath, markdown);

        pulled.push({
          parentId,
          file: filePath,
          taskCount: tasks.length,
          ...(unreadable.length > 0 ? { tasksUnreadable: unreadable.length } : {}),
        });
        filesToCommit.push({ filePath, workItemId: parentId });
      } catch (error: any) {
        failed.push({ parentId, error: error.message });
      }
    }

    let committed = false;
    if (syncConfig.autoCommit && filesToCommit.length > 0) {
      const commitResult = await autoCommitMultipleFiles(filesToCommit, 'synced tasks for');
      committed = commitResult.committed;
    }

    return { pulled, failed, folder: syncConfig.folder, committed, fanOut: taskFetches.result() };
  }

  async syncTasksFromFile(
    project: string,
    parentIds: number[],
    folder?: string,
    skipAutoConvert?: boolean,
  ): Promise<any> {
    const syncConfig = getSyncConfig(folder);
    validateFolderPath(syncConfig.folder);

    const updated: { id: number; parentId: number; fieldsUpdated: string[]; convertedFields?: string[] }[] = [];
    const created: { id: number; parentId: number; title: string }[] = [];
    const failed: { parentId: number; taskId?: number; error: string }[] = [];

    for (const parentId of parentIds) {
      const filePath = getTasksFilePath(syncConfig.folder, parentId);

      try {
        if (!await fileExists(filePath)) {
          failed.push({ parentId, error: `File not found: ${filePath}` });
          continue;
        }

        const content = await readFileContent(filePath);
        const parsed = parseTasksMarkdown(content);

        const parentWorkItem = await this.workItemService.getWorkItem(project, parentId);
        const parentFields = parentWorkItem.fields || {};
        const areaPath = parentFields['System.AreaPath'];
        const iterationPath = parentFields['System.IterationPath'];

        const createdInThisFile: { title: string; id: number }[] = [];

        for (const task of parsed.tasks) {
          try {
            if (task.id !== null) {
              const currentTask = await this.workItemService.getWorkItem(project, task.id);
              const { operations, fieldsUpdated, convertedFields } = buildTaskPatchOperations(task, currentTask, skipAutoConvert);

              if (operations.length > 0) {
                await this.workItemService.updateWorkItem(project, task.id, operations);
                updated.push({
                  id: task.id,
                  parentId,
                  fieldsUpdated,
                  ...(convertedFields.length > 0 ? { convertedFields } : {}),
                });
              } else {
                updated.push({
                  id: task.id,
                  parentId,
                  fieldsUpdated: [],
                });
              }
            } else {
              if (!task.title) {
                continue;
              }

              const fields = buildNewTaskFields(task, areaPath, iterationPath);
              const createdTask = await this.workItemService.createWorkItem(project, 'Task', fields, parentId);

              created.push({
                id: createdTask.id,
                parentId,
                title: task.title,
              });

              createdInThisFile.push({
                title: task.title,
                id: createdTask.id,
              });
            }
          } catch (taskError: any) {
            failed.push({
              parentId,
              taskId: task.id || undefined,
              error: taskError.message,
            });
          }
        }

        if (createdInThisFile.length > 0) {
          const updatedContent = updateTasksFileAfterCreate(content, createdInThisFile);
          await writeWorkItemFile(filePath, updatedContent);
        }
      } catch (error: any) {
        failed.push({ parentId, error: error.message });
      }
    }

    return { updated, created, failed, folder: syncConfig.folder };
  }
}
