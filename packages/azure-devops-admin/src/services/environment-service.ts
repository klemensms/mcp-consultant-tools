/**
 * Environment operations for Azure DevOps Admin.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

export class EnvironmentService {
  constructor(private client: AdminClient) {}

  async listEnvironments(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/distributedtask/environments?api-version=${this.client.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      environments: response.value.map((env: any) => ({
        id: env.id,
        name: env.name,
        description: env.description,
        createdBy: env.createdBy?.displayName,
        createdOn: env.createdOn,
        lastModifiedBy: env.lastModifiedBy?.displayName,
        lastModifiedOn: env.lastModifiedOn
      }))
    };
  }

  async getEnvironment(project: string, environmentId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/environments/${environmentId}?expands=resourceReferences&api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      createdBy: response.createdBy?.displayName,
      createdOn: response.createdOn,
      lastModifiedBy: response.lastModifiedBy?.displayName,
      lastModifiedOn: response.lastModifiedOn,
      project,
      resources: response.resources || []
    };
  }

  async getEnvironmentDeployments(project: string, environmentId: number, top: number = 10): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/distributedtask/environments/${environmentId}/environmentdeploymentrecords?top=${top}&api-version=${this.client.apiVersion}`
    );

    return {
      project,
      environmentId,
      totalCount: response.value.length,
      deployments: response.value.map((dep: any) => ({
        id: dep.id,
        environmentId: dep.environmentId,
        definition: dep.definition ? {
          id: dep.definition.id,
          name: dep.definition.name
        } : null,
        owner: dep.owner?.displayName,
        planType: dep.planType,
        startTime: dep.startTime,
        finishTime: dep.finishTime,
        result: dep.result,
        queueTime: dep.queueTime
      }))
    };
  }

  async getEnvironmentChecks(project: string, environmentId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/pipelines/checks/configurations?resourceType=environment&resourceId=${environmentId}&api-version=7.1-preview.1`
    );

    return {
      project,
      environmentId,
      totalCount: response.value.length,
      checks: response.value.map((check: any) => ({
        id: check.id,
        type: check.type?.name || check.type?.id,
        settings: check.settings,
        timeout: check.timeout,
        retryInterval: check.retryInterval,
        createdBy: check.createdBy?.displayName,
        createdOn: check.createdOn,
        modifiedBy: check.modifiedBy?.displayName,
        modifiedOn: check.modifiedOn,
        resource: check.resource
      }))
    };
  }

  async createEnvironment(project: string, name: string, description?: string): Promise<any> {
    this.client.validateProject(project);

    const environment = {
      name,
      description: description || ''
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/environments?api-version=${this.client.apiVersion}`,
      'POST',
      environment
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      project
    };
  }

  async updateEnvironment(
    project: string,
    environmentId: number,
    updates: { name?: string; description?: string }
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/environments/${environmentId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      updates
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      project
    };
  }

  async deleteEnvironment(project: string, environmentId: number): Promise<any> {
    this.client.validateProject(project);

    await this.client.makeRequest<any>(
      `${project}/_apis/distributedtask/environments/${environmentId}?api-version=${this.client.apiVersion}`,
      'DELETE'
    );

    return {
      environmentId,
      project,
      deleted: true
    };
  }

  async addEnvironmentCheck(
    project: string,
    environmentId: number,
    checkType: string,
    configuration: any
  ): Promise<any> {
    this.client.validateProject(project);

    const check = {
      type: { name: checkType },
      settings: configuration,
      resource: {
        type: 'environment',
        id: String(environmentId)
      }
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/pipelines/checks/configurations?api-version=7.1-preview.1`,
      'POST',
      check
    );

    return {
      id: response.id,
      type: response.type?.name,
      environmentId,
      project
    };
  }

  async updateEnvironmentCheck(
    project: string,
    checkId: number,
    updates: {
      settings?: any;
      timeout?: number;
    }
  ): Promise<any> {
    this.client.validateProject(project);

    const current = await this.client.makeRequest<any>(
      `${project}/_apis/pipelines/checks/configurations/${checkId}?api-version=7.1-preview.1`
    );

    const updated = {
      ...current,
      settings: updates.settings !== undefined ? updates.settings : current.settings,
      timeout: updates.timeout !== undefined ? updates.timeout : current.timeout
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/pipelines/checks/configurations/${checkId}?api-version=7.1-preview.1`,
      'PATCH',
      updated
    );

    return {
      id: response.id,
      type: response.type?.name,
      settings: response.settings,
      timeout: response.timeout,
      project
    };
  }

  async removeEnvironmentCheck(project: string, checkId: number): Promise<any> {
    this.client.validateProject(project);

    await this.client.makeRequest<any>(
      `${project}/_apis/pipelines/checks/configurations/${checkId}?api-version=7.1-preview.1`,
      'DELETE'
    );

    return {
      checkId,
      project,
      deleted: true
    };
  }
}
