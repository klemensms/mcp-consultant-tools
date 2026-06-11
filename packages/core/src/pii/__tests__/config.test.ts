import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPiiConfig, PiiRefuseToStartError } from '../config.js';

const ENV_KEYS = [
  'PII_PROTECTION',
  'PII_CONFIG_PATH',
  'PII_SESSION_SALT',
  'PII_OBSERVE_MODE',
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

let tmpDir: string;

function writeConfig(filename: string, content: unknown): string {
  const path = join(tmpDir, filename);
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe('loadPiiConfig — single key per entity', () => {
  beforeEach(() => {
    snapshot();
    tmpDir = mkdtempSync(join(tmpdir(), 'pii-config-test-'));
    process.env.MCP_ENVIRONMENT_TYPE = 'uat';
    process.env.PII_PROTECTION = 'true';
  });
  afterEach(() => {
    restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lowercases redactInResponse field names at load', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: {
          redactInResponse: ['FirstName', 'LASTNAME', 'mixedCASE'],
          excludeFromSelect: [],
        },
      },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contact.redactInResponse).toEqual([
      'firstname',
      'lastname',
      'mixedcase',
    ]);
  });

  it('lowercases excludeFromSelect field names at load', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: {
          redactInResponse: [],
          excludeFromSelect: ['FirstName', 'LASTNAME'],
        },
      },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contact.excludeFromSelect).toEqual([
      'firstname',
      'lastname',
    ]);
  });

  it('expands singular key — plural form resolves to the same rule', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: {
          redactInResponse: ['firstname', 'si_addressee'],
          excludeFromSelect: [],
        },
      },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contact.redactInResponse).toEqual([
      'firstname',
      'si_addressee',
    ]);
    expect(config.fieldRules.contacts.redactInResponse).toEqual([
      'firstname',
      'si_addressee',
    ]);
  });

  it('expands plural key — singular form resolves to the same rule', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contacts: {
          redactInResponse: ['firstname', 'si_addressee'],
          excludeFromSelect: [],
        },
      },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contacts.redactInResponse).toEqual([
      'firstname',
      'si_addressee',
    ]);
    expect(config.fieldRules.contact.redactInResponse).toEqual([
      'firstname',
      'si_addressee',
    ]);
  });

  it('silently dedups when both forms are present with identical lists', () => {
    const fields = {
      redactInResponse: ['firstname', 'lastname'],
      excludeFromSelect: [],
    };
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: { contact: fields, contacts: fields },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contact.redactInResponse).toEqual([
      'firstname',
      'lastname',
    ]);
    expect(config.fieldRules.contacts.redactInResponse).toEqual([
      'firstname',
      'lastname',
    ]);
  });

  it('treats case-only differences as identical (not divergent)', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: {
          redactInResponse: ['firstname', 'LASTNAME'],
          excludeFromSelect: [],
        },
        contacts: {
          redactInResponse: ['FirstName', 'lastname'],
          excludeFromSelect: [],
        },
      },
    });
    const { config } = loadPiiConfig();
    expect([...config.fieldRules.contact.redactInResponse].sort()).toEqual([
      'firstname',
      'lastname',
    ]);
  });

  it('refuses to start when both forms are present with divergent redactInResponse', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: { redactInResponse: ['firstname'], excludeFromSelect: [] },
        contacts: {
          redactInResponse: ['firstname', 'si_addressee'],
          excludeFromSelect: [],
        },
      },
    });
    expect(() => loadPiiConfig()).toThrow(PiiRefuseToStartError);
    let captured: Error | undefined;
    try {
      loadPiiConfig();
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).toBeDefined();
    const msg = captured!.message;
    expect(msg).toContain("'contact'");
    expect(msg).toContain("'contacts'");
    expect(msg).toContain('si_addressee');
  });

  it('refuses to start when both forms are present with divergent excludeFromSelect', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: {
          redactInResponse: [],
          excludeFromSelect: ['address1_line1'],
        },
        contacts: { redactInResponse: [], excludeFromSelect: [] },
      },
    });
    expect(() => loadPiiConfig()).toThrow(PiiRefuseToStartError);
  });

  it('expands defaults — pure-defaults path resolves both singular and plural lookups', () => {
    delete process.env.PII_CONFIG_PATH;
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contact).toBeDefined();
    expect(config.fieldRules.contacts).toBeDefined();
    expect(config.fieldRules.contact).toEqual(config.fieldRules.contacts);
    expect(config.fieldRules.account).toBeDefined();
    expect(config.fieldRules.accounts).toBeDefined();
    expect(config.fieldRules.lead).toBeDefined();
    expect(config.fieldRules.leads).toBeDefined();
  });

  it('handles hyphenated keys (b2c-user) with harmless dead-alias expansion', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        'b2c-user': {
          redactInResponse: ['givenname'],
          excludeFromSelect: [],
        },
      },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules['b2c-user'].redactInResponse).toEqual([
      'givenname',
    ]);
    expect(config.fieldRules['b2c-users'].redactInResponse).toEqual([
      'givenname',
    ]);
  });

  it('preserves independent entities — partner expansion does not collide across entities', () => {
    process.env.PII_CONFIG_PATH = writeConfig('cfg.json', {
      enabled: true,
      fieldRules: {
        contact: { redactInResponse: ['firstname'], excludeFromSelect: [] },
        account: { redactInResponse: ['emailaddress1'], excludeFromSelect: [] },
      },
    });
    const { config } = loadPiiConfig();
    expect(config.fieldRules.contact.redactInResponse).toEqual(['firstname']);
    expect(config.fieldRules.contacts.redactInResponse).toEqual(['firstname']);
    expect(config.fieldRules.account.redactInResponse).toEqual([
      'emailaddress1',
    ]);
    expect(config.fieldRules.accounts.redactInResponse).toEqual([
      'emailaddress1',
    ]);
  });
});

describe('loadPiiConfig — backwards-compatible defaults', () => {
  beforeEach(() => {
    snapshot();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(restore);

  it('defaults to disabled when no env vars are set', () => {
    const { config } = loadPiiConfig();
    expect(config.enabled).toBe(false);
  });

  it('enables when PII_PROTECTION=true', () => {
    process.env.PII_PROTECTION = 'true';
    const { config } = loadPiiConfig();
    expect(config.enabled).toBe(true);
  });

  it('does not throw when MCP_ENVIRONMENT_TYPE is unset (no env-aware gating)', () => {
    delete process.env.MCP_ENVIRONMENT_TYPE;
    expect(() => loadPiiConfig()).not.toThrow();
  });

  it('does not throw when MCP_ENVIRONMENT_TYPE is set to an unknown value (no validation)', () => {
    process.env.MCP_ENVIRONMENT_TYPE = 'whatever';
    expect(() => loadPiiConfig()).not.toThrow();
  });

  it('respects file config enabled flag even when PII_PROTECTION is unset', () => {
    const path = (() => {
      const tmpDir2 = mkdtempSync(join(tmpdir(), 'pii-config-test-'));
      const p = join(tmpDir2, 'cfg.json');
      writeFileSync(p, JSON.stringify({ enabled: true }));
      return p;
    })();
    process.env.PII_CONFIG_PATH = path;
    const { config } = loadPiiConfig();
    expect(config.enabled).toBe(true);
  });
});
