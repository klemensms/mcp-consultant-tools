/**
 * Variable group operations for Azure DevOps Admin.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

export class VariableGroupService {
  constructor(private client: AdminClient) {}

  async getVariableGroups(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/distributedtask/variablegroups?api-version=${this.client.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      variableGroups: response.value.map((group: any) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        type: group.type,
        createdBy: group.createdBy?.displayName,
        createdOn: group.createdOn,
        modifiedBy: group.modifiedBy?.displayName,
        modifiedOn: group.modifiedOn,
        isShared: group.isShared,
        variables: group.variables ? Object.keys(group.variables).reduce((acc: any, key: string) => {
          const v = group.variables[key];
          acc[key] = {
            value: v.isSecret ? '***SECRET***' : v.value,
            isSecret: v.isSecret || false,
            isReadOnly: v.isReadOnly || false
          };
          return acc;
        }, {}) : {}
      }))
    };
  }

  async getVariableGroup(project: string, groupId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      type: response.type,
      createdBy: response.createdBy?.displayName,
      createdOn: response.createdOn,
      modifiedBy: response.modifiedBy?.displayName,
      modifiedOn: response.modifiedOn,
      isShared: response.isShared,
      project,
      variables: response.variables ? Object.keys(response.variables).reduce((acc: any, key: string) => {
        const v = response.variables[key];
        acc[key] = {
          value: v.isSecret ? '***SECRET***' : v.value,
          isSecret: v.isSecret || false,
          isReadOnly: v.isReadOnly || false
        };
        return acc;
      }, {}) : {},
      variableGroupProjectReferences: response.variableGroupProjectReferences
    };
  }

  async createVariableGroup(
    project: string,
    name: string,
    description?: string,
    variables?: Record<string, { value: string; isSecret?: boolean }>
  ): Promise<any> {
    this.client.validateProject(project);

    const variableGroup = {
      name,
      description: description || '',
      type: 'Vsts',
      variables: variables || {},
      variableGroupProjectReferences: [{
        projectReference: { name: project },
        name: name
      }]
    };

    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/variablegroups?api-version=${this.client.apiVersion}`,
      'POST',
      variableGroup
    );

    return {
      id: response.id,
      name: response.name,
      project,
      variableCount: Object.keys(response.variables || {}).length
    };
  }

  async updateVariableGroupMetadata(
    project: string,
    groupId: number,
    updates: { name?: string; description?: string }
  ): Promise<any> {
    this.client.validateProject(project);

    const current = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`
    );

    const updated = {
      ...current,
      name: updates.name || current.name,
      description: updates.description || current.description
    };

    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`,
      'PUT',
      updated
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      project
    };
  }

  async setVariable(
    project: string,
    groupId: number,
    variableName: string,
    value: string,
    isSecret: boolean = false
  ): Promise<any> {
    this.client.validateProject(project);

    const current = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`
    );

    current.variables[variableName] = { value, isSecret };

    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`,
      'PUT',
      current
    );

    return {
      id: response.id,
      name: response.name,
      project,
      variableSet: variableName,
      isSecret
    };
  }

  async removeVariable(project: string, groupId: number, variableName: string): Promise<any> {
    this.client.validateProject(project);

    const current = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`
    );

    if (current.variables[variableName]) {
      delete current.variables[variableName];
    } else {
      throw new Error(`Variable '${variableName}' not found in group ${groupId}`);
    }

    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`,
      'PUT',
      current
    );

    return {
      id: response.id,
      name: response.name,
      project,
      variableRemoved: variableName
    };
  }

  async deleteVariableGroup(project: string, groupId: number): Promise<any> {
    this.client.validateProject(project);

    await this.client.makeRequest<any>(
      `_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`,
      'DELETE'
    );

    return {
      groupId,
      project,
      deleted: true
    };
  }
}
