/**
 * Service connection operations for Azure DevOps Admin.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

export class ServiceConnectionService {
  constructor(private client: AdminClient) {}

  async listServiceConnections(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/serviceendpoint/endpoints?api-version=${this.client.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      serviceConnections: response.value.map((conn: any) => ({
        id: conn.id,
        name: conn.name,
        type: conn.type,
        url: conn.url,
        description: conn.description,
        isShared: conn.isShared,
        isReady: conn.isReady,
        owner: conn.owner,
        createdBy: conn.createdBy?.displayName,
        authorization: conn.authorization ? {
          scheme: conn.authorization.scheme,
          parameters: conn.authorization.parameters ?
            Object.keys(conn.authorization.parameters).reduce((acc: any, key: string) => {
              acc[key] = key.toLowerCase().includes('password') ||
                         key.toLowerCase().includes('secret') ||
                         key.toLowerCase().includes('key') ||
                         key.toLowerCase().includes('token')
                ? '***SECRET***'
                : conn.authorization.parameters[key];
              return acc;
            }, {}) : {}
        } : null
      }))
    };
  }

  async getServiceConnection(project: string, connectionId: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/serviceendpoint/endpoints/${connectionId}?api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      type: response.type,
      url: response.url,
      description: response.description,
      isShared: response.isShared,
      isReady: response.isReady,
      owner: response.owner,
      createdBy: response.createdBy?.displayName,
      project,
      authorization: response.authorization ? {
        scheme: response.authorization.scheme,
        parameters: response.authorization.parameters ?
          Object.keys(response.authorization.parameters).reduce((acc: any, key: string) => {
            acc[key] = key.toLowerCase().includes('password') ||
                       key.toLowerCase().includes('secret') ||
                       key.toLowerCase().includes('key') ||
                       key.toLowerCase().includes('token')
              ? '***SECRET***'
              : response.authorization.parameters[key];
            return acc;
          }, {}) : {}
      } : null,
      data: response.data || {},
      serviceEndpointProjectReferences: response.serviceEndpointProjectReferences
    };
  }

  async getServiceConnectionTypes(): Promise<any> {
    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `_apis/serviceendpoint/types?api-version=${this.client.apiVersion}`
    );

    return {
      totalCount: response.value.length,
      types: response.value.map((type: any) => ({
        name: type.name,
        displayName: type.displayName,
        description: type.description,
        helpMarkDown: type.helpMarkDown,
        authenticationSchemes: type.authenticationSchemes?.map((scheme: any) => ({
          scheme: scheme.scheme,
          displayName: scheme.displayName
        })) || []
      }))
    };
  }

  async createServiceConnection(
    project: string,
    name: string,
    type: string,
    configuration: {
      url?: string;
      description?: string;
      authorization?: { scheme: string; parameters?: Record<string, string> };
      data?: Record<string, string>;
    }
  ): Promise<any> {
    this.client.validateProject(project);

    const endpoint = {
      name,
      type,
      url: configuration.url || '',
      description: configuration.description || '',
      authorization: configuration.authorization,
      data: configuration.data || {},
      isShared: false,
      isReady: true
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/serviceendpoint/endpoints?api-version=${this.client.apiVersion}`,
      'POST',
      endpoint
    );

    return {
      id: response.id,
      name: response.name,
      type: response.type,
      isReady: response.isReady,
      project
    };
  }

  async updateServiceConnection(
    project: string,
    connectionId: string,
    updates: {
      name?: string;
      description?: string;
      url?: string;
      data?: Record<string, string>;
    }
  ): Promise<any> {
    this.client.validateProject(project);

    const current = await this.client.makeRequest<any>(
      `${project}/_apis/serviceendpoint/endpoints/${connectionId}?api-version=${this.client.apiVersion}`
    );

    const updated = {
      ...current,
      name: updates.name || current.name,
      description: updates.description || current.description,
      url: updates.url || current.url,
      data: updates.data ? { ...current.data, ...updates.data } : current.data
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/serviceendpoint/endpoints/${connectionId}?api-version=${this.client.apiVersion}`,
      'PUT',
      updated
    );

    return {
      id: response.id,
      name: response.name,
      type: response.type,
      isReady: response.isReady,
      project
    };
  }

  async shareServiceConnection(connectionId: string, projectIds: string[]): Promise<any> {
    const shareRequest = projectIds.map(projectId => ({
      projectReference: { id: projectId },
      name: ''
    }));

    const response = await this.client.makeRequest<any>(
      `_apis/serviceendpoint/endpoints/${connectionId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      { serviceEndpointProjectReferences: shareRequest }
    );

    return {
      id: response.id,
      name: response.name,
      sharedWith: projectIds
    };
  }

  async deleteServiceConnection(project: string, connectionId: string): Promise<any> {
    this.client.validateProject(project);

    await this.client.makeRequest<any>(
      `${project}/_apis/serviceendpoint/endpoints/${connectionId}?api-version=${this.client.apiVersion}`,
      'DELETE'
    );

    return {
      connectionId,
      project,
      deleted: true
    };
  }
}
