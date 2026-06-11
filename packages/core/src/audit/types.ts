/**
 * Audit logging types — Phase A.
 * Spec: docs/programmes/pii-and-audit/design/audit-logging-design.md
 */

import type { PipelineReport } from '../pii/types.js';

export type AuditLevel = 'off' | 'lean' | 'full';

export type AuditRotation = 'monthly' | 'weekly' | 'daily' | { sizeBytes: number };

export type AuditEnvironmentType = 'production' | 'uat' | 'dev';

export interface AuditConfig {
  level: AuditLevel;
  client: string;
  operatorIdentity?: string;
  basePath: string;
  rotation: AuditRotation;
  environmentType: AuditEnvironmentType;
}

export interface AuditOperator {
  fingerprint: string;
  identity?: string;
}

export interface AuditAuth {
  principalId: string | null;
  principalType: 'service-principal' | 'user-impersonation' | 'user-interactive' | 'unknown';
  userId: string | null;
}

export type EngagementSource = 'agent-explicit' | 'exploration' | 'unset';

export interface AuditEngagement {
  client: string;
  workItemIds: string[];
  reason?: string;
  source: EngagementSource;
}

export interface AuditEnvironment {
  type: 'production' | 'uat' | 'dev';
  url?: string;
  auditLevel: AuditLevel;
}

export interface AuditToolCall {
  name: string;
  params?: unknown;
  contextChange?: { from: AuditEngagement | null; to: AuditEngagement };
}

export interface AuditResult {
  success: boolean;
  error: string | null;
  durationMs: number;
  /**
   * Number of distinct top-level result items the tool returned. By convention:
   * - List-style tools (query-records, count-records, get-flow-runs) → length of the result array.
   * - Single-item tools (get-record, get-flow-run-details) → 1 on success.
   * - Metadata / lookup tools that don't return record bodies (get-entity-metadata,
   *   get-lookup-target) → undefined.
   * Counts user-facing rows, not internal API calls.
   */
  recordCount?: number;
}

export interface AuditRedactionReport {
  totalRedactions: number;
  byCategory: Record<string, number>;
  byLayer: Record<string, number>;
}

export interface AuditRedaction {
  input: AuditRedactionReport | null;
  output: AuditRedactionReport | null;
}

export interface AuditPayload {
  input?: unknown;
  output?: unknown;
}

export interface AuditRecord {
  v: 1;
  ts: string;
  seq: number;
  prevHash: string;
  operator: AuditOperator;
  auth: AuditAuth;
  engagement: AuditEngagement;
  environment: AuditEnvironment;
  tool: AuditToolCall;
  result: AuditResult;
  redaction: AuditRedaction;
  payload?: AuditPayload;
  quarantine?: { previousFile: string; reason: string };
}

export interface ChainState {
  v: 1;
  lastSeq: number;
  lastHash: string;
  fileChecksumAtLastWrite: string;
  currentFile: string;
}

export interface AuditEmitOptions {
  tool: string;
  params?: unknown;
  payloadInput?: unknown;
  inputRedaction?: PipelineReport | null;
  outputRedaction?: PipelineReport | null;
  recordCount?: number;
  contextChange?: { from: AuditEngagement | null; to: AuditEngagement };
}
