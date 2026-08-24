import { describe, it, expect } from 'vitest';
import {
  applyLayer2,
  LOOKUP_FORMATTED_VALUE_PII_KEYWORDS,
  DEFAULT_FIELD_NAME_PII_KEYWORDS,
} from '../field-redaction.js';
import type { PiiConfig } from '../types.js';

const SALT = Buffer.from('00'.repeat(32), 'hex');

function makeConfig(redactInResponse: string[] = []): PiiConfig {
  return {
    enabled: true,
    observeMode: false,
    environmentType: 'uat',
    layers: { l1: true, l2: true, l3: true, l4: true },
    fieldRules: {
      contact: {
        excludeFromSelect: [],
        redactInResponse,
      },
    },
    regex: { email: true, phone: true, dateOfBirth: true, customPatterns: [] },
    ner: { scanFields: [], scanOdataAnnotations: false },
  };
}

describe('Layer 2 - Gap 3 lookup FormattedValue redaction (Option A + C)', () => {
  it('exports a non-empty keyword list', () => {
    expect(LOOKUP_FORMATTED_VALUE_PII_KEYWORDS.length).toBeGreaterThan(0);
    expect(LOOKUP_FORMATTED_VALUE_PII_KEYWORDS).toContain('address');
    expect(LOOKUP_FORMATTED_VALUE_PII_KEYWORDS).toContain('email');
    expect(LOOKUP_FORMATTED_VALUE_PII_KEYWORDS).toContain('phone');
    expect(LOOKUP_FORMATTED_VALUE_PII_KEYWORDS).toContain('contact');
  });

  it('Option A - redacts FormattedValue when base lookup IS in redactInResponse', () => {
    const config = makeConfig(['_si_primaryaddressid_value']);
    const data = {
      _si_primaryaddressid_value: 'abc-123-guid',
      '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue':
        'AUDITTEST Address Line 1, ',
    };
    const { transformedData, report } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;

    expect(out._si_primaryaddressid_value).toMatch(/^\[REDACTED:/);
    expect(
      out['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']
    ).toMatch(/^\[REDACTED:/);
    expect(
      out['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']
    ).not.toContain('AUDITTEST');
    expect(report.fieldsAffected).toContain('_si_primaryaddressid_value');
    expect(report.fieldsAffected).toContain(
      '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue'
    );
  });

  it('Option C - redacts FormattedValue when base name contains a keyword (no config opt-in)', () => {
    const config = makeConfig([]); // no explicit rules
    const data = {
      _si_primaryaddressid_value: 'abc-123-guid', // GUID, fine
      '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue':
        'AUDITTEST Address Line 1, ',
    };
    const { transformedData, report } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;

    // Base lookup GUID is NOT in redactInResponse → stays as-is.
    expect(out._si_primaryaddressid_value).toBe('abc-123-guid');
    // FormattedValue sibling carries the address text → keyword 'address'
    // matches the base name → redacted.
    expect(
      out['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']
    ).toMatch(/^\[REDACTED:/);
    expect(
      out['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']
    ).not.toContain('AUDITTEST');
    expect(report.fieldsAffected).toContain(
      '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue'
    );
  });

  it('Option C - leaves FormattedValue alone when base name has no keyword match', () => {
    const config = makeConfig([]);
    const data = {
      _owningteamid_value: 'team-guid',
      '_owningteamid_value@OData.Community.Display.V1.FormattedValue': 'Sales Team',
    };
    const { transformedData, report } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;

    expect(out._owningteamid_value).toBe('team-guid');
    expect(
      out['_owningteamid_value@OData.Community.Display.V1.FormattedValue']
    ).toBe('Sales Team');
    expect(report.fieldsAffected).toEqual([]);
  });

  it('Option C - redacts case-insensitively (mixed-case base name)', () => {
    const config = makeConfig([]);
    const data = {
      _MyContactLookup_value: 'guid-x',
      '_MyContactLookup_value@OData.Community.Display.V1.FormattedValue':
        'Some Contact Display',
    };
    const { transformedData } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;
    expect(
      out['_MyContactLookup_value@OData.Community.Display.V1.FormattedValue']
    ).toMatch(/^\[REDACTED:/);
  });

  it('Option C - only matches FormattedValue suffix; other annotations untouched', () => {
    const config = makeConfig([]);
    const data = {
      '_si_primaryaddressid_value@Microsoft.Dynamics.CRM.lookuplogicalname':
        'si_address',
      '_si_primaryaddressid_value@Microsoft.Dynamics.CRM.associatednavigationproperty':
        'si_primaryaddressid',
    };
    const { transformedData } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;
    // Non-FormattedValue annotations are metadata only; not PII candidates.
    expect(
      out['_si_primaryaddressid_value@Microsoft.Dynamics.CRM.lookuplogicalname']
    ).toBe('si_address');
    expect(
      out[
        '_si_primaryaddressid_value@Microsoft.Dynamics.CRM.associatednavigationproperty'
      ]
    ).toBe('si_primaryaddressid');
  });

  it('does not crash on FormattedValue with null/undefined values', () => {
    const config = makeConfig([]);
    const data = {
      '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue': null,
      '_emailcontact_value@OData.Community.Display.V1.FormattedValue': undefined,
    };
    const { transformedData } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;
    expect(out['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']).toBeNull();
    expect(out['_emailcontact_value@OData.Community.Display.V1.FormattedValue']).toBeUndefined();
  });

  it('exports a non-empty plain-field keyword list', () => {
    expect(DEFAULT_FIELD_NAME_PII_KEYWORDS.length).toBeGreaterThan(0);
    expect(DEFAULT_FIELD_NAME_PII_KEYWORDS).toContain('salutation');
  });

  it('redacts plain field whose name contains a default keyword (vendor-prefix-neutral)', () => {
    const config = makeConfig([]);
    const data = {
      contactid: 'r1',
      salutation: 'Dear Lord Testington',
      acme_salutation: 'Dear Lord Testington',
      new_member_salutation: 'Dear Lord Testington',
      jobtitle: 'CEO',
    };
    const { transformedData, report } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;

    expect(out.salutation).toMatch(/^\[REDACTED:/);
    expect(out.acme_salutation).toMatch(/^\[REDACTED:/);
    expect(out.new_member_salutation).toMatch(/^\[REDACTED:/);
    // Field without a keyword stays untouched.
    expect(out.jobtitle).toBe('CEO');
    expect(out.contactid).toBe('r1');
    expect(report.fieldsAffected).toContain('salutation');
    expect(report.fieldsAffected).toContain('acme_salutation');
    expect(report.fieldsAffected).toContain('new_member_salutation');
  });

  it('plain-field keyword path leaves non-matching field names alone', () => {
    const config = makeConfig([]);
    const data = {
      jobtitle: 'CEO',
      department: 'Sales',
      ownerid: 'team-x',
    };
    const { transformedData, report } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;
    expect(out.jobtitle).toBe('CEO');
    expect(out.department).toBe('Sales');
    expect(out.ownerid).toBe('team-x');
    expect(report.fieldsAffected).toEqual([]);
  });

  it('walks OData wrapper { value: [...] } and redacts inside each row', () => {
    const config = makeConfig([]);
    const data = {
      '@odata.context': 'https://example/$metadata',
      value: [
        {
          contactid: 'r1',
          '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue':
            'Customer A Address',
        },
        {
          contactid: 'r2',
          '_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue':
            'Customer B Address',
        },
      ],
    };
    const { transformedData, report } = applyLayer2('contact', data, config, SALT);
    const out = transformedData as Record<string, unknown>;
    const rows = out.value as Array<Record<string, unknown>>;
    expect(rows[0]['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']).toMatch(/^\[REDACTED:/);
    expect(rows[1]['_si_primaryaddressid_value@OData.Community.Display.V1.FormattedValue']).toMatch(/^\[REDACTED:/);
    expect(report.fieldsAffected.length).toBe(2);
  });
});
