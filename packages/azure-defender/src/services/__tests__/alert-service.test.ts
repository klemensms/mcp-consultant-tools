/**
 * D18, the alerts half: the CLI had no command for `Microsoft.Security` alerts at all.
 * In one measured estate 32 alerts existed, 25 of them Active and clustered on domain
 * controllers, and none was reachable from this package - the most operationally urgent
 * Defender data on the tenant was invisible to every report built from it.
 *
 * `Alerts_List` takes no `$filter`, so every filter here is client-side. That is the
 * whole risk: a filtered count and an empty tenant look identical unless the payload
 * says how many rows arrived before the filter ran.
 *
 * The acceptance criterion is the failure case: a filtered result must not be
 * indistinguishable from an empty one, and a truncated one must not look complete.
 */

import { describe, it, expect } from 'vitest';
import {
  AlertService,
  summariseAlerts,
  filterAlerts,
  mapAlertRow,
} from '../alert-service.js';
import type { DefenderClient } from '../../defender-client.js';
import type { SecurityAlert } from '../../models/defender-types.js';

const SUB = '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * `properties` overrides MERGE into the defaults - a test that sets `status` alone must
 * not blank the severity it is not asserting on.
 */
const alert = (
  name: string,
  overrides: Partial<SecurityAlert['properties']> = {}
): SecurityAlert => ({
  id: `${SUB}/providers/Microsoft.Security/locations/uksouth/alerts/${name}`,
  name,
  type: 'Microsoft.Security/Locations/alerts',
  properties: {
    alertDisplayName: 'Suspicious authentication activity',
    severity: 'High',
    status: 'Active',
    alertType: 'VM_SuspectAuthentication',
    compromisedEntity: 'contoso-dc-01',
    startTimeUtc: '2026-08-01T09:00:00Z',
    timeGeneratedUtc: '2026-08-01T09:05:00Z',
    ...overrides,
  },
});

const fakeClient = (items: SecurityAlert[], truncated = false): DefenderClient =>
  ({
    getSubscriptionId: () => 'SUB',
    subscriptionPath: (suffix: string) => `${SUB}${suffix}`,
    paginate: async () => ({ items, truncated }),
  }) as unknown as DefenderClient;

describe('mapAlertRow', () => {
  it('keeps every property ARM sent, including keys this package does not name', () => {
    const row = alert('a1', {
      techniques: ['T1110'],
      // Not in the mapped set. A fixed allowlist has already thrown away live payload
      // twice in this package, on attack paths and again on assessments.
      someFutureField: 'keep me',
    } as never);

    const mapped = mapAlertRow(row);

    expect(mapped.properties.techniques).toEqual(['T1110']);
    expect((mapped.properties as Record<string, unknown>).someFutureField).toBe('keep me');
  });
});

describe('summariseAlerts', () => {
  it('breaks the count down by status and severity', () => {
    const summary = summariseAlerts(
      [
        alert('a1'),
        alert('a2', { status: 'Resolved' }),
        alert('a3', { severity: 'Medium' }),
        alert('a4', { severity: 'Medium', status: 'Dismissed' }),
      ],
      4,
      false
    );

    expect(summary.total).toBe(4);
    expect(summary.byStatus).toEqual({ Active: 2, Resolved: 1, Dismissed: 1 });
    expect(summary.bySeverity).toEqual({ High: 2, Medium: 2 });
  });

  it('names the entities carrying more than one alert, because clustering is the finding', () => {
    const summary = summariseAlerts(
      [
        alert('a1', { compromisedEntity: 'contoso-dc-01' }),
        alert('a2', { compromisedEntity: 'contoso-dc-01' }),
        alert('a3', { compromisedEntity: 'contoso-web-01' }),
      ],
      3,
      false
    );

    expect(summary.topEntities).toEqual([{ entity: 'contoso-dc-01', alerts: 2 }]);
  });

  it('a filtered result reports what it filtered away', () => {
    const summary = summariseAlerts([alert('a1')], 32, false);

    expect(summary.total).toBe(1);
    expect(summary.matchedOf).toBe(32);
    expect(summary.note).toMatch(/31 of 32/);
  });

  it('says nothing about filtering when nothing was filtered', () => {
    const summary = summariseAlerts([alert('a1')], 1, false);

    expect(summary.note).toBeUndefined();
  });
});

describe('filterAlerts', () => {
  const rows = [
    alert('a1', { status: 'Active', severity: 'High' }),
    alert('a2', { status: 'Resolved', severity: 'High' }),
    alert('a3', { status: 'Active', severity: 'Low' }),
  ];

  it('filters on status and severity together', () => {
    expect(filterAlerts(rows, { status: 'Active', severity: 'High' }).map((a) => a.name)).toEqual([
      'a1',
    ]);
  });

  it('matches case-insensitively, so a lowercase flag value is not a silent empty result', () => {
    expect(filterAlerts(rows, { status: 'active' as never }).map((a) => a.name)).toEqual([
      'a1',
      'a3',
    ]);
  });
});

describe('AlertService.listAlerts', () => {
  it('an empty tenant and a filter that matched nothing are distinguishable', async () => {
    const empty = await new AlertService(fakeClient([])).listAlerts();
    const filteredOut = await new AlertService(
      fakeClient([alert('a1', { severity: 'Low' })])
    ).listAlerts({ severity: 'High' });

    expect(empty.summary.total).toBe(0);
    expect(empty.summary.matchedOf).toBe(0);
    expect(empty.summary.note).toBeUndefined();

    expect(filteredOut.summary.total).toBe(0);
    expect(filteredOut.summary.matchedOf).toBe(1);
    expect(filteredOut.summary.note).toMatch(/1 of 1/);
  });

  it('a truncated fetch is reported, so counts are not read as tenant-wide', async () => {
    const result = await new AlertService(fakeClient([alert('a1')], true)).listAlerts();

    expect(result.truncated).toBe(true);
    expect(result.summary.note).toMatch(/lower bound/i);
  });

  it('maxResults is applied to the FETCH, and the filter runs after it, which is stated', async () => {
    // A client-side filter behind a server-side limit can only ever filter the page it
    // was given. Saying so is the difference between a lower bound and a wrong number.
    const result = await new AlertService(fakeClient([alert('a1')], true)).listAlerts({
      severity: 'High',
      maxResults: 1,
    });

    expect(result.summary.note).toMatch(/before the filter/i);
  });
});
