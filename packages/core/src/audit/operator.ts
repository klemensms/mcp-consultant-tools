import { hostname, userInfo } from 'node:os';
import type { AuditOperator } from './types.js';

export function captureOperator(): AuditOperator {
  const username = safeUsername();
  const host = safeHostname();
  const fingerprint = `${username}@${host}`;

  const identityRaw = process.env.MCP_AUDIT_OPERATOR?.trim();
  const identity = identityRaw && identityRaw.length > 0 ? identityRaw : undefined;

  return { fingerprint, identity };
}

function safeUsername(): string {
  try {
    return userInfo().username || 'unknown-user';
  } catch {
    return 'unknown-user';
  }
}

function safeHostname(): string {
  try {
    return hostname() || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}
