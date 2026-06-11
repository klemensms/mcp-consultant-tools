/**
 * Variable Group Service - Azure DevOps variable group operations
 */
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';

export class VariableGroupService {
  constructor(private readonly client: AzureDevOpsClient) {}

  async getVariableGroups(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
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
        variableGroupProjectReferences: group.variableGroupProjectReferences,
        variables: Object.keys(group.variables || {}).reduce((acc: any, key: string) => {
          const variable = group.variables[key];
          acc[key] = {
            value: variable.isSecret ? '***SECRET***' : variable.value,
            isSecret: variable.isSecret || false,
            isReadOnly: variable.isReadOnly || false
          };
          return acc;
        }, {})
      }))
    };
  }

  async getVariableGroup(project: string, groupId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<any>(
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
      variableGroupProjectReferences: response.variableGroupProjectReferences,
      project,
      variables: Object.keys(response.variables || {}).reduce((acc: any, key: string) => {
        const variable = response.variables[key];
        acc[key] = {
          value: variable.isSecret ? '***SECRET***' : variable.value,
          isSecret: variable.isSecret || false,
          isReadOnly: variable.isReadOnly || false
        };
        return acc;
      }, {})
    };
  }
}
