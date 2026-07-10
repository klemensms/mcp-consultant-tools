import { describe, it, expect } from 'vitest';
import {
  compareVariables,
  parseEnvironment,
  summariseVariables,
  DEFAULT_ENVIRONMENT_SUFFIXES,
  type RawVariableGroup,
} from '../variable-group-compare.js';

const group = (id: number, name: string, variables: RawVariableGroup['variables']): RawVariableGroup => ({
  id,
  name,
  type: 'Vsts',
  variables,
});

describe('compareVariables — secret boundary', () => {
  it('never emits a secret value, even if the API wrongly returns one', () => {
    // Azure DevOps nulls secret values server-side. We must not depend on that:
    // if a value ever arrives, it must still not reach the output.
    const a = group(1, 'app-dev', {
      deployToken: { value: 'hunter2-SECRET-A', isSecret: true },
      region: { value: 'westeurope' },
    });
    const b = group(2, 'app-prod', {
      deployToken: { value: 'hunter2-SECRET-B', isSecret: true },
      region: { value: 'northeurope' },
    });

    const result = compareVariables(a, b);
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain('hunter2-SECRET-A');
    expect(serialised).not.toContain('hunter2-SECRET-B');
    expect(result.secretsSkipped).toEqual(['deployToken']);
  });

  it('does not report two different secrets as identical', () => {
    // The pre-existing get-variable-group masks secrets to '***SECRET***'.
    // Diffing masked values would make every pair of secrets compare equal.
    const a = group(1, 'a', { token: { value: null, isSecret: true } });
    const b = group(2, 'b', { token: { value: null, isSecret: true } });

    const result = compareVariables(a, b);

    expect(result.valueDifferences).toEqual([]);
    expect(result.secretsSkipped).toEqual(['token']);
    expect(result.inBothCount).toBe(1);
  });

  it('flags a variable that is secret on one side and plaintext on the other', () => {
    const a = group(1, 'a', { token: { value: 'plaintext-oops', isSecret: false } });
    const b = group(2, 'b', { token: { value: null, isSecret: true } });

    const result = compareVariables(a, b);

    expect(result.secretPresenceDifferences).toEqual([
      { name: 'token', isSecretInA: false, isSecretInB: true },
    ]);
    // Still skipped for value comparison, and the plaintext value never escapes.
    expect(result.secretsSkipped).toEqual(['token']);
    expect(JSON.stringify(result)).not.toContain('plaintext-oops');
  });

  it('reports value differences for non-secret variables', () => {
    const a = group(1, 'a', { region: { value: 'westeurope' }, shared: { value: 'same' } });
    const b = group(2, 'b', { region: { value: 'northeurope' }, shared: { value: 'same' } });

    const result = compareVariables(a, b);

    expect(result.valueDifferences).toEqual([
      { name: 'region', valueInA: 'westeurope', valueInB: 'northeurope' },
    ]);
    expect(result.inBothCount).toBe(2);
  });

  it('partitions variables present on only one side', () => {
    const a = group(1, 'a', { onlyA: { value: '1' }, shared: { value: 'x' } });
    const b = group(2, 'b', { onlyB: { value: '2' }, shared: { value: 'x' } });

    const result = compareVariables(a, b);

    expect(result.onlyInA).toEqual(['onlyA']);
    expect(result.onlyInB).toEqual(['onlyB']);
  });

  it('treats a missing isSecret flag as non-secret (the API omits it entirely)', () => {
    const a = group(1, 'a', { plain: { value: 'v1' } });
    const b = group(2, 'b', { plain: { value: 'v2' } });

    const result = compareVariables(a, b);

    expect(result.secretsSkipped).toEqual([]);
    expect(result.valueDifferences).toHaveLength(1);
  });
});

describe('summariseVariables', () => {
  it('counts secrets without enumerating their values', () => {
    const summary = summariseVariables({
      a: { value: 'plain' },
      b: { value: null, isSecret: true },
      c: { value: null, isSecret: true },
    });

    expect(summary).toEqual({ variableCount: 3, secretCount: 2 });
  });

  it('reports zero for a group with no variables', () => {
    expect(summariseVariables(undefined)).toEqual({ variableCount: 0, secretCount: 0 });
  });
});

describe('parseEnvironment', () => {
  it('matches the default suffixes case-insensitively', () => {
    expect(parseEnvironment('billing-DEV', DEFAULT_ENVIRONMENT_SUFFIXES)).toEqual({
      baseName: 'billing',
      environment: 'dev',
    });
  });

  it('prefers the longest matching suffix', () => {
    // '-production' must win over '-prod' would-be partial confusion.
    expect(parseEnvironment('billing-production', DEFAULT_ENVIRONMENT_SUFFIXES)).toEqual({
      baseName: 'billing',
      environment: 'production',
    });
  });

  it('returns null when no suffix matches', () => {
    expect(parseEnvironment('billing-prd', DEFAULT_ENVIRONMENT_SUFFIXES)).toBeNull();
  });

  it('honours caller-supplied suffixes, so an unusual convention still matches', () => {
    // The si source hardcoded 9 suffixes; '-prd' matched zero groups forever.
    expect(parseEnvironment('billing-prd', ['-prd'])).toEqual({
      baseName: 'billing',
      environment: 'prd',
    });
  });

  it('does not treat the whole name as a suffix match', () => {
    expect(parseEnvironment('-dev', DEFAULT_ENVIRONMENT_SUFFIXES)).toBeNull();
  });
});
