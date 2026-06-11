/**
 * Pipeline and build operations for Azure DevOps Admin.
 * Includes pipeline CRUD, build management, and approval operations.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

export class PipelineService {
  constructor(private client: AdminClient) {}

  async listPipelineDefinitions(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/build/definitions?api-version=${this.client.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      pipelines: response.value.map((def: any) => ({
        id: def.id,
        name: def.name,
        path: def.path,
        revision: def.revision,
        type: def.type,
        queueStatus: def.queueStatus,
        createdDate: def.createdDate,
        authoredBy: def.authoredBy?.displayName,
        repository: def.repository ? {
          id: def.repository.id,
          name: def.repository.name,
          type: def.repository.type
        } : null,
        process: def.process ? {
          type: def.process.type,
          yamlFilename: def.process.yamlFilename
        } : null,
        url: def._links?.web?.href
      }))
    };
  }

  async getPipelineDefinition(project: string, definitionId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/definitions/${definitionId}?api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      path: response.path,
      revision: response.revision,
      type: response.type,
      queueStatus: response.queueStatus,
      quality: response.quality,
      createdDate: response.createdDate,
      authoredBy: response.authoredBy?.displayName,
      project: response.project?.name,
      repository: response.repository ? {
        id: response.repository.id,
        name: response.repository.name,
        type: response.repository.type,
        defaultBranch: response.repository.defaultBranch,
        url: response.repository.url
      } : null,
      process: response.process ? {
        type: response.process.type,
        yamlFilename: response.process.yamlFilename
      } : null,
      triggers: response.triggers || [],
      variables: response.variables ? Object.keys(response.variables).reduce((acc: any, key: string) => {
        const variable = response.variables[key];
        acc[key] = {
          value: variable.isSecret ? '***SECRET***' : variable.value,
          isSecret: variable.isSecret || false,
          allowOverride: variable.allowOverride || false
        };
        return acc;
      }, {}) : {},
      queue: response.queue ? {
        id: response.queue.id,
        name: response.queue.name,
        pool: response.queue.pool?.name
      } : null,
      url: response._links?.web?.href
    };
  }

  async getPipelineYaml(project: string, definitionId: number): Promise<any> {
    this.client.validateProject(project);

    const definition = await this.getPipelineDefinition(project, definitionId);

    if (definition.repository?.type && definition.repository.type !== 'TfsGit') {
      return {
        definitionId,
        project,
        pipelineName: definition.name,
        yamlLocation: 'external',
        repositoryType: definition.repository.type,
        repositoryName: definition.repository.name,
        repositoryUrl: definition.repository.url,
        defaultBranch: definition.repository.defaultBranch,
        yamlFilename: definition.process?.yamlFilename,
        message: `YAML is stored in external ${definition.repository.type} repository. ` +
                 `To view the YAML content, access the file "${definition.process?.yamlFilename}" ` +
                 `at ${definition.repository.url}`
      };
    }

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/definitions/${definitionId}/yaml?api-version=${this.client.apiVersion}`
    );

    return {
      definitionId,
      project,
      pipelineName: definition.name,
      yamlLocation: 'azureRepos',
      yaml: response.yaml || response
    };
  }

  async listPipelineRuns(project: string, definitionId: number, top: number = 10): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/build/builds?definitions=${definitionId}&$top=${top}&api-version=${this.client.apiVersion}`
    );

    return {
      project,
      definitionId,
      totalCount: response.value.length,
      builds: response.value.map((build: any) => ({
        id: build.id,
        buildNumber: build.buildNumber,
        status: build.status,
        result: build.result,
        queueTime: build.queueTime,
        startTime: build.startTime,
        finishTime: build.finishTime,
        sourceBranch: build.sourceBranch,
        sourceVersion: build.sourceVersion,
        requestedBy: build.requestedBy?.displayName,
        requestedFor: build.requestedFor?.displayName,
        reason: build.reason,
        priority: build.priority,
        url: build._links?.web?.href
      }))
    };
  }

  // Build troubleshooting methods

  async getBuildStatus(
    project: string,
    buildId: number,
    detail: string = 'summary',
    timelineScope: 'stages' | 'jobs' | 'all' | 'problems' = 'problems',
    maxIssues: number = 5
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/builds/${buildId}?api-version=${this.client.apiVersion}`
    );

    const result: any = {
      id: response.id,
      buildNumber: response.buildNumber,
      status: response.status,
      result: response.result,
      queueTime: response.queueTime,
      startTime: response.startTime,
      finishTime: response.finishTime,
      sourceBranch: response.sourceBranch,
      sourceVersion: response.sourceVersion,
      definition: response.definition ? {
        id: response.definition.id,
        name: response.definition.name
      } : null,
      requestedBy: response.requestedBy?.displayName,
      requestedFor: response.requestedFor?.displayName,
      reason: response.reason,
      priority: response.priority,
      project: response.project?.name,
      url: response._links?.web?.href
    };

    if (detail === 'timeline' || detail === 'full') {
      const timeline = await this.getBuildTimeline(project, buildId, timelineScope, maxIssues);
      result.timeline = timeline;
    }

    if (detail === 'full') {
      const logs = await this.getBuildLogs(project, buildId);
      result.logs = logs;
    }

    return result;
  }

  async getBuildTimeline(
    project: string,
    buildId: number,
    scope: 'stages' | 'jobs' | 'all' | 'problems' = 'problems',
    maxIssues: number = 5
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/builds/${buildId}/timeline?api-version=${this.client.apiVersion}`
    );

    const allRecords = response.records || [];

    const summary = {
      total: allRecords.length,
      byType: {} as Record<string, number>,
      byResult: {} as Record<string, number>,
      totalErrors: 0,
      totalWarnings: 0,
      failed: [] as string[],
    };

    for (const record of allRecords) {
      summary.byType[record.type] = (summary.byType[record.type] || 0) + 1;
      if (record.result) {
        summary.byResult[record.result] = (summary.byResult[record.result] || 0) + 1;
      }
      summary.totalErrors += record.errorCount || 0;
      summary.totalWarnings += record.warningCount || 0;
      if (record.result === 'failed' || record.result === 'canceled') {
        summary.failed.push(`${record.type}: ${record.name}`);
      }
    }

    let filteredRecords = allRecords;
    switch (scope) {
      case 'stages':
        filteredRecords = allRecords.filter((r: any) => r.type === 'Stage');
        break;
      case 'jobs':
        filteredRecords = allRecords.filter((r: any) => r.type === 'Stage' || r.type === 'Job');
        break;
      case 'problems':
        filteredRecords = allRecords.filter((r: any) =>
          (r.errorCount && r.errorCount > 0) ||
          (r.warningCount && r.warningCount > 0) ||
          r.result === 'failed' ||
          r.result === 'canceled'
        );
        break;
      case 'all':
      default:
        break;
    }

    const truncateIssues = (issues: any[] | undefined, max: number) => {
      if (!issues || issues.length === 0) return { items: [], totalCount: 0, truncated: false };

      const sorted = [...issues].sort((a, b) => {
        const priority = (issue: any) => {
          if (issue.type === 'error') return 0;
          if (issue.type === 'warning') return 1;
          return 2;
        };
        return priority(a) - priority(b);
      });

      return {
        items: sorted.slice(0, max),
        totalCount: issues.length,
        truncated: issues.length > max
      };
    };

    const mappedRecords = filteredRecords.map((record: any) => {
      const truncatedIssues = truncateIssues(record.issues, maxIssues);
      return {
        id: record.id,
        parentId: record.parentId,
        type: record.type,
        name: record.name,
        state: record.state,
        result: record.result,
        startTime: record.startTime,
        finishTime: record.finishTime,
        order: record.order,
        errorCount: record.errorCount,
        warningCount: record.warningCount,
        log: record.log ? { id: record.log.id } : null,
        issues: truncatedIssues.items,
        issuesTruncated: truncatedIssues.truncated,
        totalIssueCount: truncatedIssues.totalCount
      };
    });

    return {
      buildId,
      project,
      scope,
      summary,
      recordCount: mappedRecords.length,
      records: mappedRecords
    };
  }

  private filterLogContent(content: string, mode: 'summary' | 'full' | 'errors'): { filtered: string; originalLineCount: number; filteredLineCount: number } {
    const lines = content.split('\n');
    const originalLineCount = lines.length;

    if (mode === 'full') {
      return { filtered: content, originalLineCount, filteredLineCount: originalLineCount };
    }

    const PROGRESS_PATTERNS = [
      /remote: Counting objects:\s+\d+%/,
      /remote: Compressing objects:\s+\d+%/,
      /Receiving objects:\s+\d+%/,
      /Resolving deltas:\s+\d+%/,
      /Unpacking objects:\s+\d+%/,
      /Updating files:\s+\d+%/,
    ];

    const ERROR_PATTERNS = [
      /##\[error\]/i,
      /##\[warning\]/i,
      /\berror\b.*:/i,
      /\bfailed\b/i,
      /\bexception\b/i,
      /\bfatal\b/i,
    ];

    const filteredLines = lines.filter(line => {
      const trimmedLine = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '');

      if (mode === 'errors') {
        return ERROR_PATTERNS.some(p => p.test(trimmedLine));
      }

      return !PROGRESS_PATTERNS.some(p => p.test(trimmedLine));
    });

    return {
      filtered: filteredLines.join('\n'),
      originalLineCount,
      filteredLineCount: filteredLines.length
    };
  }

  async getBuildLogs(project: string, buildId: number, logId?: number, mode: 'summary' | 'full' | 'errors' = 'summary'): Promise<any> {
    this.client.validateProject(project);

    if (logId !== undefined) {
      const response = await this.client.makeRequest<string>(
        `${project}/_apis/build/builds/${buildId}/logs/${logId}?api-version=${this.client.apiVersion}`
      );

      const { filtered, originalLineCount, filteredLineCount } = this.filterLogContent(response, mode);

      return {
        buildId,
        logId,
        project,
        mode,
        originalLineCount,
        filteredLineCount,
        content: filtered
      };
    }

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/build/builds/${buildId}/logs?api-version=${this.client.apiVersion}`
    );

    return {
      buildId,
      project,
      totalCount: response.value.length,
      logs: response.value.map((log: any) => ({
        id: log.id,
        type: log.type,
        lineCount: log.lineCount,
        createdOn: log.createdOn,
        lastChangedOn: log.lastChangedOn,
        url: log.url
      }))
    };
  }

  async listPendingApprovals(project: string, buildId: number): Promise<any> {
    this.client.validateProject(project);

    const timeline = await this.client.makeRequest<any>(
      `${project}/_apis/build/builds/${buildId}/timeline?api-version=${this.client.apiVersion}`
    );

    const approvalRecords = (timeline.records || []).filter(
      (r: any) => r.type === 'Checkpoint.Approval'
    );

    if (approvalRecords.length === 0) {
      return {
        project,
        buildId,
        totalCount: 0,
        approvals: [],
        message: 'No approval checkpoints found for this build'
      };
    }

    const approvalIds = approvalRecords.map((r: any) => r.id);
    const approvalIdsParam = approvalIds.join(',');
    const approvalsResponse = await this.client.makeRequest<any>(
      `${project}/_apis/pipelines/approvals?approvalIds=${approvalIdsParam}&$expand=steps&api-version=${this.client.apiVersion}`
    );

    const approvals = (approvalsResponse.value || [approvalsResponse]).map((a: any) => ({
      id: a.id,
      status: a.status,
      createdOn: a.createdOn,
      executionOrder: a.executionOrder,
      minRequiredApprovers: a.minRequiredApprovers,
      instructions: a.instructions,
      blockedApprovers: a.blockedApprovers,
      steps: (a.steps || []).map((s: any) => ({
        assignedApprover: s.assignedApprover?.displayName,
        assignedApproverId: s.assignedApprover?.uniqueName,
        status: s.status,
        comment: s.comment,
        initiatedOn: s.initiatedOn,
        lastModifiedOn: s.lastModifiedOn
      }))
    }));

    return {
      project,
      buildId,
      totalCount: approvals.length,
      approvals
    };
  }

  // Upsert operations

  async createPipelineDefinition(
    project: string,
    name: string,
    repositoryId: string,
    yamlPath: string,
    folder?: string,
    repositoryType: 'TfsGit' | 'GitHub' | 'GitHubEnterprise' = 'TfsGit',
    repositoryUrl?: string,
    defaultBranch?: string,
    serviceConnectionId?: string
  ): Promise<any> {
    this.client.validateProject(project);

    if (repositoryType !== 'TfsGit') {
      if (!repositoryUrl) {
        throw new Error(`repositoryUrl is required for ${repositoryType} repositories`);
      }
      if (!serviceConnectionId) {
        throw new Error(`serviceConnectionId is required for ${repositoryType} repositories`);
      }
    }

    const normalizedBranch = defaultBranch
      ? (defaultBranch.startsWith('refs/heads/') ? defaultBranch : `refs/heads/${defaultBranch}`)
      : 'refs/heads/main';

    let repository: any;

    if (repositoryType === 'TfsGit') {
      repository = {
        id: repositoryId,
        type: 'TfsGit'
      };
    } else {
      repository = {
        id: repositoryId,
        name: repositoryId,
        type: repositoryType,
        url: repositoryUrl,
        defaultBranch: normalizedBranch,
        properties: {
          connectedServiceId: serviceConnectionId
        }
      };
    }

    const definition = {
      name,
      path: folder || '\\',
      type: 'build',
      queueStatus: 'enabled',
      process: {
        type: 2,
        yamlFilename: yamlPath
      },
      repository
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/definitions?api-version=${this.client.apiVersion}`,
      'POST',
      definition
    );

    return {
      id: response.id,
      name: response.name,
      path: response.path,
      revision: response.revision,
      project,
      repositoryType,
      url: response._links?.web?.href
    };
  }

  async updatePipelineDefinition(
    project: string,
    definitionId: number,
    updates: {
      name?: string;
      path?: string;
      queueStatus?: string;
      triggers?: any[];
      variables?: Record<string, { value: string; isSecret?: boolean; allowOverride?: boolean }>;
    }
  ): Promise<any> {
    this.client.validateProject(project);

    const current = await this.client.makeRequest<any>(
      `${project}/_apis/build/definitions/${definitionId}?api-version=${this.client.apiVersion}`
    );

    const updated = {
      ...current,
      ...updates,
      revision: current.revision
    };

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/definitions/${definitionId}?api-version=${this.client.apiVersion}`,
      'PUT',
      updated
    );

    return {
      id: response.id,
      name: response.name,
      path: response.path,
      revision: response.revision,
      project,
      url: response._links?.web?.href
    };
  }

  async renamePipelineDefinition(project: string, definitionId: number, newName: string): Promise<any> {
    return this.updatePipelineDefinition(project, definitionId, { name: newName });
  }

  async queueBuild(
    project: string,
    definitionId: number,
    branch?: string,
    variables?: Record<string, string>,
    parameters?: Record<string, any>,
    sourceVersion?: string
  ): Promise<any> {
    this.client.validateProject(project);

    const buildRequest: any = {
      definition: { id: definitionId }
    };

    if (branch) {
      buildRequest.sourceBranch = branch;
    }

    if (sourceVersion) {
      buildRequest.sourceVersion = sourceVersion;
    }

    if (variables) {
      buildRequest.parameters = JSON.stringify(variables);
    }

    if (parameters) {
      buildRequest.templateParameters = parameters;
    }

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/builds?api-version=${this.client.apiVersion}`,
      'POST',
      buildRequest
    );

    return {
      id: response.id,
      buildNumber: response.buildNumber,
      status: response.status,
      queueTime: response.queueTime,
      definition: response.definition?.name,
      sourceBranch: response.sourceBranch,
      project,
      url: response._links?.web?.href
    };
  }

  async cancelBuild(project: string, buildId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/build/builds/${buildId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      { status: 'cancelling' },
      undefined,
      'application/json'
    );

    return {
      id: response.id,
      buildNumber: response.buildNumber,
      status: response.status,
      project,
      message: 'Build cancellation requested'
    };
  }

  async retryBuild(project: string, buildId: number): Promise<any> {
    this.client.validateProject(project);

    const original = await this.client.makeRequest<any>(
      `${project}/_apis/build/builds/${buildId}?api-version=${this.client.apiVersion}`
    );

    return this.queueBuild(
      project,
      original.definition.id,
      original.sourceBranch
    );
  }

  async deletePipelineDefinition(project: string, definitionId: number): Promise<any> {
    this.client.validateProject(project);

    await this.client.makeRequest<any>(
      `${project}/_apis/build/definitions/${definitionId}?api-version=${this.client.apiVersion}`,
      'DELETE'
    );

    return {
      definitionId,
      project,
      deleted: true
    };
  }

  async approveStage(project: string, approvalId: string, status: 'approved' | 'rejected', comment?: string): Promise<any> {
    this.client.validateProject(project);

    const body = [{ approvalId, status, comment: comment || '' }];

    const response = await this.client.makeRequest<any>(
      `${project}/_apis/pipelines/approvals?api-version=${this.client.apiVersion}`,
      'PATCH',
      body,
      { 'Content-Type': 'application/json' }
    );

    const result = Array.isArray(response.value) ? response.value[0] : response;
    return {
      id: result.id,
      status: result.status,
      comment,
      project,
      message: `Approval ${approvalId} ${status}`
    };
  }
}
