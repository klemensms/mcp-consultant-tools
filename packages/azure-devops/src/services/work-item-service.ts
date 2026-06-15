/**
 * Work Item Service - Azure DevOps work item operations
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { marked } from 'marked';
import { resolveSafePath, assertNoTraversal, safeBasename } from '@mcp-consultant-tools/core';
import type {
  PiiProtectionPipeline,
  PipelineReport,
} from '@mcp-consultant-tools/core';
import { getAllLargeTextFields } from '../sync/html-detection.js';
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';

export class WorkItemService {
  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly piiPipeline?: PiiProtectionPipeline
  ) {}

  private redact<T>(data: T): { data: T; piiReport?: PipelineReport } {
    if (!this.piiPipeline?.isEnabled) return { data };
    const r = this.piiPipeline.redactResponse('workitem', data);
    return { data: r.data, piiReport: r.report };
  }

  private static readonly SUMMARY_FIELDS = [
    'System.Id',
    'System.Title',
    'System.AssignedTo',
    'System.State',
    'Microsoft.VSTS.Common.Severity',
    'Microsoft.VSTS.Common.Priority',
    'System.Tags',
    'Microsoft.VSTS.Scheduling.StoryPoints',
    'Microsoft.VSTS.Common.ResolvedReason',
    'System.WorkItemType',
  ];

  async getWorkItem(project: string, workItemId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<any>(
      `${project}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=${this.client.apiVersion}`
    );

    const shaped = {
      id: response.id,
      rev: response.rev,
      url: response.url,
      fields: response.fields || {},
      relations: response.relations || [],
      _links: response._links,
      commentVersionRef: response.commentVersionRef,
      project
    };
    const { data, piiReport } = this.redact(shaped);
    return piiReport ? { ...data, piiReport } : data;
  }

  async queryWorkItems(project: string, wiql: string, maxResults: number = 200): Promise<any> {
    this.client.validateProject(project);

    const queryResult = await this.client.post<any>(
      `${project}/_apis/wit/wiql?api-version=${this.client.apiVersion}`,
      { query: wiql }
    );

    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      return {
        query: wiql,
        project,
        totalCount: 0,
        workItems: []
      };
    }

    const workItemIds = queryResult.workItems
      .slice(0, maxResults)
      .map((wi: any) => wi.id);

    const workItems = await this.client.post<AdoApiCollectionResponse<any>>(
      `${project}/_apis/wit/workitemsbatch?api-version=${this.client.apiVersion}`,
      {
        ids: workItemIds,
        $expand: 'all'
      }
    );

    const shaped = {
      query: wiql,
      project,
      totalCount: workItems.value.length,
      workItems: workItems.value
    };
    const { data, piiReport } = this.redact(shaped);
    return piiReport ? { ...data, piiReport } : data;
  }

  async runSavedQuery(
    project: string,
    queryId: string,
    maxResults: number = 50,
    detail: 'summary' | 'full' = 'summary',
    fields?: string[],
    groupBy?: string,
  ): Promise<any> {
    this.client.validateProject(project);

    const queryResult = await this.client.get<any>(
      `${project}/_apis/wit/wiql/${queryId}?api-version=${this.client.apiVersion}`
    );

    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      return {
        queryId,
        project,
        totalCount: 0,
        queriedCount: queryResult.workItems?.length ?? 0,
        workItems: [],
      };
    }

    const totalAvailable = queryResult.workItems.length;
    const workItemIds = queryResult.workItems
      .slice(0, maxResults)
      .map((wi: any) => wi.id);

    const isFull = detail === 'full';
    const requestedFields = fields ?? (isFull ? undefined : WorkItemService.SUMMARY_FIELDS);

    const body: any = { ids: workItemIds };
    if (requestedFields) {
      body.fields = requestedFields;
    } else {
      body.$expand = 'all';
    }

    const workItems = await this.client.post<AdoApiCollectionResponse<any>>(
      `${project}/_apis/wit/workitemsbatch?api-version=${this.client.apiVersion}`,
      body
    );

    const items = workItems.value.map((wi: any) => {
      if (isFull && !fields) return wi;
      const f = wi.fields || {};
      return {
        id: wi.id,
        type: f['System.WorkItemType'],
        title: f['System.Title'],
        assignedTo: f['System.AssignedTo']?.displayName ?? f['System.AssignedTo'] ?? null,
        state: f['System.State'],
        severity: f['Microsoft.VSTS.Common.Severity'] ?? null,
        priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
        tags: f['System.Tags'] ?? null,
        storyPoints: f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? null,
        resolvedReason: f['Microsoft.VSTS.Common.ResolvedReason'] ?? null,
        ...(fields ? Object.fromEntries(
          Object.entries(f).filter(([k]) => !WorkItemService.SUMMARY_FIELDS.includes(k))
        ) : {}),
      };
    });

    const result: any = {
      queryId,
      project,
      totalAvailable,
      returnedCount: items.length,
      detail,
    };

    if (groupBy) {
      const groups: Record<string, any[]> = {};
      for (const item of items) {
        const key = (item as any)[groupBy] ?? (item as any).state ?? 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
      result.groupedBy = groupBy;
      result.groups = Object.fromEntries(
        Object.entries(groups).map(([k, v]) => [k, { count: v.length, items: v }])
      );
    } else {
      result.workItems = items;
    }

    return result;
  }

  async getSavedQuery(project: string, queryId: string): Promise<any> {
    this.client.validateProject(project);

    return this.client.get<any>(
      `${project}/_apis/wit/queries/${queryId}?api-version=${this.client.apiVersion}`
    );
  }

  async getWorkItemComments(project: string, workItemId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<any>(
      `${project}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview`
    );

    const comments = response.comments || response.value || [];

    return {
      workItemId,
      project,
      totalCount: response.totalCount ?? comments.length,
      comments: comments.map((comment: any) => ({
        id: comment.id,
        text: comment.text,
        createdBy: comment.createdBy?.displayName,
        createdDate: comment.createdDate,
        modifiedBy: comment.modifiedBy?.displayName,
        modifiedDate: comment.modifiedDate,
        url: comment.url
      }))
    };
  }

  async addWorkItemComment(project: string, workItemId: number, commentText: string): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    let finalText = commentText;
    const format = this.client.config.commentFormat || 'markdown';
    if (format === 'html') {
      finalText = await marked.parse(commentText);
    }

    const response = await this.client.post<any>(
      `${project}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview`,
      { text: finalText }
    );

    const shaped = {
      id: response.id,
      workItemId,
      project,
      text: response.text,
      format: format,
      createdBy: response.createdBy?.displayName,
      createdDate: response.createdDate
    };
    const { data, piiReport } = this.redact(shaped);
    return piiReport ? { ...data, piiReport } : data;
  }

  async updateWorkItemComment(project: string, workItemId: number, commentId: number, commentText: string): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    let finalText = commentText;
    const format = this.client.config.commentFormat || 'markdown';
    if (format === 'html') {
      finalText = await marked.parse(commentText);
    }

    const response = await this.client.patch<any>(
      `${project}/_apis/wit/workItems/${workItemId}/comments/${commentId}?api-version=7.1-preview`,
      { text: finalText },
      { 'Content-Type': 'application/json' }
    );

    const shaped = {
      id: response.id,
      workItemId,
      project,
      text: response.text,
      format: format,
      modifiedBy: response.modifiedBy?.displayName,
      modifiedDate: response.modifiedDate
    };
    const { data, piiReport } = this.redact(shaped);
    return piiReport ? { ...data, piiReport } : data;
  }

  async updateWorkItem(project: string, workItemId: number, patchOperations: any[]): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    const response = await this.client.patch<any>(
      `${project}/_apis/wit/workitems/${workItemId}?api-version=${this.client.apiVersion}`,
      patchOperations
    );

    const shaped = {
      id: response.id,
      rev: response.rev,
      fields: response.fields || {},
      project
    };
    const { data, piiReport } = this.redact(shaped);
    return piiReport ? { ...data, piiReport } : data;
  }

  async setFieldsToMarkdownFormat(
    project: string,
    workItemId: number,
    fields: string[]
  ): Promise<void> {
    if (!this.client.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    const patchOperations = fields.map(field => ({
      op: 'add',
      path: `/multilineFieldsFormat/${field}`,
      value: 'Markdown'
    }));

    await this.updateWorkItem(project, workItemId, patchOperations);
  }

  async createWorkItem(
    project: string,
    workItemType: string,
    fields: any,
    parentId?: number,
    relations?: Array<{
      rel: string;
      url: string;
      attributes?: Record<string, any>;
    }>
  ): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    const patchOperations: any[] = [];

    Object.keys(fields).forEach(field => {
      patchOperations.push({
        op: 'add',
        path: `/fields/${field}`,
        value: fields[field]
      });
    });

    const allLargeTextFields = getAllLargeTextFields();
    for (const field of allLargeTextFields) {
      if (fields[field] !== undefined) {
        patchOperations.push({
          op: 'add',
          path: `/multilineFieldsFormat/${field}`,
          value: 'Markdown'
        });
      }
    }

    if (parentId !== undefined) {
      const parentUrl = `${this.client.baseUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${parentId}`;
      patchOperations.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: parentUrl
        }
      });
    }

    if (relations && relations.length > 0) {
      relations.forEach(relation => {
        patchOperations.push({
          op: 'add',
          path: '/relations/-',
          value: relation
        });
      });
    }

    const encodedType = encodeURIComponent(workItemType);
    const response = await this.client.patch<any>(
      `${project}/_apis/wit/workitems/$${encodedType}?api-version=${this.client.apiVersion}`,
      patchOperations
    );

    const shaped = {
      id: response.id,
      rev: response.rev,
      fields: response.fields || {},
      relations: response.relations || [],
      url: response._links?.html?.href,
      project
    };
    const { data, piiReport } = this.redact(shaped);
    return piiReport ? { ...data, piiReport } : data;
  }

  // ==================== WORK ITEM ATTACHMENT OPERATIONS ====================

  /**
   * Download a work item attachment by its GUID and write it to disk.
   *
   * The endpoint `_apis/wit/attachments/{guid}?download=true` returns the raw
   * binary content. We write it to `{outputDir}/{filename}`.
   */
  async downloadAttachment(
    project: string,
    attachmentGuid: string,
    urlFileName: string,
    outputDir: string,
    outputFileName?: string,
  ): Promise<{ filePath: string; fileName: string; size: number; guid: string }> {
    this.client.validateProject(project);

    const response = await this.client.requestRaw(
      `${project}/_apis/wit/attachments/${attachmentGuid}?fileName=${encodeURIComponent(urlFileName)}&download=true&api-version=${this.client.apiVersion}`,
      'GET',
      undefined,
      undefined,
      'arraybuffer'
    );

    // Confine the destination directory and collapse the filename to a bare
    // basename — `urlFileName` comes from the attachment's own (untrusted)
    // name, so `path.join` alone would let a crafted "../../x" name escape.
    const safeDir = resolveSafePath(outputDir);
    fs.mkdirSync(safeDir, { recursive: true });
    const localName = safeBasename(outputFileName ?? urlFileName);
    const filePath = path.join(safeDir, localName);
    fs.writeFileSync(filePath, Buffer.from(response.data));

    return {
      filePath,
      fileName: localName,
      size: response.data.byteLength,
      guid: attachmentGuid,
    };
  }

  /**
   * Upload a local file as a work item attachment.
   *
   * The endpoint `_apis/wit/attachments?fileName={name}&uploadType=simple`
   * accepts the raw file bytes (octet-stream) and returns the attachment URL
   * which can be embedded in HTML fields as `<img src="...">`.
   */
  async uploadAttachment(
    project: string,
    filePath: string,
    fileName?: string,
  ): Promise<{ id: string; url: string; fileName: string; size: number }> {
    this.client.validateProject(project);

    if (!this.client.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    assertNoTraversal(filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Attachment file not found: ${filePath}`);
    }

    const data = fs.readFileSync(filePath);
    const finalName = fileName || path.basename(filePath);

    const response = await this.client.requestRaw(
      `${project}/_apis/wit/attachments?fileName=${encodeURIComponent(finalName)}&uploadType=simple&api-version=${this.client.apiVersion}`,
      'POST',
      data,
      { 'Content-Type': 'application/octet-stream' }
    );

    return {
      id: response.data.id,
      url: response.data.url,
      fileName: finalName,
      size: data.byteLength,
    };
  }

  async deleteWorkItem(project: string, workItemId: number): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWorkItemDelete) {
      throw new Error('Work item delete operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true to enable.');
    }

    await this.client.del<any>(
      `${project}/_apis/wit/workitems/${workItemId}?api-version=${this.client.apiVersion}`
    );

    return {
      workItemId,
      project,
      deleted: true
    };
  }
}
