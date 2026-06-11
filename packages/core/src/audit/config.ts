import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AuditConfig, AuditLevel, AuditRotation } from './types.js';
import { AuditRefuseToStartError } from './errors.js';

const VALID_LEVELS: ReadonlyArray<AuditLevel> = ['off', 'lean', 'full'];

export function createAuditConfigFromEnv(): AuditConfig {
  const level = readLevel();
  const client =
    level === 'off' ? '' : requireEnv('MCP_AUDIT_CLIENT', 'when MCP_AUDIT_LEVEL is lean or full');
  const operatorIdentity = process.env.MCP_AUDIT_OPERATOR?.trim() || undefined;
  const basePath = (process.env.MCP_AUDIT_PATH?.trim() || join(homedir(), '.mcp-audit'));
  const rotation = readRotation();

  return { level, client, operatorIdentity, basePath, rotation, environmentType: 'production' };
}

function readLevel(): AuditLevel {
  const raw = process.env.MCP_AUDIT_LEVEL?.trim().toLowerCase();
  // No env var → audit subsystem stays off. Existing configs that never set
  // MCP_AUDIT_LEVEL continue to work; the pipeline returns null and tool
  // wrappers no-op.
  if (!raw) return 'off';
  if (!(VALID_LEVELS as ReadonlyArray<string>).includes(raw)) {
    throw new AuditRefuseToStartError(
      `Audit refused to start: MCP_AUDIT_LEVEL='${raw}' is invalid. ` +
        `Must be one of: ${VALID_LEVELS.join(', ')}.`
    );
  }
  return raw as AuditLevel;
}

function requireEnv(name: string, ctx: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new AuditRefuseToStartError(
      `Audit refused to start: ${name} is required ${ctx}.`
    );
  }
  return v;
}

function readRotation(): AuditRotation {
  const raw = process.env.MCP_AUDIT_ROTATION?.trim().toLowerCase();
  if (!raw) return 'monthly';
  if (raw === 'monthly' || raw === 'weekly' || raw === 'daily') return raw;
  const sizeMatch = /^size:(\d+)(kb|mb|gb)$/.exec(raw);
  if (sizeMatch) {
    const n = Number(sizeMatch[1]);
    const unit = sizeMatch[2];
    const factor = unit === 'kb' ? 1024 : unit === 'mb' ? 1024 * 1024 : 1024 * 1024 * 1024;
    return { sizeBytes: n * factor };
  }
  throw new AuditRefuseToStartError(
    `Audit refused to start: MCP_AUDIT_ROTATION='${raw}' is invalid. ` +
      `Must be one of: monthly, weekly, daily, size:<N>KB|MB|GB.`
  );
}
