import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPiiPipelineFromEnv } from '../pipeline.js';

const ENV_KEYS = [
  'PII_PROTECTION',
  'PII_CONFIG_PATH',
  'PII_SESSION_SALT',
  'PII_OBSERVE_MODE',
  'PII_NONPROD_HINTS',
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

describe('createPiiPipelineFromEnv - unprotected-environment warning', () => {
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    snapshot();
    for (const k of ENV_KEYS) delete process.env[k];
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderr.mockRestore();
    restore();
  });

  function warnings(): string[] {
    return stderr.mock.calls.map((args) => String(args[0]));
  }

  it('warns when protection is off and the identifier matches no non-prod hint', () => {
    createPiiPipelineFromEnv({
      environmentIdentifier: 'https://contoso.crm4.dynamics.com',
    });
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('[PII WARNING]');
    expect(warnings()[0]).toContain('https://contoso.crm4.dynamics.com');
  });

  it('stays silent when the identifier carries a non-prod hint', () => {
    createPiiPipelineFromEnv({
      environmentIdentifier: 'https://contoso-dev.crm4.dynamics.com',
    });
    expect(warnings()).toHaveLength(0);
  });

  it('stays silent when PII protection is enabled', () => {
    process.env.PII_PROTECTION = 'true';
    createPiiPipelineFromEnv({
      environmentIdentifier: 'https://contoso.crm4.dynamics.com',
    });
    expect(warnings()).toHaveLength(0);
  });

  it('stays silent when no environment identifier is supplied', () => {
    createPiiPipelineFromEnv();
    createPiiPipelineFromEnv({});
    createPiiPipelineFromEnv({ environmentIdentifier: '   ' });
    expect(warnings()).toHaveLength(0);
  });

  it('honours PII_NONPROD_HINTS when deciding whether to warn', () => {
    process.env.PII_NONPROD_HINTS = 'staging,scratch';
    createPiiPipelineFromEnv({ environmentIdentifier: 'contoso-staging' });
    expect(warnings()).toHaveLength(0);

    createPiiPipelineFromEnv({ environmentIdentifier: 'contoso-dev' });
    expect(warnings()).toHaveLength(1);
  });

  it('does not advise setting MCP_ENVIRONMENT_TYPE, which controls nothing', () => {
    createPiiPipelineFromEnv({ environmentIdentifier: 'contoso' });
    expect(warnings()[0]).not.toContain('MCP_ENVIRONMENT_TYPE');
    expect(warnings()[0]).toContain('PII_PROTECTION=true');
  });

  it('returns a working pipeline regardless of whether it warned', () => {
    const pipeline = createPiiPipelineFromEnv({
      environmentIdentifier: 'contoso',
    });
    expect(pipeline.isEnabled).toBe(false);
    expect(warnings()).toHaveLength(1);
  });
});
