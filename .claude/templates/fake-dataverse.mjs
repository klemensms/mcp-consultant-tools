/**
 * SOURCE OF TRUTH: mcp-consultant-tools/.claude/templates/fake-dataverse.mjs
 *
 * Fake Dataverse Web API for the MCP local tester's fake-service mode.
 *
 * Listens on 127.0.0.1 on a free port, answers the read requests the Dataverse
 * servers make with small canned data, and records every request so the runner
 * can fail a run that tried to write. Contacts carry planted personal values;
 * the runner fails a run if any of them reaches the tool output.
 *
 * Used by mcp-test-runner.mjs; not meant to be run on its own.
 */

import { createServer } from 'node:http';

export const FAKE_TOKEN = 'fake-service-token';

/** Values that must never appear in tool output while PII protection is on. */
export const PLANTED_VALUES = ['planted.pii.7f3a@example.com', '+44 7700 900123', 'Plantedsurname', 'Plantedfirstname'];

const TABLES = {
  accounts: { logical: 'account', key: 'accountid', display: 'Account' },
  contacts: { logical: 'contact', key: 'contactid', display: 'Contact' },
};

const RECORDS = {
  accounts: [
    { accountid: 'aaaaaaaa-bbbb-cccc-dddd-000000000001', name: 'Contoso' },
    { accountid: 'aaaaaaaa-bbbb-cccc-dddd-000000000002', name: 'Fabrikam' },
  ],
  contacts: [
    {
      contactid: 'aaaaaaaa-bbbb-cccc-dddd-000000000011',
      firstname: 'Plantedfirstname',
      lastname: 'Plantedsurname',
      fullname: 'Plantedfirstname Plantedsurname',
      emailaddress1: 'planted.pii.7f3a@example.com',
      telephone1: '+44 7700 900123',
    },
  ],
};

const ATTRIBUTES = {
  account: [
    { LogicalName: 'accountid', AttributeType: 'Uniqueidentifier' },
    { LogicalName: 'name', AttributeType: 'String' },
  ],
  contact: [
    { LogicalName: 'contactid', AttributeType: 'Uniqueidentifier' },
    { LogicalName: 'fullname', AttributeType: 'String' },
    { LogicalName: 'emailaddress1', AttributeType: 'String' },
    { LogicalName: 'telephone1', AttributeType: 'String' },
  ],
};

const label = (text) => ({ UserLocalizedLabel: { Label: text }, LocalizedLabels: [{ Label: text }] });

function entityDefinition(set) {
  const t = TABLES[set];
  return {
    LogicalName: t.logical,
    EntitySetName: set,
    PrimaryIdAttribute: t.key,
    DisplayName: label(t.display),
  };
}

function setFromLogical(logical) {
  return Object.keys(TABLES).find((set) => TABLES[set].logical === logical);
}

/** Answer one request, or return null for a 404. */
function answer(method, path, query) {
  if (method !== 'GET') return { status: 204, body: null };

  let m;
  if (path === 'EntityDefinitions') {
    const filter = query.get('$filter') ?? '';
    const set = (filter.match(/EntitySetName eq '([^']*)'/) ?? [])[1];
    return { status: 200, body: { value: set && TABLES[set] ? [entityDefinition(set)] : [] } };
  }
  if ((m = path.match(/^EntityDefinitions\(LogicalName='([^']*)'\)(\/Attributes)?(\(LogicalName='([^']*)'\))?/))) {
    const set = setFromLogical(m[1]);
    if (!set) return null;
    if (!m[2]) return { status: 200, body: entityDefinition(set) };
    const attrs = ATTRIBUTES[m[1]].map((a) => ({ ...a, DisplayName: label(a.LogicalName), RequiredLevel: { Value: 'None' } }));
    if (!m[3]) return { status: 200, body: { value: attrs } };
    const attr = attrs.find((a) => a.LogicalName === m[4]);
    return attr ? { status: 200, body: attr } : null;
  }
  if (path.startsWith('RetrieveTotalRecordCount')) {
    const names = [...(query.get('@e') ?? '').matchAll(/'([^']*)'/g)].map((x) => x[1]);
    const known = names.filter((n) => setFromLogical(n));
    return {
      status: 200,
      body: { EntityRecordCountCollection: { Keys: known, Values: known.map((n) => RECORDS[setFromLogical(n)].length) } },
    };
  }
  if ((m = path.match(/^(\w+)\(([0-9a-f-]{36})\)$/i))) {
    const row = (RECORDS[m[1]] ?? []).find((r) => r[TABLES[m[1]].key] === m[2].toLowerCase());
    return row ? { status: 200, body: row } : null;
  }
  if ((m = path.match(/^(\w+)$/)) && RECORDS[m[1]]) {
    if (query.has('$apply')) return { status: 200, body: { value: [{ count: RECORDS[m[1]].length }] } };
    const select = query.get('$select')?.split(',');
    const rows = RECORDS[m[1]].map((r) =>
      select ? Object.fromEntries(Object.entries(r).filter(([k]) => select.includes(k))) : r
    );
    return { status: 200, body: { value: rows } };
  }
  return null;
}

/**
 * Start the fake. Resolves to { url, requests, close }. `requests` fills as the
 * server under test calls it: { method, path, authorized, status }.
 */
export async function startFakeDataverse() {
  const requests = [];
  const server = createServer((req, res) => {
    const entry = { method: req.method, path: req.url, authorized: false, status: 500 };
    requests.push(entry);
    req.resume();
    let status;
    let body;
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const path = decodeURIComponent(url.pathname).replace(/^\/api\/data\/v9\.2\//, '');
      entry.path = `${path}${url.search}`;
      entry.authorized = req.headers.authorization === `Bearer ${FAKE_TOKEN}`;
      const result = entry.authorized
        ? answer(req.method, path, url.searchParams)
        : { status: 401, body: { error: { message: 'Missing fake token' } } };
      ({ status, body } = result ?? { status: 404, body: { error: { code: '0x80060888', message: `Fake Dataverse has no answer for ${path}` } } });
    } catch (error) {
      ({ status, body } = { status: 500, body: { error: { message: `Fake Dataverse failed: ${error.message}` } } });
    }
    entry.status = status;
    res.writeHead(status, body ? { 'Content-Type': 'application/json; odata.metadata=minimal' } : {});
    res.end(body ? JSON.stringify(body) : undefined);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
