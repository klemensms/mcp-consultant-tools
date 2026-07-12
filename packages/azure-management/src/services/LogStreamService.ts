import type { ArmClient } from '../client/ArmClient.js';
import type { ScmClient } from '../utils/scm-client.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

// ──────────────────────────────────────
// Bounds
// ──────────────────────────────────────

/**
 * An MCP tool call is request/response — the client blocks for the whole
 * duration. A stream held open for minutes (the source this was ported from
 * allowed 120s) is a poor citizen and can trip a client's tool timeout, so the
 * ceiling here is deliberately far below one.
 *
 * Both bounds are enforced twice: in the tool's Zod schema, and again here, so a
 * CLI caller or a direct service consumer cannot bypass them.
 */
export const DEFAULT_STREAM_DURATION_SECONDS = 10;
export const MAX_STREAM_DURATION_SECONDS = 30;
export const DEFAULT_STREAM_MAX_LINES = 200;
export const MAX_STREAM_MAX_LINES = 1000;

/** Slack over the duration, so the socket timeout never fires before our own abort. */
const STREAM_SOCKET_TIMEOUT_SLACK_MS = 5000;

export type LogStreamType = 'application' | 'http' | 'all';

/**
 * An empty stream is not evidence that the app is quiet. Filesystem logging is
 * off by default, and App Service turns application filesystem logging back off
 * 12 hours after it is enabled.
 */
export const EMPTY_STREAM_NOTE =
  'No log lines were captured. This does not mean the app is idle: App Service filesystem logging is off by default and self-disables 12 hours after being enabled. Check get-log-config before concluding the app produced no output.';

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────

export interface LogStreamResult {
  appName: string;
  slotName?: string;
  logType: LogStreamType;
  lines: string[];
  scmEndpoint: string;
  note?: string;
  summary: {
    totalLines: number;
    durationMs: number;
    terminationReason: 'timeout' | 'maxLines' | 'streamEnded';
    /** True when `maxLines` stopped collection, so more output was still arriving. */
    truncated: boolean;
  };
}

export interface LogConfigurationResult {
  appName: string;
  resourceGroup: string;
  applicationLogging: {
    fileSystemLevel: string;
    azureBlobStorage: { enabled: boolean; retentionDays?: number };
  };
  httpLogging: {
    fileSystem: { enabled: boolean; retentionDays?: number; retentionMb?: number };
    azureBlobStorage: { enabled: boolean; retentionDays?: number };
  };
  detailedErrorMessages: boolean;
  failedRequestTracing: boolean;
}

export interface DiagnosticDetectorSummary {
  name: string;
  displayName: string;
  description: string;
  category: string;
  type: string;
}

export interface DiagnosticDetectorResult {
  appName: string;
  detectorName: string;
  metadata: { name: string; description: string; category: string };
  dataset: Array<{
    table: {
      tableName: string;
      columns: Array<{ columnName: string; dataType: string }>;
      rows: unknown[][];
    };
    renderingProperties?: {
      /** The published schema names a string enum; production responses commonly send a number. */
      type?: number | string;
      title?: string;
      description?: string;
    };
  }>;
  status: { statusId: number; message?: string };
}

// ──────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────

/** `{app}-{slot}.scm.azurewebsites.net` — one hyphen, not a dot. */
export function buildScmHostName(appName: string, slotName?: string): string {
  return slotName
    ? `${appName}-${slotName}.scm.azurewebsites.net`
    : `${appName}.scm.azurewebsites.net`;
}

export function buildLogStreamPath(logType: LogStreamType): string {
  return logType === 'all' ? '/api/logstream' : `/api/logstream/${logType}`;
}

export function clampDurationSeconds(value?: number): number {
  const requested = value ?? DEFAULT_STREAM_DURATION_SECONDS;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error(`durationSeconds must be a positive integer, got: ${requested}`);
  }
  return Math.min(requested, MAX_STREAM_DURATION_SECONDS);
}

export function clampMaxLines(value?: number): number {
  const requested = value ?? DEFAULT_STREAM_MAX_LINES;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error(`maxLines must be a positive integer, got: ${requested}`);
  }
  return Math.min(requested, MAX_STREAM_MAX_LINES);
}

// ──────────────────────────────────────
// Service
// ──────────────────────────────────────

/**
 * App Service / Function App live log streaming, logging configuration, and the
 * App Service diagnostic detectors ("Diagnose and solve problems").
 */
export class LogStreamService {
  constructor(
    private client: ArmClient,
    private scmClient: ScmClient
  ) {}

  /** Read the logging configuration for an App Service or Function App. */
  async getLogConfiguration(options: {
    appName: string;
    resourceGroup?: string;
  }): Promise<LogConfigurationResult> {
    const { appName } = options;
    const resourceGroup = options.resourceGroup || this.client.getDefaultResourceGroup();
    if (!resourceGroup) throw new Error('Resource group is required');

    const path = this.client.resourceGroupPath(
      resourceGroup,
      `/providers/Microsoft.Web/sites/${appName}/config/logs`
    );

    const response = await this.client.get<{
      properties?: {
        applicationLogs?: {
          fileSystem?: { level?: string };
          azureBlobStorage?: { level?: string; retentionInDays?: number };
        };
        httpLogs?: {
          fileSystem?: { enabled?: boolean; retentionInDays?: number; retentionInMb?: number };
          azureBlobStorage?: { enabled?: boolean; retentionInDays?: number };
        };
        detailedErrorMessages?: { enabled?: boolean };
        failedRequestsTracing?: { enabled?: boolean };
      };
    }>(path, getApiVersion('Microsoft.Web/sites/config'));

    const props = response.properties || {};
    const appLogs = props.applicationLogs || {};
    const httpLogs = props.httpLogs || {};

    // `sasUrl` is deliberately not surfaced: it is a storage SAS token.
    return {
      appName,
      resourceGroup,
      applicationLogging: {
        fileSystemLevel: appLogs.fileSystem?.level || 'Off',
        azureBlobStorage: {
          enabled: !!appLogs.azureBlobStorage?.level && appLogs.azureBlobStorage.level !== 'Off',
          retentionDays: appLogs.azureBlobStorage?.retentionInDays,
        },
      },
      httpLogging: {
        fileSystem: {
          enabled: httpLogs.fileSystem?.enabled || false,
          retentionDays: httpLogs.fileSystem?.retentionInDays,
          retentionMb: httpLogs.fileSystem?.retentionInMb,
        },
        azureBlobStorage: {
          enabled: httpLogs.azureBlobStorage?.enabled || false,
          retentionDays: httpLogs.azureBlobStorage?.retentionInDays,
        },
      },
      detailedErrorMessages: props.detailedErrorMessages?.enabled || false,
      failedRequestTracing: props.failedRequestsTracing?.enabled || false,
    };
  }

  /**
   * Collect live log output from the Kudu SCM stream, stopping at whichever of
   * `durationSeconds` or `maxLines` comes first. Both are clamped to their
   * ceilings rather than rejected, so an over-eager caller gets a short read, not
   * an error.
   */
  async getLogStream(options: {
    appName: string;
    logType?: LogStreamType;
    durationSeconds?: number;
    maxLines?: number;
    slotName?: string;
  }): Promise<LogStreamResult> {
    const { appName, slotName, logType = 'application' } = options;
    const durationSeconds = clampDurationSeconds(options.durationSeconds);
    const maxLines = clampMaxLines(options.maxLines);

    const scmHostName = buildScmHostName(appName, slotName);
    const path = buildLogStreamPath(logType);

    const controller = new AbortController();
    const startedAt = Date.now();
    const lines: string[] = [];
    let terminationReason: LogStreamResult['summary']['terminationReason'] = 'timeout';

    const timeoutId = setTimeout(() => controller.abort(), durationSeconds * 1000);

    try {
      const stream = await this.scmClient.getStream(scmHostName, path, {
        signal: controller.signal,
        timeoutMs: durationSeconds * 1000 + STREAM_SOCKET_TIMEOUT_SLACK_MS,
      });

      let buffer = '';
      let hitMaxLines = false;

      for await (const chunk of stream) {
        buffer += String(chunk);
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';

        for (const line of parts) {
          if (lines.length >= maxLines) break;
          if (line.trim()) lines.push(line);
        }

        // Checked after the inner loop, not inside it: a chunk whose last line
        // lands exactly on `maxLines` never re-enters the inner guard, and the
        // outer read would otherwise carry on to the duration timeout.
        if (lines.length >= maxLines) {
          hitMaxLines = true;
          terminationReason = 'maxLines';
          controller.abort();
          break;
        }
      }

      if (!hitMaxLines) {
        // The `for await` ran to completion, so the server closed the stream.
        terminationReason = 'streamEnded';
        // Flush the trailing partial line — but never past `maxLines`, which the
        // source this was ported from allowed by one.
        if (buffer.trim() && lines.length < maxLines) lines.push(buffer);
      }
    } catch (error: unknown) {
      // Aborting on timeout or `maxLines` is the normal exit path, not a failure.
      // If we are the ones who aborted, whatever surfaced is that abort.
      if (!controller.signal.aborted && !this.isAbort(error)) throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    return {
      appName,
      slotName,
      logType,
      lines,
      scmEndpoint: `https://${scmHostName}${path}`,
      note: lines.length === 0 ? EMPTY_STREAM_NOTE : undefined,
      summary: {
        totalLines: lines.length,
        durationMs: Date.now() - startedAt,
        terminationReason,
        truncated: terminationReason === 'maxLines',
      },
    };
  }

  /** List the diagnostic detectors available for an App Service or Function App. */
  async listDiagnosticDetectors(options: { appName: string; resourceGroup?: string }): Promise<{
    detectors: DiagnosticDetectorSummary[];
    summary: { total: number; byCategory: Record<string, number> };
  }> {
    const { appName } = options;
    const resourceGroup = options.resourceGroup || this.client.getDefaultResourceGroup();
    if (!resourceGroup) throw new Error('Resource group is required');

    const path = this.client.resourceGroupPath(
      resourceGroup,
      `/providers/Microsoft.Web/sites/${appName}/detectors`
    );

    const rawDetectors = await this.client.paginate<{
      name: string;
      properties?: {
        metadata?: { name?: string; description?: string; category?: string; type?: string };
      };
    }>(path, getApiVersion('Microsoft.Web/sites/detectors'));

    const detectors: DiagnosticDetectorSummary[] = [];
    const byCategory: Record<string, number> = {};

    for (const detector of rawDetectors) {
      const meta = detector.properties?.metadata || {};
      const category = meta.category || 'Uncategorized';

      detectors.push({
        name: detector.name,
        displayName: meta.name || detector.name,
        description: meta.description || '',
        category,
        type: meta.type || 'Detector',
      });
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return { detectors, summary: { total: detectors.length, byCategory } };
  }

  /**
   * Run one diagnostic detector. `startTime`/`endTime` are optional ISO 8601
   * instants; omitting them lets the detector pick its own window.
   */
  async getDiagnosticDetector(options: {
    appName: string;
    detectorName: string;
    resourceGroup?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<DiagnosticDetectorResult> {
    const { appName, detectorName, startTime, endTime } = options;
    const resourceGroup = options.resourceGroup || this.client.getDefaultResourceGroup();
    if (!resourceGroup) throw new Error('Resource group is required');

    const path = this.client.resourceGroupPath(
      resourceGroup,
      `/providers/Microsoft.Web/sites/${appName}/detectors/${detectorName}`
    );

    const params: Record<string, string> = {};
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const response = await this.client.get<{
      properties?: {
        metadata?: { name?: string; description?: string; category?: string };
        dataset?: Array<{
          table?: {
            tableName: string;
            columns: Array<{ columnName: string; dataType: string }>;
            rows: unknown[][];
          };
          renderingProperties?: { type?: number | string; title?: string; description?: string };
        }>;
        status?: { statusId: number; message?: string };
      };
    }>(path, getApiVersion('Microsoft.Web/sites/detectors'), params);

    const props = response.properties || {};
    const meta = props.metadata || {};

    return {
      appName,
      detectorName,
      metadata: {
        name: meta.name || detectorName,
        description: meta.description || '',
        category: meta.category || 'Uncategorized',
      },
      dataset: (props.dataset || []).map((entry) => ({
        table: entry.table || { tableName: '', columns: [], rows: [] },
        renderingProperties: entry.renderingProperties,
      })),
      status: props.status || { statusId: 0 },
    };
  }

  private isAbort(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    if (error.name === 'AbortError' || error.name === 'CanceledError') return true;
    return (error as { code?: string }).code === 'ERR_CANCELED';
  }
}
