/**
 * D18, the pricing half: the CLI had no command for `Microsoft.Security/pricings`, and
 * that is the surface which distinguishes "Defender found no attack paths" from
 * "Defender CSPM was never turned on". A measured run reported zero attack paths and
 * zero assessment risk objects across an estate, and neither reading could be settled
 * because nothing in this package could say whether the plan producing them was enabled.
 *
 * The acceptance criterion is the failure case: a subscription on the free tier must not
 * be indistinguishable from one whose CSPM data simply came back empty.
 */

import { describe, it, expect } from 'vitest';
import {
  PricingService,
  CSPM_PLAN_NAME,
  summarisePricings,
  cspmVerdict,
} from '../pricing-service.js';
import type { DefenderClient } from '../../defender-client.js';
import type { SecurityPricing } from '../../models/defender-types.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * `properties` overrides MERGE into the defaults rather than replacing them, so a test
 * that sets one key does not silently blank the rest. The opposite has produced false
 * greens in this package before.
 */
const pricing = (
  name: string,
  overrides: Partial<SecurityPricing['properties']> = {}
): SecurityPricing => ({
  id: `${SUB}/providers/Microsoft.Security/pricings/${name}`,
  name,
  type: 'Microsoft.Security/pricings',
  properties: {
    pricingTier: 'Standard',
    ...overrides,
  },
});

const fakeClient = (value: SecurityPricing[]): DefenderClient =>
  ({
    getSubscriptionId: () => 'SUB',
    subscriptionPath: (suffix: string) => `${SUB}${suffix}`,
    get: async () => ({ value }),
  }) as unknown as DefenderClient;

describe('summarisePricings', () => {
  it('counts the tiers and names which plans are paid', () => {
    const summary = summarisePricings([
      pricing('VirtualMachines'),
      pricing('CloudPosture'),
      pricing('StorageAccounts', { pricingTier: 'Free' }),
    ]);

    expect(summary.total).toBe(3);
    expect(summary.standard).toBe(2);
    expect(summary.free).toBe(1);
    expect(summary.standardPlans).toEqual(['CloudPosture', 'VirtualMachines']);
  });

  it('carries the sub-plan, because two Standard plans are not the same plan', () => {
    const summary = summarisePricings([
      pricing('VirtualMachines', { subPlan: 'P1' }),
      pricing('Containers'),
    ]);

    expect(summary.subPlans).toEqual({ VirtualMachines: 'P1' });
  });
});

describe('cspmVerdict', () => {
  it('says CSPM is enabled when the CloudPosture plan is Standard', () => {
    const verdict = cspmVerdict([pricing(CSPM_PLAN_NAME), pricing('VirtualMachines')]);

    expect(verdict.cspmEnabled).toBe(true);
    expect(verdict.note).toMatch(/enabled/i);
  });

  it('says CSPM is OFF when the CloudPosture plan is Free, and says what that means', () => {
    const verdict = cspmVerdict([pricing(CSPM_PLAN_NAME, { pricingTier: 'Free' })]);

    expect(verdict.cspmEnabled).toBe(false);
    // The whole point of the command: an empty attack-path or risk result is explained,
    // not merely reported.
    expect(verdict.note).toMatch(/attack path/i);
  });

  it('distinguishes "CloudPosture absent from the response" from "CloudPosture is Free"', () => {
    const absent = cspmVerdict([pricing('VirtualMachines')]);
    const free = cspmVerdict([pricing(CSPM_PLAN_NAME, { pricingTier: 'Free' })]);

    expect(absent.cspmEnabled).toBeNull();
    expect(free.cspmEnabled).toBe(false);
    expect(absent.note).not.toBe(free.note);
    expect(absent.note).toMatch(/not present/i);
  });

  it('reports a partially covered subscription rather than a bare enabled', () => {
    const verdict = cspmVerdict([
      pricing(CSPM_PLAN_NAME, { resourcesCoverageStatus: 'PartiallyCovered' }),
    ]);

    expect(verdict.cspmEnabled).toBe(true);
    expect(verdict.note).toMatch(/PartiallyCovered/);
  });
});

describe('PricingService.listPricings', () => {
  it('returns the plans with the CSPM verdict attached', async () => {
    const result = await new PricingService(
      fakeClient([pricing(CSPM_PLAN_NAME), pricing('StorageAccounts', { pricingTier: 'Free' })])
    ).listPricings();

    expect(result.summary.total).toBe(2);
    expect(result.summary.cspmEnabled).toBe(true);
    expect(result.pricings).toHaveLength(2);
  });

  it('an empty response is not reported as "CSPM off"', async () => {
    const result = await new PricingService(fakeClient([])).listPricings();

    expect(result.summary.total).toBe(0);
    expect(result.summary.cspmEnabled).toBeNull();
    expect(result.summary.note).toMatch(/not present/i);
  });
});
