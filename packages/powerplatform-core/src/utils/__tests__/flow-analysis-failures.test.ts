/**
 * The four flow-analysis utilities that answered "nothing found" when they meant
 * "the scan crashed".
 *
 * Each of `extractComplexityFactors`, `extractComplexityFlags`,
 * `extractUrlsFromFlowDefinition` and `detectHardcodedSecrets` wrapped its whole body
 * in a bare `catch {}` and returned whatever it had collected so far. A malformed or
 * cyclic definition therefore produced a zeroed breakdown, an all-false flag set, an
 * empty URL list or an empty secret-warning list - each byte-for-byte identical to the
 * honest answer for a simple flow that genuinely has none of those things.
 *
 * `detectHardcodedSecrets` is the one that costs most: a crashed scanner reported a
 * flow as carrying no hardcoded credentials.
 *
 * These are not truncation and not a fan-out. Nothing was capped and nothing was
 * iterated over per item - the whole analysis failed. So the failure propagates to the
 * caller, which is `IntegrationAuditService.analyseOneFlow`, and is declared there
 * against the flow it belongs to. See the companion test
 * `IntegrationAuditService.analysisFailures.test.ts`.
 *
 * Every test is a PAIR: the crashed result and the genuinely-empty result must not be
 * equal. Asserting only that the crashed case is empty passes against the broken code.
 */

import { describe, it, expect } from 'vitest';
import {
  extractComplexityFactors,
  extractComplexityFlags,
} from '../complexity-calculator.js';
import {
  extractUrlsFromFlowDefinition,
  detectHardcodedSecrets,
} from '../flow-url-extractor.js';

/** Wrap actions in the `properties.definition` envelope every extractor expects. */
const withActions = (actions: Record<string, unknown>) => ({
  properties: { definition: { actions } },
});

/** A flow that genuinely has nothing to find: one action, no URL, no secret. */
const emptyButHonest = withActions({
  Compose_a_constant: { type: 'Compose', inputs: { value: 'ok' } },
});

/**
 * A null action. Dataverse `clientdata` is author-controlled JSON, so a null where an
 * action object is expected is malformed input rather than a hypothetical.
 */
const nullAction = withActions({ Broken_action: null });

/** An action whose `actions` collection contains itself. */
function cyclicActions(): Record<string, unknown> {
  const action: Record<string, unknown> = { type: 'Scope' };
  action.actions = { Inner: action };
  return withActions({ Outer: action });
}

/** An action whose `inputs` object contains itself. */
function cyclicInputs(): Record<string, unknown> {
  const inputs: Record<string, unknown> = { headers: {} };
  (inputs.headers as Record<string, unknown>).self = inputs;
  return withActions({ Call_service: { type: 'Http', inputs } });
}

describe('extractComplexityFactors', () => {
  it('does not report a crashed parse as a flow with no complexity', () => {
    const honest = extractComplexityFactors(emptyButHonest);

    expect(honest.actionCount).toBe(1);
    expect(() => extractComplexityFactors(nullAction)).toThrow();
  });
});

describe('extractComplexityFlags', () => {
  it('does not report a crashed parse as a flow with no external trigger', () => {
    const honest = extractComplexityFlags(
      { properties: { definition: { triggers: { daily: { type: 'Recurrence' } } } } },
      extractComplexityFactors(emptyButHonest)
    );

    expect(honest.hasExternalTrigger).toBe(false);
    expect(() =>
      extractComplexityFlags(
        { properties: { definition: { triggers: { manual: null } } } },
        extractComplexityFactors(emptyButHonest)
      )
    ).toThrow();
  });
});

describe('extractUrlsFromFlowDefinition', () => {
  it('does not report a crashed traversal as a flow with no URLs', () => {
    expect(extractUrlsFromFlowDefinition(emptyButHonest)).toEqual([]);
    expect(() => extractUrlsFromFlowDefinition(cyclicActions())).toThrow();
  });
});

describe('detectHardcodedSecrets', () => {
  it('does not report a crashed scan as a flow with no hardcoded secrets', () => {
    expect(detectHardcodedSecrets(emptyButHonest)).toEqual([]);
    expect(() => detectHardcodedSecrets(cyclicInputs())).toThrow();
  });
});
