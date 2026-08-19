/**
 * D13 (part 2 of 4): `azure-management` had no command for
 * `Microsoft.Insights/scheduledQueryRules`. In the estate measured, 19 log-search
 * alert rules were invisible, so `monitoring alerts` (which reads
 * `Microsoft.Insights/metricAlerts`, a different provider surface) was the only
 * alerting evidence available and any "alerting gap" finding drawn from it
 * overstated the gap by 19 rules.
 *
 * That makes the failure case for this command a particular one. Adding a list is
 * easy; the trap is that the new count reads as "alerts that will fire", and three
 * different things in the result are not that:
 *
 *  - a rule with `enabled: false` fires nothing;
 *  - a rule of `kind: LogToMetric` emits a metric and does not alert at all;
 *  - a rule with no action groups has nowhere to send an alert it does raise.
 *
 * Counting any of them as coverage is the same fail-towards-a-clean-result the rest
 * of this chain has been closing, so each is counted separately and named in
 * `summary.note`.
 *
 * Settled against the ARM swagger for `Microsoft.Insights/scheduledQueryRules` at
 * api-version 2023-12-01. Neither list operation takes a `detailed`-style
 * parameter, so there is no T14-class request-side loss to guard against here.
 * `properties.isLegacyLogAnalyticsRule` marks a rule that was created through the
 * old `2018-04-16` Log Search Alert v1 API and still shows up on this surface.
 */

import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import { MonitoringService } from '../MonitoringService.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * Extras are spread INSIDE `properties`, never alongside it. A fixture that passes
 * `{ properties: {...} }` as an override replaces the block rather than merging into
 * it, which has produced a false green in this repo before.
 */
const rule = (
  name: string,
  properties: Record<string, unknown> = {},
  kind = 'LogAlert'
) => ({
  id: `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Insights/scheduledQueryRules/${name}`,
  name,
  type: 'Microsoft.Insights/scheduledQueryRules',
  location: 'uksouth',
  kind,
  properties: {
    displayName: name,
    enabled: true,
    severity: 2,
    scopes: [`${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Insights/components/ai-contoso`],
    evaluationFrequency: 'PT5M',
    windowSize: 'PT15M',
    criteria: { allOf: [{ query: 'exceptions | where timestamp > ago(15m)', operator: 'GreaterThan', threshold: 0, timeAggregation: 'Count' }] },
    actions: { actionGroups: [`${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Insights/actionGroups/ag-contoso`] },
    ...properties,
  },
});

function stubClient(rules: unknown[]) {
  const calls: Array<{ path: string; params?: Record<string, string> }> = [];
  const client = {
    paginate: async (path: string, _apiVersion?: string, params?: Record<string, string>) => {
      calls.push({ path, params });
      return rules;
    },
    subscriptionPath: (suffix: string) => `${SUB}${suffix}`,
    resourceGroupPath: (rg: string, suffix: string) => `${SUB}/resourceGroups/${rg}${suffix}`,
    getDefaultResourceGroup: () => 'rg-contoso',
  } as unknown as ArmClient;
  return { client, calls };
}

describe('MonitoringService.listScheduledQueryRules', () => {
  it('reads the scheduledQueryRules surface, not metricAlerts', async () => {
    const { client, calls } = stubClient([rule('sqr-contoso-exceptions')]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(calls[0].path).toBe(`${SUB}/providers/Microsoft.Insights/scheduledQueryRules`);
    expect(result.rules.map((r) => r.name)).toEqual(['sqr-contoso-exceptions']);
    expect(result.summary.total).toBe(1);
  });

  it('a disabled rule is counted apart from an enabled one', async () => {
    const { client } = stubClient([
      rule('sqr-contoso-exceptions'),
      rule('sqr-contoso-latency', { enabled: false }),
    ]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.summary.total).toBe(2);
    expect(result.summary.byEnabled).toEqual({ enabled: 1, disabled: 1 });
    // The number a report should quote as coverage, not the total.
    expect(result.summary.alerting).toBe(1);
    expect(result.summary.note).toMatch(/disabled/i);
  });

  it('a LogToMetric rule is not counted as an alert rule', async () => {
    const { client } = stubClient([
      rule('sqr-contoso-exceptions'),
      // Emits a metric from a log query. It never raises an alert, so counting it
      // as alert coverage overstates the coverage by exactly one rule.
      rule('sqr-contoso-throughput', { criteria: { allOf: [{ query: 'requests | count', metricName: 'contoso-requests' }] } }, 'LogToMetric'),
    ]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.summary.total).toBe(2);
    expect(result.summary.byKind).toEqual({ LogAlert: 1, LogToMetric: 1 });
    expect(result.summary.alerting).toBe(1);
    expect(result.summary.note).toMatch(/LogToMetric/);
  });

  it('a rule with no action group is counted, because it alerts nowhere', async () => {
    const { client } = stubClient([
      rule('sqr-contoso-exceptions'),
      rule('sqr-contoso-orphan', { actions: { actionGroups: [] } }),
      rule('sqr-contoso-noactions', { actions: undefined }),
    ]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.summary.withoutActionGroup).toBe(2);
    expect(result.rules[1].actionGroupIds).toEqual([]);
    expect(result.summary.note).toMatch(/action group/i);
  });

  it('a legacy Log Search v1 rule is flagged rather than blended in', async () => {
    const { client } = stubClient([
      rule('sqr-contoso-exceptions'),
      rule('sqr-contoso-legacy', {
        isLegacyLogAnalyticsRule: true,
        createdWithApiVersion: '2018-04-16',
      }),
    ]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.rules[1].isLegacyLogAnalyticsRule).toBe(true);
    expect(result.summary.legacyRules).toBe(1);
    expect(result.summary.note).toMatch(/legacy/i);
  });

  it('an empty result says which surface was read, so it is not read as no alerts at all', async () => {
    const { client } = stubClient([]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.rules).toEqual([]);
    expect(result.summary.total).toBe(0);
    // The measured failure: 0 here plus a metricAlerts count elsewhere is not the
    // whole alerting picture, and a reader has to be told which half they hold.
    expect(result.summary.note).toMatch(/metricAlerts|metric alert/i);
  });

  it('passes the raw properties block through, including keys it does not name', async () => {
    const { client } = stubClient([
      rule('sqr-contoso-exceptions', { someFieldThisRepoHasNeverHeardOf: { nested: true } }),
    ]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.rules[0].properties).toMatchObject({
      someFieldThisRepoHasNeverHeardOf: { nested: true },
    });
  });

  it('surfaces the query text and severity a triage needs', async () => {
    const { client } = stubClient([rule('sqr-contoso-exceptions', { severity: 1 })]);

    const result = await new MonitoringService(client).listScheduledQueryRules();

    expect(result.rules[0].severity).toBe(1);
    expect(result.rules[0].queries).toEqual(['exceptions | where timestamp > ago(15m)']);
    expect(result.summary.bySeverity).toEqual({ Sev1: 1 });
  });

  it('scopes to a resource group when one is given', async () => {
    const { client, calls } = stubClient([rule('sqr-contoso-exceptions')]);

    await new MonitoringService(client).listScheduledQueryRules({ resourceGroup: 'rg-contoso' });

    expect(calls[0].path).toBe(
      `${SUB}/resourceGroups/rg-contoso/providers/Microsoft.Insights/scheduledQueryRules`
    );
  });
});
