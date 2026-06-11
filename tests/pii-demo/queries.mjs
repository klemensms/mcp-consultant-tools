// Server registry and query catalogue for the PII demo.
//
// Adding a new MCP surface (rest-api, ado, sql, b2c, ...): add an entry to
// `servers` with the build path + the env vars the server needs forwarded
// from process.env, then add queries that target that server.

// Test-environment fixture IDs (seeded 2026-04-30).
const MARIA_CONTACT_ID = '91484a2f-7f44-f111-bec5-6045bdf2343f';

export const servers = {
  'pp-data': {
    id: 'pp-data',
    label: 'PowerPlatform Data',
    buildPath: 'packages/powerplatform-data/build/index.js',
    requiredEnv: [
      'POWERPLATFORM_URL',
      'POWERPLATFORM_CLIENT_ID',
      'POWERPLATFORM_CLIENT_SECRET',
      'POWERPLATFORM_TENANT_ID',
    ],
  },
};

export const queries = [
  {
    id: 'pp-maria-1',
    server: 'pp-data',
    label: 'Query Maria Schmidt — configured fields (run 1)',
    description:
      'Returns Maria with the full set of configured PII fields. Baseline for L2 demo and the first half of the cross-call correlation check.',
    tool: 'query-records',
    args: {
      entityNamePlural: 'contacts',
      filter: "lastname eq 'Schmidt'",
      select: [
        'firstname',
        'lastname',
        'emailaddress1',
        'birthdate',
        'mobilephone',
        'description',
      ],
    },
    extractFields: [
      'firstname',
      'lastname',
      'emailaddress1',
      'mobilephone',
      'birthdate',
      'description',
    ],
  },
  {
    id: 'pp-maria-2',
    server: 'pp-data',
    label: 'Query Maria Schmidt — cross-call correlation (run 2)',
    description:
      'Same Maria queried by a different filter. In the full-l1-l4 scenario the firstname token MUST match pp-maria-1. In a fresh process it MUST differ.',
    tool: 'query-records',
    args: {
      entityNamePlural: 'contacts',
      filter: "firstname eq 'Maria'",
      select: ['firstname', 'lastname', 'emailaddress1'],
    },
    extractFields: ['firstname', 'lastname', 'emailaddress1'],
  },
  {
    id: 'pp-annotation',
    server: 'pp-data',
    label: 'Annotation note attached to Maria',
    description:
      'Free-text notetext field with embedded email, phone, DOB-shape date, and two person names. L3 + L4 territory — L2 has no field rules for the annotation entity.',
    tool: 'query-records',
    args: {
      entityNamePlural: 'annotations',
      filter: `_objectid_value eq ${MARIA_CONTACT_ID}`,
      select: ['subject', 'notetext'],
    },
    extractFields: ['subject', 'notetext'],
  },
  {
    id: 'pp-account-lookup',
    server: 'pp-data',
    label: 'Account with primary-contact lookup (OData annotation NER test)',
    description:
      "Selects the lookup field `_primarycontactid_value` on Contoso. Dataverse returns the GUID plus a FormattedValue annotation (e.g. 'Maria Schmidt'). Layer 4 NER must redact the annotation — this exercises the v1 'relationship name problem'.",
    tool: 'query-records',
    args: {
      entityNamePlural: 'accounts',
      filter: "name eq 'Contoso Deutschland GmbH'",
      select: ['name', 'emailaddress1', '_primarycontactid_value'],
    },
    extractFields: [
      'name',
      'emailaddress1',
      '_primarycontactid_value',
      '_primarycontactid_value@OData.Community.Display.V1.FormattedValue',
    ],
  },
  {
    id: 'pp-maria-update',
    server: 'pp-data',
    label: 'Update Maria — write-path redaction + yomifullname + footer (beta.4)',
    description:
      "Sets Maria.jobtitle to 'Senior Consultant'. Dataverse PATCH with Prefer: return=representation echoes the full updated contact back in the response, so firstname, lastname, emailaddress1, mobilephone, birthdate, description, plus yomifullname all appear in the body. Beta.3 wired write-path redaction so bodies redact; beta.4 closes F4 (yomifullname redacts via new default contact rule) and F5 (the [PII protection: ...] audit footer now appears at the end of the response — was missing on writes through beta.3).",
    tool: 'update-record',
    args: {
      entityNamePlural: 'contacts',
      recordId: MARIA_CONTACT_ID,
      data: { jobtitle: 'Senior Consultant' },
    },
    extractFields: [
      'firstname',
      'lastname',
      'emailaddress1',
      'mobilephone',
      'birthdate',
      'description',
      'yomifullname',
      'jobtitle',
    ],
  },
];
