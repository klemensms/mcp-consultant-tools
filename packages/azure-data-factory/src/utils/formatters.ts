/**
 * Formatters for Azure Data Factory output
 */

import type {
  PipelineRun,
  ActivityRun,
  ActivityError,
  Pipeline,
  Trigger,
  IntegrationRuntimeStatus,
} from '../models/index.js';

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(durationMs?: number): string {
  if (!durationMs) return '-';

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format a pipeline run summary
 */
export function formatPipelineRunSummary(run: PipelineRun): string {
  const lines: string[] = [];

  lines.push(`## Pipeline Run: ${run.pipelineName}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Run ID | \`${run.runId}\` |`);
  lines.push(`| Status | **${run.status}** |`);
  lines.push(`| Duration | ${formatDuration(run.durationInMs)} |`);

  if (run.runStart) {
    lines.push(`| Started | ${new Date(run.runStart).toISOString()} |`);
  }
  if (run.runEnd) {
    lines.push(`| Ended | ${new Date(run.runEnd).toISOString()} |`);
  }
  if (run.invokedBy) {
    lines.push(`| Invoked By | ${run.invokedBy.name} (${run.invokedBy.invokedByType || 'Manual'}) |`);
  }

  if (run.message) {
    lines.push('');
    lines.push('### Message');
    lines.push('');
    lines.push(run.message);
  }

  if (run.parameters && Object.keys(run.parameters).length > 0) {
    lines.push('');
    lines.push('### Parameters');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(run.parameters, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

/**
 * Format activity runs with error details
 */
export function formatActivityRuns(activities: ActivityRun[], pipelineRun?: PipelineRun): string {
  const lines: string[] = [];

  if (pipelineRun) {
    lines.push(`## Pipeline Run Failed`);
    lines.push('');
    lines.push(`**Pipeline**: ${pipelineRun.pipelineName}`);
    lines.push(`**Run ID**: \`${pipelineRun.runId}\``);
    lines.push(`**Duration**: ${formatDuration(pipelineRun.durationInMs)}`);
    lines.push('');
  }

  // Calculate summary
  const summary = {
    total: activities.length,
    succeeded: activities.filter((a) => a.status === 'Succeeded').length,
    failed: activities.filter((a) => a.status === 'Failed').length,
    inProgress: activities.filter((a) => a.status === 'InProgress').length,
    cancelled: activities.filter((a) => a.status === 'Cancelled').length,
    queued: activities.filter((a) => a.status === 'Queued').length,
  };

  lines.push(`### Summary`);
  lines.push('');
  lines.push(`- Total: ${summary.total}`);
  lines.push(`- Succeeded: ${summary.succeeded}`);
  if (summary.failed > 0) lines.push(`- **Failed: ${summary.failed}**`);
  if (summary.inProgress > 0) lines.push(`- In Progress: ${summary.inProgress}`);
  if (summary.cancelled > 0) lines.push(`- Cancelled: ${summary.cancelled}`);
  if (summary.queued > 0) lines.push(`- Queued: ${summary.queued}`);
  lines.push('');

  // Show failed activities with details
  const failedActivities = activities.filter((a) => a.status === 'Failed');
  if (failedActivities.length > 0) {
    lines.push('### Failed Activities');
    lines.push('');

    for (const activity of failedActivities) {
      lines.push(`#### ${activity.activityName}`);
      lines.push('');
      lines.push(`| Field | Value |`);
      lines.push(`|-------|-------|`);
      lines.push(`| Activity Type | ${activity.activityType} |`);
      lines.push(`| Duration | ${formatDuration(activity.durationInMs)} |`);

      if (activity.error) {
        lines.push(`| Error Code | ${activity.error.errorCode} |`);
        lines.push(`| Failure Type | ${activity.error.failureType} |`);
        lines.push(`| Target | ${activity.error.target || '-'} |`);
        lines.push('');
        lines.push('**Error Message:**');
        lines.push('');
        lines.push(`> ${activity.error.message}`);
      }
      lines.push('');
    }
  }

  // Activity timeline
  lines.push('### Activity Timeline');
  lines.push('');
  lines.push('| Activity | Type | Status | Duration |');
  lines.push('|----------|------|--------|----------|');

  for (const activity of activities) {
    const statusFormatted =
      activity.status === 'Failed'
        ? `**${activity.status}**`
        : activity.status;
    lines.push(
      `| ${activity.activityName} | ${activity.activityType} | ${statusFormatted} | ${formatDuration(activity.durationInMs)} |`
    );
  }

  return lines.join('\n');
}

/**
 * Format error details
 */
export function formatError(error: ActivityError): string {
  const lines: string[] = [];

  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Error Code | ${error.errorCode} |`);
  lines.push(`| Failure Type | ${error.failureType} |`);
  lines.push(`| Target | ${error.target || '-'} |`);
  lines.push('');
  lines.push('**Message:**');
  lines.push('');
  lines.push(`> ${error.message}`);

  if (error.details) {
    lines.push('');
    lines.push('**Details:**');
    lines.push('');
    lines.push(`> ${error.details}`);
  }

  return lines.join('\n');
}

/**
 * Format pipeline list
 */
export function formatPipelineList(pipelines: Pipeline[]): string {
  const lines: string[] = [];

  lines.push('| Pipeline | Description | Activities | Folder |');
  lines.push('|----------|-------------|------------|--------|');

  for (const pipeline of pipelines) {
    const activityCount = pipeline.properties.activities?.length || 0;
    const folder = pipeline.properties.folder?.name || '-';
    const description = pipeline.properties.description || '-';
    lines.push(
      `| ${pipeline.name} | ${description.substring(0, 50)}${description.length > 50 ? '...' : ''} | ${activityCount} | ${folder} |`
    );
  }

  return lines.join('\n');
}

/**
 * Format trigger list
 */
export function formatTriggerList(triggers: Trigger[]): string {
  const lines: string[] = [];

  lines.push('| Trigger | Type | State | Pipelines |');
  lines.push('|---------|------|-------|-----------|');

  for (const trigger of triggers) {
    const state = trigger.properties.runtimeState || 'Unknown';
    const pipelineCount = trigger.properties.pipelines?.length || 0;
    const type = trigger.properties.type;

    lines.push(`| ${trigger.name} | ${type} | ${state} | ${pipelineCount} |`);
  }

  return lines.join('\n');
}

/**
 * Format integration runtime status
 */
export function formatIntegrationRuntimeStatus(status: IntegrationRuntimeStatus): string {
  const lines: string[] = [];

  lines.push(`## Integration Runtime: ${status.name}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Type | ${status.type} |`);
  lines.push(`| State | ${status.state || 'Unknown'} |`);

  // Add relevant properties based on type
  if (status.properties) {
    const props = status.properties;

    if (props.autoUpdate) {
      lines.push(`| Auto Update | ${props.autoUpdate} |`);
    }
    if (props.version) {
      lines.push(`| Version | ${props.version} |`);
    }
    if (props.scheduledUpdateDate) {
      lines.push(`| Scheduled Update | ${props.scheduledUpdateDate} |`);
    }
    if (props.latestVersion) {
      lines.push(`| Latest Version | ${props.latestVersion} |`);
    }
    if (props.nodeCommunicationChannelEncryptionMode) {
      lines.push(
        `| Encryption Mode | ${props.nodeCommunicationChannelEncryptionMode} |`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format pipeline run results as JSON (for structured output)
 */
export function formatPipelineRunsJson(runs: PipelineRun[]): object {
  return {
    count: runs.length,
    runs: runs.map((run) => ({
      runId: run.runId,
      pipelineName: run.pipelineName,
      status: run.status,
      runStart: run.runStart,
      runEnd: run.runEnd,
      durationInMs: run.durationInMs,
      duration: formatDuration(run.durationInMs),
      invokedBy: run.invokedBy?.name,
      invokedByType: run.invokedBy?.invokedByType,
      message: run.message,
    })),
  };
}

/**
 * Format activity runs as JSON (for structured output)
 */
export function formatActivityRunsJson(activities: ActivityRun[]): object {
  const summary = {
    total: activities.length,
    succeeded: activities.filter((a) => a.status === 'Succeeded').length,
    failed: activities.filter((a) => a.status === 'Failed').length,
    inProgress: activities.filter((a) => a.status === 'InProgress').length,
    cancelled: activities.filter((a) => a.status === 'Cancelled').length,
  };

  return {
    summary,
    activities: activities.map((activity) => ({
      activityRunId: activity.activityRunId,
      activityName: activity.activityName,
      activityType: activity.activityType,
      status: activity.status,
      activityRunStart: activity.activityRunStart,
      activityRunEnd: activity.activityRunEnd,
      durationInMs: activity.durationInMs,
      duration: formatDuration(activity.durationInMs),
      error: activity.error
        ? {
            errorCode: activity.error.errorCode,
            message: activity.error.message,
            failureType: activity.error.failureType,
            target: activity.error.target,
          }
        : undefined,
    })),
  };
}
