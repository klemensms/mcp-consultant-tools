/**
 * Checklist Service - Read/write operations for the mohitbagra/workitem-checklist extension.
 *
 * Uses the Azure DevOps Extension Data Service REST API (extmgmt.dev.azure.com).
 * Data is stored in extension-scoped collections, NOT in work item fields.
 *
 * Collections:
 * - DefaultCheckList: Per-work-item state overrides (org-level)
 * - dcwit_{projectId}: Per-work-item-type default templates (org-level)
 * - CheckListItems: Custom shared/personal checklist items
 */
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { WorkItemService } from './work-item-service.js';
import type {
  IChecklist,
  IChecklistItem,
  ChecklistItemState,
  MergedChecklist,
  MergedChecklistItem,
  ChecklistTemplateSummary,
  ChecklistReport,
  ChecklistReportEntry,
} from '../models/index.js';

const EXTENSION_PUBLISHER = 'mohitbagra';
const EXTENSION_ID = 'workitem-checklist';
const API_VERSION = '7.1-preview.1';

export class ChecklistService {
  private projectIdCache = new Map<string, string>();

  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly workItemService: WorkItemService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private extPath(collection: string, scope: 'Default' | 'User/Me' = 'Default'): string {
    return `_apis/ExtensionManagement/InstalledExtensions/${EXTENSION_PUBLISHER}/${EXTENSION_ID}/Data/Scopes/${scope}/Current/Collections/${collection}`;
  }

  private async resolveProjectId(project: string): Promise<string> {
    const cached = this.projectIdCache.get(project);
    if (cached) return cached;

    const resp = await this.client.get<{ id: string }>(
      `_apis/projects/${encodeURIComponent(project)}?api-version=${this.client.apiVersion}`
    );
    this.projectIdCache.set(project, resp.id);
    return resp.id;
  }

  private async templateCollection(project: string): Promise<string> {
    const projectId = await this.resolveProjectId(project);
    return `dcwit_${projectId}`;
  }

  private async getDocument(collection: string, documentId: string): Promise<IChecklist | null> {
    try {
      return await this.client.extRequest<IChecklist>(
        `${this.extPath(collection)}/Documents/${encodeURIComponent(documentId)}?api-version=${API_VERSION}`
      );
    } catch (error: any) {
      if (error.message?.includes('not found')) return null;
      throw error;
    }
  }

  private async listDocuments(collection: string): Promise<IChecklist[]> {
    try {
      const resp = await this.client.extRequest<{ value: IChecklist[] } | IChecklist[]>(
        `${this.extPath(collection)}/Documents?api-version=${API_VERSION}`
      );
      return Array.isArray(resp) ? resp : (resp.value ?? []);
    } catch (error: any) {
      if (error.message?.includes('not found')) return [];
      throw error;
    }
  }

  private async upsertDocument(collection: string, doc: IChecklist): Promise<IChecklist> {
    return this.client.extRequest<IChecklist>(
      `${this.extPath(collection)}/Documents?api-version=${API_VERSION}`,
      'PUT',
      { ...doc, __etag: -1 }
    );
  }

  private async deleteDocument(collection: string, documentId: string): Promise<boolean> {
    try {
      await this.client.extRequest<void>(
        `${this.extPath(collection)}/Documents/${encodeURIComponent(documentId)}?api-version=${API_VERSION}`,
        'DELETE'
      );
      return true;
    } catch (error: any) {
      if (error.message?.includes('not found')) return false;
      throw error;
    }
  }

  private mergeItems(
    templateItems: IChecklistItem[],
    overrideItems: IChecklistItem[],
  ): MergedChecklistItem[] {
    const overrideMap = new Map<string, IChecklistItem>();
    for (const item of overrideItems) {
      overrideMap.set(item.id.toLowerCase(), item);
    }

    const merged: MergedChecklistItem[] = templateItems.map(tItem => {
      const override = overrideMap.get(tItem.id.toLowerCase());
      return {
        id: tItem.id,
        text: tItem.text,
        required: tItem.required ?? true,
        state: override?.state ?? 'New' as ChecklistItemState,
        completedBy: override?.completedBy,
        completedDate: override?.completedDate,
        labels: tItem.labels,
        isTemplateItem: true,
      };
    });

    const templateIds = new Set(templateItems.map(t => t.id.toLowerCase()));
    for (const oItem of overrideItems) {
      if (!templateIds.has(oItem.id.toLowerCase())) {
        merged.push({
          ...oItem,
          required: oItem.required ?? false,
          isTemplateItem: false,
        });
      }
    }

    return merged;
  }

  private checkWriteEnabled(): void {
    if (!this.client.config.enableWorkItemWrite) {
      throw new Error(
        'Checklist write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.'
      );
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async getChecklist(project: string, workItemId: number): Promise<MergedChecklist> {
    this.client.validateProject(project);

    const wi = await this.workItemService.getWorkItem(project, workItemId);
    if (!wi.fields || !wi.fields['System.WorkItemType']) {
      throw new Error(`Work item #${workItemId} returned no fields. The API response may be empty - check authentication.`);
    }
    const workItemType = wi.fields['System.WorkItemType'];

    const templateCollectionName = await this.templateCollection(project);
    const template = await this.getDocument(templateCollectionName, workItemType);
    const templateItems = template?.checklistItems ?? [];

    const overrides = await this.getDocument('DefaultCheckList', String(workItemId));
    const overrideItems = overrides?.checklistItems ?? [];

    const sharedCustom = await this.getDocument('CheckListItems', String(workItemId));
    const sharedCustomItems = sharedCustom?.checklistItems ?? [];

    const merged = this.mergeItems(templateItems, overrideItems);

    for (const item of sharedCustomItems) {
      if (!merged.some(m => m.id.toLowerCase() === item.id.toLowerCase())) {
        merged.push({
          ...item,
          required: item.required ?? false,
          isTemplateItem: false,
        });
      }
    }

    const completedCount = merged.filter(i => i.state === 'Completed').length;

    return {
      workItemId,
      workItemType,
      project,
      templateItemCount: templateItems.length,
      completedCount,
      totalCount: merged.length,
      completionPercent: merged.length > 0 ? Math.round((completedCount / merged.length) * 100) : 100,
      items: merged,
    };
  }

  async getTemplate(project: string, workItemType: string): Promise<IChecklist | null> {
    this.client.validateProject(project);
    const collection = await this.templateCollection(project);
    return this.getDocument(collection, workItemType);
  }

  async listTemplates(project: string): Promise<ChecklistTemplateSummary[]> {
    this.client.validateProject(project);
    const collection = await this.templateCollection(project);
    const docs = await this.listDocuments(collection);

    return docs.map(doc => ({
      workItemType: doc.id,
      itemCount: doc.checklistItems.length,
      requiredCount: doc.checklistItems.filter(i => i.required !== false).length,
    }));
  }

  async updateItemState(
    project: string,
    workItemId: number,
    itemId: string,
    state: ChecklistItemState,
    completedByDisplayName?: string,
  ): Promise<MergedChecklist> {
    this.client.validateProject(project);
    this.checkWriteEnabled();

    const overrides = await this.getDocument('DefaultCheckList', String(workItemId));
    const items = overrides?.checklistItems ? [...overrides.checklistItems] : [];

    const idx = items.findIndex(i => i.id.toLowerCase() === itemId.toLowerCase());

    const updatedItem: IChecklistItem = {
      id: itemId,
      text: idx >= 0 ? items[idx].text : '',
      required: idx >= 0 ? items[idx].required : undefined,
      state,
      completedBy: state === 'Completed' ? {
        displayName: completedByDisplayName || 'MCP Automation',
      } : undefined,
      completedDate: state === 'Completed' ? new Date().toISOString() : undefined,
    };

    if (idx >= 0) {
      items[idx] = updatedItem;
    } else {
      items.push(updatedItem);
    }

    await this.upsertDocument('DefaultCheckList', {
      id: String(workItemId),
      checklistItems: items,
    });

    return this.getChecklist(project, workItemId);
  }

  async addItem(
    project: string,
    workItemId: number,
    text: string,
    required: boolean = false,
  ): Promise<MergedChecklist> {
    this.client.validateProject(project);
    this.checkWriteEnabled();

    if (text.length > 128) {
      throw new Error(`Checklist item text exceeds 128 character limit (${text.length} chars).`);
    }

    const existing = await this.getDocument('CheckListItems', String(workItemId));
    const items = existing?.checklistItems ? [...existing.checklistItems] : [];

    items.push({
      id: Date.now().toString(),
      text,
      required,
      state: 'New' as ChecklistItemState,
    });

    await this.upsertDocument('CheckListItems', {
      id: String(workItemId),
      checklistItems: items,
    });

    return this.getChecklist(project, workItemId);
  }

  async removeItem(
    project: string,
    workItemId: number,
    itemId: string,
  ): Promise<MergedChecklist> {
    this.client.validateProject(project);
    this.checkWriteEnabled();

    const existing = await this.getDocument('CheckListItems', String(workItemId));
    if (!existing) {
      throw new Error(`No custom checklist items found for work item ${workItemId}.`);
    }

    const filtered = existing.checklistItems.filter(
      i => i.id.toLowerCase() !== itemId.toLowerCase()
    );

    if (filtered.length === existing.checklistItems.length) {
      throw new Error(`Checklist item '${itemId}' not found in custom items for work item ${workItemId}.`);
    }

    if (filtered.length === 0) {
      await this.deleteDocument('CheckListItems', String(workItemId));
    } else {
      await this.upsertDocument('CheckListItems', {
        id: String(workItemId),
        checklistItems: filtered,
      });
    }

    return this.getChecklist(project, workItemId);
  }

  async updateTemplate(
    project: string,
    workItemType: string,
    items: Array<{ text: string; required?: boolean; labels?: string[] }>,
  ): Promise<IChecklist> {
    this.client.validateProject(project);
    this.checkWriteEnabled();

    for (const item of items) {
      if (item.text.length > 128) {
        throw new Error(`Checklist item text exceeds 128 character limit: "${item.text.substring(0, 50)}..."`);
      }
    }

    const collection = await this.templateCollection(project);

    const existing = await this.getDocument(collection, workItemType);
    const existingMap = new Map<string, string>();
    if (existing) {
      for (const item of existing.checklistItems) {
        existingMap.set(item.text.toLowerCase(), item.id);
      }
    }

    const checklistItems: IChecklistItem[] = items.map(item => ({
      id: existingMap.get(item.text.toLowerCase()) || Date.now().toString() + Math.random().toString(36).slice(2, 6),
      text: item.text,
      required: item.required ?? true,
      state: 'New' as ChecklistItemState,
      labels: item.labels,
    }));

    const doc: IChecklist = {
      id: workItemType,
      checklistItems,
    };

    return this.upsertDocument(collection, doc);
  }

  async getReport(
    project: string,
    workItemType?: string,
    workItemState?: string,
    maxResults: number = 200,
  ): Promise<ChecklistReport> {
    this.client.validateProject(project);

    const conditions = [`[System.TeamProject] = '${project}'`];
    if (workItemType) {
      conditions.push(`[System.WorkItemType] = '${workItemType}'`);
    }
    if (workItemState) {
      conditions.push(`[System.State] = '${workItemState}'`);
    }

    const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;

    const queryResult = await this.workItemService.queryWorkItems(project, wiql, maxResults);
    const workItems: any[] = queryResult.workItems || [];

    if (workItems.length === 0) {
      return {
        project,
        workItemType: workItemType || null,
        workItemState: workItemState || null,
        totalWorkItems: 0,
        fullyComplete: 0,
        partiallyComplete: 0,
        notStarted: 0,
        entries: [],
      };
    }

    const overrideDocs = await this.listDocuments('DefaultCheckList');
    const overrideMap = new Map<string, IChecklist>();
    for (const doc of overrideDocs) {
      overrideMap.set(doc.id, doc);
    }

    const templateCache = new Map<string, IChecklistItem[]>();

    const entries: ChecklistReportEntry[] = [];

    for (const wi of workItems) {
      const wiType = wi.fields?.['System.WorkItemType'] ?? wi.type;
      const wiId = wi.id;

      if (!templateCache.has(wiType)) {
        const tmpl = await this.getTemplate(project, wiType);
        templateCache.set(wiType, tmpl?.checklistItems ?? []);
      }
      const templateItems = templateCache.get(wiType)!;

      if (templateItems.length === 0) continue;

      const overrideDoc = overrideMap.get(String(wiId));
      const overrideItems = overrideDoc?.checklistItems ?? [];
      const merged = this.mergeItems(templateItems, overrideItems);

      const completedCount = merged.filter(i => i.state === 'Completed').length;
      const incompleteRequired = merged.filter(
        i => i.state !== 'Completed' && i.required
      ).length;
      const incompleteItems = merged
        .filter(i => i.state !== 'Completed')
        .map(i => `[${i.state}] ${i.text}`);

      entries.push({
        workItemId: wiId,
        title: wi.fields?.['System.Title'] ?? wi.title ?? '',
        state: wi.fields?.['System.State'] ?? wi.state ?? '',
        assignedTo: wi.fields?.['System.AssignedTo']?.displayName
          ?? wi.fields?.['System.AssignedTo']
          ?? wi.assignedTo
          ?? null,
        workItemType: wiType,
        totalItems: merged.length,
        completedItems: completedCount,
        completionPercent: Math.round((completedCount / merged.length) * 100),
        incompleteRequired,
        incompleteItems,
      });
    }

    entries.sort((a, b) => a.completionPercent - b.completionPercent);

    const fullyComplete = entries.filter(e => e.completionPercent === 100).length;
    const notStarted = entries.filter(e => e.completedItems === 0).length;

    return {
      project,
      workItemType: workItemType || null,
      workItemState: workItemState || null,
      totalWorkItems: entries.length,
      fullyComplete,
      partiallyComplete: entries.length - fullyComplete - notStarted,
      notStarted,
      entries,
    };
  }
}
