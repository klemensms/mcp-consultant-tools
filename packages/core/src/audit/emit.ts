import type { AuditEmitOptions } from './types.js';
import type { PipelineReport } from '../pii/types.js';
import { AuditPipeline } from './pipeline.js';
import { AuditEngagementUnsetError } from './errors.js';

export interface AuditEmitInputs extends AuditEmitOptions {
  /** Override for the result-shape captured. Default: structured-clone of the function's resolved value. */
  resultExtractor?: (result: unknown) => { recordCount?: number; outputRedaction?: PipelineReport | null };
}

/**
 * Wraps a tool function with audit-emit. Captures duration, success/failure, error
 * message, and (when level === 'full') the resolved result as `payloadOutput`.
 *
 * Refuse-to-execute: when audit is active (level=lean/full) and engagement is
 * unset, throws AuditEngagementUnsetError BEFORE invoking fn(). The error
 * propagates to the caller - it is NOT swallowed by safeEmit, because
 * engagement-unset is an operator responsibility violation, not an
 * audit-system failure.
 *
 * Audit-write failures (post-fn) are still isolated: if the audit pipeline
 * throws while emitting (e.g. AuditWriteError), the wrapper logs to stderr
 * and returns the tool result anyway. Tool errors are always rethrown.
 *
 * IMPORTANT: PII redaction is the caller's responsibility. The result passed in
 * (and the params on `opts`) are recorded verbatim when level === 'full'. Run
 * inputs and outputs through the PII pipeline BEFORE handing them to auditEmit.
 */
export async function auditEmit<T>(
  pipeline: AuditPipeline,
  opts: AuditEmitInputs,
  fn: () => Promise<T>
): Promise<T> {
  if (!pipeline.isEnabled) return fn();
  if (!pipeline.hasEngagement()) {
    throw new AuditEngagementUnsetError(opts.tool);
  }
  const start = Date.now();
  try {
    const result = await fn();
    const extra = opts.resultExtractor ? opts.resultExtractor(result) : {};
    await safeEmit(pipeline, {
      ...opts,
      durationMs: Date.now() - start,
      success: true,
      error: null,
      payloadOutput: pipeline.level === 'full' ? result : undefined,
      recordCount: extra.recordCount ?? opts.recordCount,
      outputRedaction: extra.outputRedaction ?? opts.outputRedaction,
    });
    return result;
  } catch (err) {
    await safeEmit(pipeline, {
      ...opts,
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      payloadOutput: undefined,
    });
    throw err;
  }
}

async function safeEmit(pipeline: AuditPipeline, opts: Parameters<AuditPipeline['emitResolved']>[0]): Promise<void> {
  try {
    await pipeline.emitResolved(opts);
  } catch (auditErr) {
    const message = auditErr instanceof Error ? auditErr.message : String(auditErr);
    console.error(`[audit] failed to emit record for tool "${opts.tool}": ${message}`);
  }
}
