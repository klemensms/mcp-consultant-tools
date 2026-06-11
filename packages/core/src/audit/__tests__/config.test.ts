import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAuditConfigFromEnv } from '../config.js';
import { AuditRefuseToStartError } from '../errors.js';

const ENV_KEYS = [
  'MCP_AUDIT_LEVEL',
  'MCP_AUDIT_CLIENT',
  'MCP_AUDIT_OPERATOR',
  'MCP_AUDIT_PATH',
  'MCP_AUDIT_ROTATION',
  'MCP_ENVIRONMENT_TYPE',
];

const saved: Record<string, string | undefined> = {};

function snapshot() {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
}

function restore() {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
}

describe('createAuditConfigFromEnv', () => {
  beforeEach(() => {
    snapshot();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(restore);

  it('defaults to level=off when MCP_AUDIT_LEVEL is unset (backwards-compatible)', () => {
    const cfg = createAuditConfigFromEnv();
    expect(cfg.level).toBe('off');
    expect(cfg.client).toBe('');
  });

  it('refuses to start when MCP_AUDIT_LEVEL is invalid', () => {
    process.env.MCP_AUDIT_LEVEL = 'maximum';
    expect(() => createAuditConfigFromEnv()).toThrow(AuditRefuseToStartError);
  });

  it('refuses to start when level=lean and client is unset', () => {
    process.env.MCP_AUDIT_LEVEL = 'lean';
    delete process.env.MCP_AUDIT_CLIENT;
    expect(() => createAuditConfigFromEnv()).toThrow(AuditRefuseToStartError);
  });

  it('returns config with level=off without requiring MCP_ENVIRONMENT_TYPE', () => {
    process.env.MCP_AUDIT_LEVEL = 'off';
    const cfg = createAuditConfigFromEnv();
    expect(cfg.level).toBe('off');
  });

  it('returns lean config with required client', () => {
    process.env.MCP_AUDIT_LEVEL = 'lean';
    process.env.MCP_AUDIT_CLIENT = 'Acme';
    const cfg = createAuditConfigFromEnv();
    expect(cfg.level).toBe('lean');
    expect(cfg.client).toBe('Acme');
    expect(cfg.basePath).toBe(join(homedir(), '.mcp-audit'));
    expect(cfg.rotation).toBe('monthly');
  });

  it('honours MCP_AUDIT_PATH override', () => {
    process.env.MCP_AUDIT_LEVEL = 'lean';
    process.env.MCP_AUDIT_CLIENT = 'Acme';
    process.env.MCP_AUDIT_PATH = '/tmp/custom-audit';
    const cfg = createAuditConfigFromEnv();
    expect(cfg.basePath).toBe('/tmp/custom-audit');
  });

  it('parses MCP_AUDIT_ROTATION=size:100MB', () => {
    process.env.MCP_AUDIT_LEVEL = 'lean';
    process.env.MCP_AUDIT_CLIENT = 'Acme';
    process.env.MCP_AUDIT_ROTATION = 'size:100MB';
    const cfg = createAuditConfigFromEnv();
    expect(cfg.rotation).toEqual({ sizeBytes: 100 * 1024 * 1024 });
  });

  it('rejects bad MCP_AUDIT_ROTATION values', () => {
    process.env.MCP_AUDIT_LEVEL = 'lean';
    process.env.MCP_AUDIT_CLIENT = 'Acme';
    process.env.MCP_AUDIT_ROTATION = 'every-other-tuesday';
    expect(() => createAuditConfigFromEnv()).toThrow(AuditRefuseToStartError);
  });
});
