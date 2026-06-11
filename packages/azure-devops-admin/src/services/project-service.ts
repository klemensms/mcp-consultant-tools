/**
 * Project operations for Azure DevOps Admin.
 * Org-scoped: does NOT call validateProject() — projects are the things being managed.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

interface OperationStatus {
  id: string;
  status: string;
  resultMessage?: string;
  _links?: any;
}

export class ProjectService {
  constructor(private client: AdminClient) {}

  async listProjects(
    stateFilter?: string,
    top?: number,
    skip?: number
  ): Promise<any> {
    const params = new URLSearchParams();
    params.set('api-version', this.client.apiVersion);
    if (stateFilter) params.set('stateFilter', stateFilter);
    if (top) params.set('$top', String(top));
    if (skip) params.set('$skip', String(skip));

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `_apis/projects?${params.toString()}`
    );

    return {
      totalCount: response.count ?? response.value.length,
      projects: response.value.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        state: p.state,
        visibility: p.visibility,
        lastUpdateTime: p.lastUpdateTime,
        url: p.url,
      })),
    };
  }

  async getProject(projectId: string): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/projects/${encodeURIComponent(projectId)}?includeCapabilities=true&api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      state: response.state,
      visibility: response.visibility,
      lastUpdateTime: response.lastUpdateTime,
      capabilities: {
        versionControl: response.capabilities?.versioncontrol?.sourceControlType,
        processTemplate: response.capabilities?.processTemplate?.templateName,
      },
    };
  }

  async getProjectProperties(projectId: string): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/projects/${encodeURIComponent(projectId)}/properties?api-version=7.1-preview.1`
    );

    const properties: Record<string, string> = {};
    if (response.value) {
      for (const prop of response.value) {
        properties[prop.name] = prop.value;
      }
    }

    return { projectId, properties };
  }

  async createProject(
    name: string,
    description?: string,
    visibility?: string,
    processTemplate?: string,
    versionControl?: string
  ): Promise<any> {
    const templateId = await this.resolveProcessTemplateId(processTemplate || 'Agile');

    const body = {
      name,
      description: description || '',
      visibility: visibility || 'private',
      capabilities: {
        versioncontrol: {
          sourceControlType: versionControl || 'Git',
        },
        processTemplate: {
          templateTypeId: templateId,
        },
      },
    };

    const operation = await this.client.makeRequest<OperationStatus>(
      `_apis/projects?api-version=${this.client.apiVersion}`,
      'POST',
      body
    );

    const result = await this.pollOperation(operation.id);

    return {
      operationId: operation.id,
      status: result.status,
      name,
      description: description || '',
      visibility: visibility || 'private',
      processTemplate: processTemplate || 'Agile',
      versionControl: versionControl || 'Git',
    };
  }

  async updateProject(
    projectId: string,
    updates: { name?: string; description?: string }
  ): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/projects/${encodeURIComponent(projectId)}?api-version=${this.client.apiVersion}`,
      'PATCH',
      updates,
      undefined,
      'application/json'
    );

    if (response.id && response.status) {
      const result = await this.pollOperation(response.id);
      return { operationId: response.id, status: result.status, projectId, ...updates };
    }

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      projectId,
    };
  }

  async deleteProject(projectId: string): Promise<any> {
    const project = await this.getProject(projectId);

    const operation = await this.client.makeRequest<OperationStatus>(
      `_apis/projects/${project.id}?api-version=${this.client.apiVersion}`,
      'DELETE'
    );

    const result = await this.pollOperation(operation.id);

    return {
      operationId: operation.id,
      status: result.status,
      projectId: project.id,
      projectName: project.name,
      deleted: result.status === 'succeeded',
    };
  }

  private async resolveProcessTemplateId(templateName: string): Promise<string> {
    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `_apis/process/processes?api-version=${this.client.apiVersion}`
    );

    const match = response.value.find(
      (p: any) => p.name.toLowerCase() === templateName.toLowerCase()
    );

    if (!match) {
      const available = response.value.map((p: any) => p.name).join(', ');
      throw new Error(
        `Process template '${templateName}' not found. Available templates: ${available}`
      );
    }

    return match.typeId;
  }

  private async pollOperation(
    operationId: string,
    timeoutMs: number = 60000,
    intervalMs: number = 2000
  ): Promise<OperationStatus> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const op = await this.client.makeRequest<OperationStatus>(
        `_apis/operations/${operationId}?api-version=${this.client.apiVersion}`
      );

      if (op.status === 'succeeded') {
        return op;
      }
      if (op.status === 'failed' || op.status === 'cancelled') {
        throw new Error(
          `Operation ${operationId} ${op.status}: ${op.resultMessage || 'no details'}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Operation ${operationId} timed out after ${timeoutMs / 1000}s`);
  }
}
