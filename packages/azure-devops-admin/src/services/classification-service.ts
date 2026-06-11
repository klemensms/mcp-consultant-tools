/**
 * Classification node operations (iterations & areas) for Azure DevOps Admin.
 */
import type { AdminClient } from './admin-client.js';

export class ClassificationService {
  constructor(private client: AdminClient) {}

  private flattenClassificationNodes(node: any, parentPath: string = ''): any[] {
    const result: any[] = [];
    const currentPath = parentPath ? `${parentPath}\\${node.name}` : node.name;

    result.push({
      id: node.id,
      identifier: node.identifier,
      name: node.name,
      path: currentPath,
      structureType: node.structureType,
      hasChildren: node.hasChildren || false,
      attributes: node.attributes || {},
      url: node.url
    });

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        result.push(...this.flattenClassificationNodes(child, currentPath));
      }
    }

    return result;
  }

  async listClassificationNodes(
    project: string,
    structureType: 'iterations' | 'areas',
    depth: number = 10
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/wit/classificationnodes/${structureType}?$depth=${depth}&api-version=${this.client.apiVersion}`
    );

    const nodes = this.flattenClassificationNodes(response);

    return {
      project,
      structureType,
      totalCount: nodes.length,
      nodes: nodes.map((node: any) => ({
        id: node.id,
        identifier: node.identifier,
        name: node.name,
        path: node.path,
        hasChildren: node.hasChildren,
        ...(structureType === 'iterations' && node.attributes ? {
          startDate: node.attributes.startDate,
          finishDate: node.attributes.finishDate,
          timeFrame: node.attributes.timeFrame
        } : {})
      }))
    };
  }

  async getClassificationNode(
    project: string,
    structureType: 'iterations' | 'areas',
    path: string
  ): Promise<any> {
    this.client.validateProject(project);

    const cleanPath = path.replace(/^\\/, '').replace(/\\/g, '/');
    const encodedPath = encodeURIComponent(cleanPath).replace(/%2F/g, '/');

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/wit/classificationnodes/${structureType}/${encodedPath}?api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      identifier: response.identifier,
      name: response.name,
      structureType: response.structureType,
      hasChildren: response.hasChildren || false,
      path: response.path,
      project,
      ...(structureType === 'iterations' && response.attributes ? {
        startDate: response.attributes.startDate,
        finishDate: response.attributes.finishDate,
        timeFrame: response.attributes.timeFrame
      } : {}),
      url: response.url
    };
  }

  async createClassificationNode(
    project: string,
    structureType: 'iterations' | 'areas',
    name: string,
    parentPath?: string,
    attributes?: { startDate?: string; finishDate?: string }
  ): Promise<any> {
    this.client.validateProject(project);

    const body: any = { name };

    if (structureType === 'iterations' && attributes) {
      body.attributes = {};
      if (attributes.startDate) body.attributes.startDate = this.client.formatDateForAdo(attributes.startDate);
      if (attributes.finishDate) body.attributes.finishDate = this.client.formatDateForAdo(attributes.finishDate);
    }

    let endpoint = `${project}/_apis/wit/classificationnodes/${structureType}`;
    if (parentPath) {
      const cleanPath = parentPath.replace(/^\\/, '').replace(/\\/g, '/');
      const encodedPath = encodeURIComponent(cleanPath).replace(/%2F/g, '/');
      endpoint = `${project}/_apis/wit/classificationnodes/${structureType}/${encodedPath}`;
    }

    const response = await this.client.makeRequest<any>(
      `${endpoint}?api-version=${this.client.apiVersion}`,
      'POST',
      body
    );

    return {
      id: response.id,
      identifier: response.identifier,
      name: response.name,
      path: response.path,
      structureType,
      project,
      ...(structureType === 'iterations' && response.attributes ? {
        startDate: response.attributes.startDate,
        finishDate: response.attributes.finishDate
      } : {}),
      url: response.url
    };
  }

  async addIterationToTeam(
    project: string,
    team: string,
    iterationId: string
  ): Promise<any> {
    this.client.validateProject(project);

    const encodedTeam = encodeURIComponent(team);
    const endpoint = `${project}/${encodedTeam}/_apis/work/teamsettings/iterations?api-version=${this.client.apiVersion}`;

    const response = await this.client.makeRequest<any>(endpoint, 'POST', { id: iterationId });

    return {
      id: response.id,
      name: response.name,
      path: response.path,
      url: response.url,
      attributes: response.attributes ? {
        startDate: response.attributes.startDate,
        finishDate: response.attributes.finishDate,
        timeFrame: response.attributes.timeFrame,
      } : undefined,
    };
  }

  async updateClassificationNode(
    project: string,
    structureType: 'iterations' | 'areas',
    path: string,
    updates: { name?: string; startDate?: string; finishDate?: string }
  ): Promise<any> {
    this.client.validateProject(project);

    const cleanPath = path.replace(/^\\/, '').replace(/\\/g, '/');
    const encodedPath = encodeURIComponent(cleanPath).replace(/%2F/g, '/');

    const body: any = {};
    if (updates.name) body.name = updates.name;

    if (structureType === 'iterations') {
      if (updates.startDate !== undefined || updates.finishDate !== undefined) {
        body.attributes = {};
        if (updates.startDate !== undefined) body.attributes.startDate = this.client.formatDateForAdo(updates.startDate);
        if (updates.finishDate !== undefined) body.attributes.finishDate = this.client.formatDateForAdo(updates.finishDate);
      }
    }

    // Classification Nodes API uses regular JSON, not JSON Patch format
    const response = await this.client.makeRequest<any>(
      `${project}/_apis/wit/classificationnodes/${structureType}/${encodedPath}?api-version=${this.client.apiVersion}`,
      'PATCH',
      body,
      undefined,
      'application/json'
    );

    return {
      id: response.id,
      identifier: response.identifier,
      name: response.name,
      path: response.path,
      structureType,
      project,
      ...(structureType === 'iterations' && response.attributes ? {
        startDate: response.attributes.startDate,
        finishDate: response.attributes.finishDate
      } : {}),
      url: response.url
    };
  }

  async deleteClassificationNode(
    project: string,
    structureType: 'iterations' | 'areas',
    path: string,
    reclassifyId: number
  ): Promise<any> {
    this.client.validateProject(project);

    const cleanPath = path.replace(/^\\/, '').replace(/\\/g, '/');
    const encodedPath = encodeURIComponent(cleanPath).replace(/%2F/g, '/');

    await this.client.makeRequest<any>(
      `${project}/_apis/wit/classificationnodes/${structureType}/${encodedPath}?$reclassifyId=${reclassifyId}&api-version=${this.client.apiVersion}`,
      'DELETE'
    );

    return {
      path,
      structureType,
      project,
      reclassifyId,
      deleted: true
    };
  }
}
