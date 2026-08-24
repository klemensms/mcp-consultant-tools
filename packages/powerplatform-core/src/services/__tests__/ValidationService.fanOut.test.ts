/**
 * The three reads `validateBestPractices` dropped without recording.
 *
 * A validation pass is the worst place for this defect class: "no violations" and "the rule
 * never ran" arrive at the caller as the same answer, and the caller acts on the first
 * reading. All three swallows produced exactly that.
 *
 * 1. Entity discovery (`solutioncomponents` -> `EntityDefinitions(MetadataId)`) dropped any
 *    entity whose metadata could not be read. The comment said "managed/system entities",
 *    but a 403 looks identical to a managed entity from inside the catch.
 * 2. The per-entity metadata and attribute reads dropped the whole entity, so
 *    `summary.entitiesChecked` under-reported with nothing to show it had.
 * 3. The option-set scope lookup dropped the failure, so an attribute whose option set
 *    could not be read never fired the rule and the entity came back compliant.
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

/** An in-window custom picklist attribute, so the option-set rule reaches its lookup. */
const picklistAttribute = (name: string) => ({
  LogicalName: name,
  AttributeType: 'Picklist',
  AttributeTypeName: { Value: 'PicklistType' },
  DisplayName: { UserLocalizedLabel: { Label: name } },
  CreatedOn: new Date().toISOString(),
  IsCustomAttribute: true,
});

/**
 * Routes the six requests `validateBestPractices` makes.
 *
 * `entities` names the logical names behind the solution's components. Any logical name in
 * `unreadableEntity` fails its `EntityDefinitions(LogicalName=…)` read; any in
 * `unreadableComponent` fails the `EntityDefinitions(MetadataId)` read during discovery;
 * any attribute in `unreadableOptionSet` fails its option-set expansion.
 */
function stubClient(opts: {
  entities: string[];
  attributes?: Record<string, ReturnType<typeof picklistAttribute>[]>;
  globalOptionSets?: Set<string>;
  unreadableComponent?: Set<string>;
  unreadableEntity?: Set<string>;
  unreadableOptionSet?: Set<string>;
}) {
  const metadataIdOf = (name: string) => guid(opts.entities.indexOf(name) + 1);

  return {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      if (endpoint.startsWith('api/data/v9.2/solutions?')) {
        return {
          value: [{ solutionid: guid(900), friendlyname: 'Contoso Core', uniquename: 'contoso_core' }],
        } as T;
      }

      if (endpoint.startsWith('api/data/v9.2/solutioncomponents?')) {
        return {
          value: opts.entities.map((name) => ({ objectid: metadataIdOf(name) })),
        } as T;
      }

      // Attribute-level option-set expansion, checked before the plain Attributes read.
      const attrMatch = endpoint.match(
        /EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes\(LogicalName='([^']+)'\)/
      );
      if (attrMatch) {
        const [, , attrName] = attrMatch;
        if (opts.unreadableOptionSet?.has(attrName)) {
          throw new Error(`Principal lacks read on option set for ${attrName}`);
        }
        return {
          LogicalName: attrName,
          OptionSet: { IsGlobal: opts.globalOptionSets?.has(attrName) ?? true },
        } as T;
      }

      const listMatch = endpoint.match(
        /EntityDefinitions\(LogicalName='([^']+)'\)\/Attributes\?/
      );
      if (listMatch) {
        return { value: opts.attributes?.[listMatch[1]] ?? [] } as T;
      }

      const byLogical = endpoint.match(/EntityDefinitions\(LogicalName='([^']+)'\)\?/);
      if (byLogical) {
        const name = byLogical[1];
        if (opts.unreadableEntity?.has(name)) {
          throw new Error(`Principal lacks prvReadEntity on ${name}`);
        }
        return {
          LogicalName: name,
          SchemaName: name,
          MetadataId: metadataIdOf(name),
          DisplayName: { UserLocalizedLabel: { Label: name } },
          IconVectorName: 'contoso_icon.svg',
          IsCustomEntity: true,
        } as T;
      }

      const byMetadataId = endpoint.match(/EntityDefinitions\(([^)']+)\)\?/);
      if (byMetadataId) {
        const name = opts.entities.find((e) => metadataIdOf(e) === byMetadataId[1]);
        if (!name) throw new Error('Unknown metadata id');
        if (opts.unreadableComponent?.has(name)) {
          throw new Error(`Principal lacks prvReadEntity on component ${name}`);
        }
        return { LogicalName: name, SchemaName: name } as T;
      }

      throw new Error(`Unstubbed endpoint: ${endpoint}`);
    },
  } as unknown as PowerPlatformClient;
}

const validate = (client: PowerPlatformClient) =>
  new ValidationService(client).validateBestPractices(
    'contoso_core',
    undefined,
    PREFIX,
    0,
    true,
    // The required-column rule would add a violation to every entity and drown the signal.
    ['optionset', 'entity-icon'],
    0
  );

describe('ValidationService.validateBestPractices fan-out', () => {
  it('records an entity dropped during discovery instead of shortening the list', async () => {
    const three = [`${PREFIX}order`, `${PREFIX}invoice`, `${PREFIX}shipment`];

    const withDrop = await validate(
      stubClient({ entities: three, unreadableComponent: new Set([three[1]]) })
    );
    const complete = await validate(
      stubClient({ entities: [three[0], three[2]] })
    );

    // Both checked two entities. Only one of them looked at three.
    expect(withDrop.summary.entitiesChecked).toBe(2);
    expect(complete.summary.entitiesChecked).toBe(2);

    expect(withDrop.fanOut.entityDiscovery).not.toEqual(complete.fanOut.entityDiscovery);
    expect(withDrop.fanOut.entityDiscovery.attempted).toBe(3);
    expect(withDrop.fanOut.entityDiscovery.failed).toBe(1);
    expect(withDrop.fanOut.entityDiscovery.failures[0].reason).toContain('prvReadEntity');
    expect(complete.fanOut.entityDiscovery.failed).toBe(0);
  });

  it('records an entity whose metadata could not be read instead of skipping it', async () => {
    const three = [`${PREFIX}order`, `${PREFIX}invoice`, `${PREFIX}shipment`];

    const withDrop = await validate(
      stubClient({ entities: three, unreadableEntity: new Set([three[1]]) })
    );
    const complete = await validate(stubClient({ entities: [three[0], three[2]] }));

    expect(withDrop.summary.entitiesChecked).toBe(2);
    expect(complete.summary.entitiesChecked).toBe(2);

    expect(withDrop.fanOut.entityValidation).not.toEqual(complete.fanOut.entityValidation);
    expect(withDrop.fanOut.entityValidation.attempted).toBe(3);
    expect(withDrop.fanOut.entityValidation.failed).toBe(1);
    expect(withDrop.fanOut.entityValidation.failures[0].item).toBe(three[1]);
    expect(complete.fanOut.entityValidation.failed).toBe(0);
  });

  it('does not report an entity compliant when a rule could not be run on it', async () => {
    const entity = `${PREFIX}order`;
    const attributes = { [entity]: [picklistAttribute(`${PREFIX}status`)] };

    const unchecked = await validate(
      stubClient({
        entities: [entity],
        attributes,
        unreadableOptionSet: new Set([`${PREFIX}status`]),
      })
    );
    const checked = await validate(
      stubClient({
        entities: [entity],
        attributes,
        globalOptionSets: new Set([`${PREFIX}status`]),
      })
    );

    // Zero violations in both. The old result made those two indistinguishable.
    expect(unchecked.summary.totalViolations).toBe(0);
    expect(checked.summary.totalViolations).toBe(0);

    expect(checked.entities[0].isCompliant).toBe(true);
    expect(unchecked.entities[0].isCompliant).toBeNull();
    expect(unchecked.entities[0].checksSkipped).toBe(1);
    expect(checked.entities[0].checksSkipped).toBe(0);

    expect(checked.summary.compliantEntities).toBe(1);
    expect(unchecked.summary.compliantEntities).toBe(0);
    expect(unchecked.summary.entitiesNotFullyChecked).toBe(1);

    expect(unchecked.fanOut.optionSetLookups.failed).toBe(1);
    expect(unchecked.fanOut.optionSetLookups.failures[0].item).toBe(
      `${entity}.${PREFIX}status`
    );
    expect(checked.fanOut.optionSetLookups.failed).toBe(0);
  });

  it('the report a reader acts on refuses to call an incomplete pass clean', async () => {
    const entity = `${PREFIX}order`;
    const attributes = { [entity]: [picklistAttribute(`${PREFIX}status`)] };

    const unchecked = await validate(
      stubClient({
        entities: [entity],
        attributes,
        unreadableOptionSet: new Set([`${PREFIX}status`]),
      })
    );
    const checked = await validate(
      stubClient({
        entities: [entity],
        attributes,
        globalOptionSets: new Set([`${PREFIX}status`]),
      })
    );

    const uncheckedReport = formatBestPracticesReport(unchecked);
    const checkedReport = formatBestPracticesReport(checked);

    expect(uncheckedReport).not.toEqual(checkedReport);
    expect(checkedReport).toContain('✅ All Compliant');
    expect(uncheckedReport).not.toContain('✅ All Compliant');
    expect(uncheckedReport).toContain('This pass is incomplete');
    expect(uncheckedReport).toContain(`${entity}.${PREFIX}status`);

    expect(formatQuickSummary(unchecked)).toContain('Not fully checked: 1');
    expect(formatQuickSummary(checked)).not.toContain('Not fully checked');

    expect(validationFanOutSuffix(unchecked)).toContain('INCOMPLETE');
    expect(validationFanOutSuffix(checked)).toBe('');
  });
});
