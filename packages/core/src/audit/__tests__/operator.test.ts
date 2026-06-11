import { describe, it, expect, afterEach, vi } from 'vitest';
import { captureOperator } from '../operator.js';

describe('captureOperator', () => {
  const original = process.env.MCP_AUDIT_OPERATOR;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MCP_AUDIT_OPERATOR;
    } else {
      process.env.MCP_AUDIT_OPERATOR = original;
    }
    vi.restoreAllMocks();
  });

  it('falls back to OS fingerprint when MCP_AUDIT_OPERATOR is unset', () => {
    delete process.env.MCP_AUDIT_OPERATOR;
    const op = captureOperator();
    expect(op.fingerprint).toMatch(/^[^@]+@[^@]+$/);
    expect(op.identity).toBeUndefined();
  });

  it('reads MCP_AUDIT_OPERATOR as identity, keeping fingerprint', () => {
    process.env.MCP_AUDIT_OPERATOR = 'jdoe@example.com';
    const op = captureOperator();
    expect(op.identity).toBe('jdoe@example.com');
    expect(op.fingerprint).toMatch(/^[^@]+@[^@]+$/);
  });

  it('trims whitespace and ignores empty MCP_AUDIT_OPERATOR', () => {
    process.env.MCP_AUDIT_OPERATOR = '   ';
    const op = captureOperator();
    expect(op.identity).toBeUndefined();
  });
});
