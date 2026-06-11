import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { collectOpRefGroups, warmGroups } from '../warm-secrets.js';

// Capture what resolveSecrets "sees" in process.env on each invocation, so we
// can assert the driver injects the right refs + OP_ACCOUNT per group.
const { calls } = vi.hoisted(() => ({
  calls: [] as Array<{ refs: string[]; account: string | undefined }>,
}));

vi.mock('../secret-resolver.js', () => ({
  resolveSecrets: vi.fn(async () => {
    const refs = Object.values(process.env)
      .filter((v): v is string => typeof v === 'string' && v.startsWith('op://'))
      .sort();
    calls.push({ refs, account: process.env.OP_ACCOUNT });
  }),
  isOpCliAvailable: vi.fn(async () => true),
}));

describe('collectOpRefGroups', () => {
  it('returns [] when there are no servers', () => {
    expect(collectOpRefGroups({})).toEqual([]);
    expect(collectOpRefGroups({ mcpServers: {} })).toEqual([]);
    expect(collectOpRefGroups(null)).toEqual([]);
  });

  it('extracts a single op:// ref with no OP_ACCOUNT as an undefined-account group', () => {
    const cfg = {
      mcpServers: {
        ado: { command: 'node', env: { AZUREDEVOPS_PAT: 'op://Example/ado/password' } },
      },
    };
    expect(collectOpRefGroups(cfg)).toEqual([
      { account: undefined, refs: ['op://Example/ado/password'] },
    ]);
  });

  it('ignores env values that are not op:// references', () => {
    const cfg = {
      mcpServers: {
        ado: {
          env: {
            AZUREDEVOPS_PAT: 'op://Example/ado/password',
            AZUREDEVOPS_ORG: 'https://dev.azure.com/foo',
            LOG_LEVEL: 'info',
          },
        },
      },
    };
    expect(collectOpRefGroups(cfg)).toEqual([
      { account: undefined, refs: ['op://Example/ado/password'] },
    ]);
  });

  it('dedupes identical refs shared across servers in the same account group', () => {
    const cfg = {
      mcpServers: {
        a: { env: { TOK: 'op://Example/shared/password' } },
        b: { env: { TOK: 'op://Example/shared/password' } },
      },
    };
    expect(collectOpRefGroups(cfg)).toEqual([
      { account: undefined, refs: ['op://Example/shared/password'] },
    ]);
  });

  it('groups distinct refs that share an explicit OP_ACCOUNT', () => {
    const cfg = {
      mcpServers: {
        a: { env: { OP_ACCOUNT: 'acme.1password.eu', T1: 'op://V/a/password' } },
        b: { env: { OP_ACCOUNT: 'acme.1password.eu', T2: 'op://V/b/password' } },
      },
    };
    const groups = collectOpRefGroups(cfg);
    expect(groups).toHaveLength(1);
    expect(groups[0].account).toBe('acme.1password.eu');
    expect(groups[0].refs.sort()).toEqual(['op://V/a/password', 'op://V/b/password']);
  });

  it('splits refs into separate groups per distinct OP_ACCOUNT', () => {
    const cfg = {
      mcpServers: {
        a: { env: { OP_ACCOUNT: 'acct1', T1: 'op://V/a/password' } },
        b: { env: { OP_ACCOUNT: 'acct2', T2: 'op://V/b/password' } },
        c: { env: { T3: 'op://V/c/password' } }, // no account → its own group
      },
    };
    const groups = collectOpRefGroups(cfg);
    expect(groups).toHaveLength(3);
    const byAccount = Object.fromEntries(groups.map((g) => [g.account ?? '<default>', g.refs]));
    expect(byAccount.acct1).toEqual(['op://V/a/password']);
    expect(byAccount.acct2).toEqual(['op://V/b/password']);
    expect(byAccount['<default>']).toEqual(['op://V/c/password']);
  });

  it('skips servers without an env block', () => {
    const cfg = {
      mcpServers: {
        a: { command: 'node' },
        b: { env: { TOK: 'op://Example/x/password' } },
      },
    };
    expect(collectOpRefGroups(cfg)).toEqual([
      { account: undefined, refs: ['op://Example/x/password'] },
    ]);
  });
});

describe('warmGroups', () => {
  const savedAccount = process.env.OP_ACCOUNT;

  beforeEach(() => {
    calls.length = 0;
    delete process.env.OP_ACCOUNT;
  });

  afterEach(() => {
    if (savedAccount === undefined) delete process.env.OP_ACCOUNT;
    else process.env.OP_ACCOUNT = savedAccount;
    // Ensure no temp keys leaked.
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('__WARM_OP_')) delete process.env[k];
    }
  });

  it('invokes resolveSecrets once per group with that group\'s refs visible', async () => {
    await warmGroups([
      { account: undefined, refs: ['op://V/a/password', 'op://V/b/password'] },
      { account: 'acct2', refs: ['op://V/c/password'] },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      refs: ['op://V/a/password', 'op://V/b/password'],
      account: undefined,
    });
    expect(calls[1]).toEqual({ refs: ['op://V/c/password'], account: 'acct2' });
  });

  it('cleans up temp keys and restores OP_ACCOUNT after running', async () => {
    process.env.OP_ACCOUNT = 'preexisting';
    await warmGroups([{ account: 'acct2', refs: ['op://V/c/password'] }]);

    expect(process.env.OP_ACCOUNT).toBe('preexisting');
    const leaked = Object.keys(process.env).filter((k) => k.startsWith('__WARM_OP_'));
    expect(leaked).toEqual([]);
  });

  it('does nothing (no resolveSecrets calls) for an empty group list', async () => {
    await warmGroups([]);
    expect(calls).toHaveLength(0);
  });
});
