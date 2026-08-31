/**
 * The entity cap `validateBestPractices` applied without telling anyone.
 *
 * The solution-scoped path enumerates every component, then slices the list down to
 * `maxEntities` and discards the surplus. Nothing in the returned shape recorded that a
 * cap was hit, so a pass over the first N tables of a large solution was byte-for-byte
 * indistinguishable from one that covered the whole solution. The `fanOut` blocks do not
 * cover it: a capped entity was never attempted, so it is not a failure.
 *
 * Each test is a PAIR at the same visible count, because the count is what a reader quotes.
 */

import { describe, it, expect } from 'vitest';
import { ValidationService } from '../ValidationService.js';
import {
  formatBestPracticesReport,
  formatQuickSummary,
  validationFanOutSuffix,
} from '../../utils/best-practices-formatters.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const PREFIX = 'contoso_';

const guid = (i: number) =>
  `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`;

function stubClient(entities: string[]) {
  const metadataIdOf = (name: string) => guid(entities.indexOf(name) + 1);

  return {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      if (endpoint.startsWith('api/data/v9.2/solutions?')) {
        return {
          value: [
            {
              solutionid: guid(900),
              friendlyname: 'Contoso Core',
              uniquename: 'contoso_core',
            },
          ],
        } as T;
      }

      if (endpoint.startsWith('api/data/v9.2/solutioncomponents?')) {
        return {
          value: entities.map((name) => ({ objectid: metadataIdOf(name) })),
        } as T;
      }

      if (/EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes\?/.test(endpoint)) {
        return { value: [] } as T;
      }

      const byLogical = endpoint.match(/EntityDefinitions\(LogicalName='([^']+)'\)\?/);
      if (byLogical) {
        return {
          LogicalName: byLogical[1],
          SchemaName: byLogical[1],
          MetadataId: metadataIdOf(byLogical[1]),
          DisplayName: { UserLocalizedLabel: { Label: byLogical[1] } },
          IconVectorName: 'contoso_icon.svg',
          IsCustomEntity: true,
        } as T;
      }

      const byMetadataId = endpoint.match(/EntityDefinitions\(([^)']+)\)\?/);
      if (byMetadataId) {
        const name = entities.find((e) => metadataIdOf(e) === byMetadataId[1]);
        if (!name) throw new Error('Unknown metadata id');
        return { LogicalName: name, SchemaName: name } as T;
      }

      throw new Error(`Unstubbed endpoint: ${endpoint}`);
    },
  } as unknown as PowerPlatformClient;
}

const validate = (client: PowerPlatformClient, maxEntities: number) =>
  new ValidationService(client).validateBestPractices(
    'contoso_core',
    undefined,
    PREFIX,
    0,
    true,
    ['entity-icon'],
    maxEntities
  );

const names = (n: number) =>
  Array.from({ length: n }, (_, i) => `${PREFIX}table${i + 1}`);

describe('ValidationService.validateBestPractices entity cap', () => {
  it('reports a capped pass differently from a complete one at the same count', async () => {
    const capped = await validate(stubClient(names(5)), 2);
    const complete = await validate(stubClient(names(2)), 0);

    // Both checked two entities. Only one of them left three behind.
    expect(capped.summary.entitiesChecked).toBe(2);
    expect(complete.summary.entitiesChecked).toBe(2);
    expect(capped.truncation).not.toEqual(complete.truncation);

    expect(capped.truncation.hasMore).toBe(true);
    expect(capped.truncation.truncationReason).toBe('requestedMax');
    expect(capped.truncation.returnedCount).toBe(2);
    expect(capped.truncation.requestedMax).toBe(2);

    expect(complete.truncation.hasMore).toBe(false);
    expect(complete.truncation.truncationReason).toBeNull();
  });

  it('reports the real population, because the enumeration finished before the slice', async () => {
    const capped = await validate(stubClient(names(5)), 2);
    expect(capped.truncation.totalAvailable).toBe(5);
  });

  it('does not claim truncation when the cap is never reached', async () => {
    const under = await validate(stubClient(names(3)), 10);
    expect(under.truncation.hasMore).toBe(false);
    expect(under.truncation.returnedCount).toBe(3);
    expect(under.truncation.totalAvailable).toBe(3);
    expect(under.truncation.requestedMax).toBe(10);
  });

  it('treats maxEntities=0 as uncapped rather than as a cap of zero', async () => {
    const uncapped = await validate(stubClient(names(4)), 0);
    expect(uncapped.summary.entitiesChecked).toBe(4);
    expect(uncapped.truncation.hasMore).toBe(false);
    expect(uncapped.truncation.requestedMax).toBeNull();
  });

  it('reports no truncation on the explicit-entity-list path, which applies no cap', async () => {
    const explicit = await new ValidationService(
      stubClient(names(3))
    ).validateBestPractices(undefined, names(3), PREFIX, 0, true, ['entity-icon'], 2);

    expect(explicit.summary.entitiesChecked).toBe(3);
    expect(explicit.truncation.hasMore).toBe(false);
    expect(explicit.truncation.totalAvailable).toBe(3);
  });

  it('says so in the text a reader actually quotes, not only in the payload', async () => {
    const capped = await validate(stubClient(names(5)), 2);
    const complete = await validate(stubClient(names(2)), 0);

    // The suffix is the whole point: it rides on the summary line, which is often all
    // that gets read before someone writes "no violations found" into a report.
    expect(validationFanOutSuffix(complete)).toBe('');
    expect(validationFanOutSuffix(capped)).toContain('capped at 2 of 5 entities');
    expect(validationFanOutSuffix(capped)).toContain('INCOMPLETE');

    expect(formatQuickSummary(capped)).toContain('does not cover the solution');
    expect(formatQuickSummary(complete)).not.toContain('does not cover the solution');

    expect(formatBestPracticesReport(capped)).toContain('Entities not validated (cap)');
    expect(formatBestPracticesReport(complete)).not.toContain(
      'Entities not validated (cap)'
    );
  });
});
