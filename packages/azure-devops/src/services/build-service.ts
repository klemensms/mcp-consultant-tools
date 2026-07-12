/**
 * Build Service - Azure DevOps build/pipeline troubleshooting operations
 *
 * NOTE: These methods are duplicated in azure-devops-admin package.
 * If you update these, also update packages/azure-devops-admin/src/AzureDevOpsAdminService.ts
 */
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';
import { extractBuildIssues } from './build-issues.js';

export class BuildService {
  constructor(private readonly client: AzureDevOpsClient) {}

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

  async getBuildStatus(
    project: string,
    buildId: number,
    detail: string = 'summary',
    timelineScope: 'stages' | 'jobs' | 'all' | 'problems' = 'problems',
    maxIssues: number = 5
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<any>(
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

    const response = await this.client.get<any>(
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

  async getBuildLogs(project: string, buildId: number, logId?: number, mode: 'summary' | 'full' | 'errors' = 'summary'): Promise<any> {
    this.client.validateProject(project);

    if (logId !== undefined) {
      const response = await this.client.get<string>(
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

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
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

  /**
   * Warnings and errors for a build, read from the timeline's `issues[]`.
   *
   * No log download is needed: the timeline carries each issue's full message.
   */
  async getBuildIssues(
    project: string,
    buildId: number,
    severity: 'all' | 'errors' | 'warnings' = 'all'
  ): Promise<any> {
    this.client.validateProject(project);

    const [build, timeline] = await Promise.all([
      this.client.get<any>(
        `${project}/_apis/build/builds/${buildId}?api-version=${this.client.apiVersion}`
      ),
      this.client.get<any>(
        `${project}/_apis/build/builds/${buildId}/timeline?api-version=${this.client.apiVersion}`
      ),
    ]);

    const summary = extractBuildIssues(timeline?.records ?? [], severity);

    return {
      project,
      buildId,
      buildNumber: build?.buildNumber,
      status: build?.status,
      result: build?.result,
      sourceBranch: build?.sourceBranch,
      severity,
      ...summary,
    };
  }
}
