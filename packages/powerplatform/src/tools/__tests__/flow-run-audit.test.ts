/**
 * get-flow-runs and get-flow-run-details moved here from powerplatform-data
 * with their audit logging. Off by default: with MCP_AUDIT_LEVEL unset the
 * server starts as before and nothing is written. With a level set, each call
 * is recorded, and refused until set-audit-engagement has run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServiceContext } from '../../context-factory.js';
import { registerFlowTools } from '../flow-tools.js';
import { registerAuditTools } from '../audit-tools.js';

const VARS = ['MCP_AUDIT_LEVEL', 'MCP_AUDIT_CLIENT', 'MCP_AUDIT_PATH'];
let auditDir: string;

const fakePp = {
  getFlowRuns: async () => ({ runs: [{ runId: 'R1', status: 'Succeeded' }, { runId: 'R2', status: 'Failed' }], totalCount: 2, hasMore: false, filterApplied: {} }),
  getFlowRunDetails: async () => ({ status: 'Succeeded', actions: {}, actionsSummary: { total: 0 } }),
};

function setup() {
  const ctx = createServiceContext(fakePp as any);
  const handlers: Record<string, (args: any) => Promise<any>> = {};
  const server = { tool: (name: string, ...rest: any[]) => { handlers[name] = rest[rest.length - 1]; } };
  registerFlowTools(server, ctx);
  registerAuditTools(server, ctx);
  return { ctx, handlers };
}

function auditText(): string {
  if (!fs.existsSync(auditDir)) return '';
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(auditDir);
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

beforeEach(() => {
  auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-audit-'));
  for (const name of VARS) delete process.env[name];
});

afterEach(() => {
  for (const name of VARS) delete process.env[name];
  fs.rmSync(auditDir, { recursive: true, force: true });
});

describe('audit off (the default)', () => {
  it('has no audit log and serves both tools without writing anything', async () => {
    process.env.MCP_AUDIT_PATH = auditDir;
    const { ctx, handlers } = setup();
    expect(ctx.audit).toBeNull();
    expect((await handlers['get-flow-runs']({ flowId: 'F1' })).isError).toBeFalsy();
    expect((await handlers['get-flow-run-details']({ flowId: 'F1', runId: 'R1' })).isError).toBeFalsy();
    expect(auditText()).toBe('');
  });
});

describe('audit on', () => {
  beforeEach(() => {
    process.env.MCP_AUDIT_LEVEL = 'lean';
    process.env.MCP_AUDIT_CLIENT = 'contoso';
    process.env.MCP_AUDIT_PATH = auditDir;
  });

  it('refuses to start without MCP_AUDIT_CLIENT, as powerplatform-data does', () => {
    delete process.env.MCP_AUDIT_CLIENT;
    expect(() => setup()).toThrow(/MCP_AUDIT_CLIENT/);
  });

  it('refuses a flow-run read until an engagement is set', async () => {
    const { handlers } = setup();
    const result = await handlers['get-flow-runs']({ flowId: 'F1' });
    expect(result.content[0].text).toMatch(/engagement/i);
  });

  it('records both tools once an engagement is set', async () => {
    const { handlers } = setup();
    expect((await handlers['set-audit-engagement']({ workItemIds: ['1234'] })).isError).toBeFalsy();
    expect((await handlers['get-flow-runs']({ flowId: 'F1', status: 'Failed' })).isError).toBeFalsy();
    expect((await handlers['get-flow-run-details']({ flowId: 'F1', runId: 'R1' })).isError).toBeFalsy();
    const text = auditText();
    expect(text).toContain('get-flow-runs');
    expect(text).toContain('get-flow-run-details');
    expect(text).toContain('1234');
  });
});
