import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServiceContext } from '../context-factory.js';

/**
 * The CLI builds its ServiceContext at module top level, one line above
 * program.parseAsync, so it runs before Commander can fire the preAction hook
 * that loads --env-file. Anything createServiceContext reads eagerly is
 * therefore read before the operator's env file exists. The PII pipeline was
 * the one eager read; these tests pin it as lazy.
 */

const ENV_KEYS = [
  'PII_PROTECTION',
  'PII_CONFIG_PATH',
  'PII_SESSION_SALT',
  'PII_OBSERVE_MODE',
  'PII_NONPROD_HINTS',
  'AZUREDEVOPS_ORGANIZATION',
  'AZUREDEVOPS_PROJECTS',
  'AZUREDEVOPS_PAT',
];

const saved: Record<string, string | undefined> = {};

describe('createServiceContext - PII pipeline is built lazily', () => {
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.AZUREDEVOPS_ORGANIZATION = 'contoso';
    process.env.AZUREDEVOPS_PROJECTS = 'MyProject';
    process.env.AZUREDEVOPS_PAT = 'not-a-real-token';
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderr.mockRestore();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  });

  function warnings(): string[] {
    return stderr.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.includes('[PII WARNING]'));
  }

  it('reads no PII config while the context is being constructed', () => {
    createServiceContext();
    expect(warnings()).toHaveLength(0);
  });

  it('picks up PII_PROTECTION set after construction, as --env-file does', () => {
    const ctx = createServiceContext();
    process.env.PII_PROTECTION = 'true';
    void ctx.workItem;
    expect(warnings()).toHaveLength(0);
  });

  it('still warns on first service use when protection is genuinely off', () => {
    const ctx = createServiceContext();
    void ctx.workItem;
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('contoso');
  });

  it('builds the pipeline once, however many services are touched', () => {
    const ctx = createServiceContext();
    void ctx.workItem;
    void ctx.sync;
    void ctx.checklist;
    void ctx.test;
    expect(warnings()).toHaveLength(1);
  });
});
