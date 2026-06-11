import { join } from 'node:path';
import type {
  AuditAuth,
  AuditConfig,
  AuditEmitOptions,
  AuditEngagement,
  AuditEnvironment,
  AuditLevel,
  AuditOperator,
  AuditRecord,
  ChainState,
} from './types.js';
import type { PipelineReport } from '../pii/types.js';
import { AuditEngagementUnsetError, AuditWriteError } from './errors.js';
import { computeRecordHash, ZERO_HASH } from './chain.js';
import { currentFilename } from './rotation.js';
import { AuditSessionStore } from './session.js';
import { appendRecordLine, readChainState, writeChainState } from './storage.js';

export interface AuditPipelineDeps {
  operator: AuditOperator;
  auth: AuditAuth;
  environment: AuditEnvironment;
}

export interface AuditEmitResolvedOptions extends AuditEmitOptions {
  durationMs: number;
  success: boolean;
  error: string | null;
  payloadOutput?: unknown;
}

export class AuditPipeline {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly session: AuditSessionStore;
  private state: ChainState | null = null;

  constructor(
    private readonly config: AuditConfig,
    private readonly deps: AuditPipelineDeps
  ) {
    this.session = new AuditSessionStore(config.client);
  }

  get isEnabled(): boolean {
    return this.config.level !== 'off';
  }

  get level(): AuditLevel {
    return this.config.level;
  }

  hasEngagement(): boolean {
    return this.session.getEngagement() !== null;
  }

  async setEngagement(workItemIds: string[], reason: string | undefined): Promise<void> {
    const change = this.session.setEngagement(workItemIds, reason);
    if (!this.isEnabled) return;
    await this.enqueue(async () => {
      await this.appendInternal({
        tool: 'set-audit-engagement',
        contextChange: { from: change.previous, to: change.current },
      }, change.current);
    });
  }

  async emit(opts: AuditEmitOptions): Promise<void> {
    if (!this.isEnabled) return;
    const engagement = this.session.getEngagement();
    if (!engagement) throw new AuditEngagementUnsetError(opts.tool);
    await this.enqueue(async () => {
      await this.appendInternal(opts, engagement);
    });
  }

  async emitResolved(opts: AuditEmitResolvedOptions): Promise<void> {
    if (!this.isEnabled) return;
    const engagement = this.session.getEngagement();
    if (!engagement) throw new AuditEngagementUnsetError(opts.tool);
    await this.enqueue(async () => {
      await this.appendInternal(opts, engagement);
    });
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async appendInternal(opts: AuditEmitOptions & Partial<AuditEmitResolvedOptions>, engagement: AuditEngagement): Promise<void> {
    try {
      const dir = join(this.config.basePath, this.config.client);
      if (!this.state) this.state = await readChainState(dir);
      const prev: ChainState | null = this.state;
      const filename = currentFilename(this.config.rotation);
      const filePath = join(dir, filename);

      const seq = (prev?.lastSeq ?? 0) + 1;
      const prevHash = prev?.lastHash ?? ZERO_HASH;

      const record: AuditRecord = {
        v: 1,
        ts: new Date().toISOString(),
        seq,
        prevHash,
        operator: this.deps.operator,
        auth: this.deps.auth,
        engagement,
        environment: this.deps.environment,
        tool: { name: opts.tool, params: opts.params, contextChange: opts.contextChange },
        result: {
          success: opts.success ?? true,
          error: opts.error ?? null,
          durationMs: opts.durationMs ?? 0,
          recordCount: opts.recordCount,
        },
        redaction: {
          input: opts.inputRedaction ? toAuditRedactionReport(opts.inputRedaction) : null,
          output: opts.outputRedaction ? toAuditRedactionReport(opts.outputRedaction) : null,
        },
      };

      if (this.config.level === 'full') {
        record.payload = {
          input: opts.payloadInput,
          output: opts.payloadOutput,
        };
      }

      // Append-then-update-state ordering is intentional. JSONL append is the
      // commit point; if the process dies between appendRecordLine and
      // writeChainState, the on-disk JSONL has the new record but
      // .chain-state still reflects the previous record. The verifier (Task 8)
      // detects this gap and triggers quarantine recovery — preferable to the
      // inverse ordering, which would risk losing a written record entirely.
      const recordHash = computeRecordHash(record);
      await appendRecordLine(filePath, JSON.stringify(record));

      this.state = {
        v: 1,
        lastSeq: seq,
        lastHash: recordHash,
        fileChecksumAtLastWrite: '',
        currentFile: filename,
      };
      await writeChainState(dir, this.state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AuditWriteError(message, err);
    }
  }
}

function toAuditRedactionReport(report: PipelineReport) {
  const byCategory: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  for (const l of report.layers) {
    let layerSum = 0;
    for (const [cat, n] of Object.entries(l.redactionCounts)) {
      byCategory[cat] = (byCategory[cat] ?? 0) + n;
      layerSum += n;
    }
    byLayer[l.layerId] = (byLayer[l.layerId] ?? 0) + layerSum;
  }
  return { totalRedactions: report.totalRedactions, byCategory, byLayer };
}
