import { describe, it, expect } from 'vitest';
import { DataService } from '../DataService.js';
import { MetadataService } from '../MetadataService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const GUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** A client that records every request and answers with an empty collection. */
function recordingClient(): { client: PowerPlatformClient; calls: string[] } {
  const calls: string[] = [];
  const client = {
    getOrganizationUrl: () => 'https://yourorg.crm.dynamics.com',
    async makeRequest<T>(endpoint: string): Promise<T> {
      calls.push(endpoint);
      return { value: [] } as T;
    },
    async makeRequestNoContent(endpoint: string): Promise<void> {
      calls.push(endpoint);
    },
  };
  return { client: client as unknown as PowerPlatformClient, calls };
}

const BAD_TABLE = 'contacts?$select=fullname';

describe('DataService refuses names and IDs that would change the request address', () => {
  it('getRecord checks the table name and the record ID', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(svc.getRecord(BAD_TABLE, GUID)).rejects.toThrow(/Invalid table name/);
    await expect(svc.getRecord('contacts', `${GUID})/x(`)).rejects.toThrow(/Invalid record ID/);
    expect(calls).toEqual([]);
  });

  it('queryRecords checks the table name, every select column and maxRecords', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(svc.queryRecords(BAD_TABLE, 'true')).rejects.toThrow(/Invalid table name/);
    await expect(
      svc.queryRecords('contacts', 'true', 10, ['fullname', 'emailaddress1&$expand=x'])
    ).rejects.toThrow(/Invalid column name/);
    await expect(svc.queryRecords('contacts', 'true', -5)).rejects.toThrow(
      /maxRecords must be a whole number of 1 or more/
    );
    await expect(svc.queryRecords('contacts', 'true', 2.5)).rejects.toThrow(/whole number/);
    expect(calls).toEqual([]);
  });

  it('queryRecords accepts a lookup value column in select', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await svc.queryRecords('contacts', 'true', 10, ['_parentcustomerid_value']);
    expect(calls[0]).toContain('$select=_parentcustomerid_value');
  });

  it('create, update and delete check the table name', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(svc.createRecord(BAD_TABLE, { name: 'x' })).rejects.toThrow(/Invalid table name/);
    await expect(svc.updateRecord(BAD_TABLE, GUID, { name: 'x' })).rejects.toThrow(/Invalid table name/);
    await expect(svc.deleteRecord(BAD_TABLE, GUID)).rejects.toThrow(/Invalid table name/);
    expect(calls).toEqual([]);
  });

  it('create refuses a lookup bind key that is not a plain name', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(
      svc.createRecord('contacts', { "parentcustomerid' or 1 eq 1@odata.bind": '/accounts(x)' })
    ).rejects.toThrow(/Invalid column name/);
    expect(calls).toEqual([]);
  });

  it('associate and disassociate check table and navigation property names', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(
      svc.associateRecords('accounts', GUID, 'contact_customer_accounts/../x', 'contacts', GUID)
    ).rejects.toThrow(/Invalid navigation property/);
    await expect(
      svc.associateRecords('accounts', GUID, 'contact_customer_accounts', BAD_TABLE, GUID)
    ).rejects.toThrow(/Invalid target table name/);
    await expect(
      svc.disassociateRecords(BAD_TABLE, GUID, 'contact_customer_accounts', GUID)
    ).rejects.toThrow(/Invalid table name/);
    expect(calls).toEqual([]);
  });

  it('executeAction checks the action name and the bound table, and keeps dotted names', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(svc.executeAction('WhoAmI?x=1')).rejects.toThrow(/Invalid action name/);
    await expect(
      svc.executeAction('QualifyLead', {}, { entityNamePlural: BAD_TABLE, recordId: GUID })
    ).rejects.toThrow(/Invalid table name/);
    expect(calls).toEqual([]);
    await svc.executeAction('Microsoft.Dynamics.CRM.QualifyLead', {}, {
      entityNamePlural: 'leads',
      recordId: GUID,
    });
    expect(calls[0]).toBe(`api/data/v9.2/leads(${GUID})/Microsoft.Dynamics.CRM.QualifyLead`);
  });

  it('countRecords checks the table name before any metadata lookup', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await expect(svc.countRecords("accounts' or 1 eq 1")).rejects.toThrow(/Invalid table name/);
    expect(calls).toEqual([]);
  });

  it('queryRecords splits a comma-separated select entry and checks each column', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    await svc.queryRecords('contacts', 'true', 10, ['fullname, emailaddress1']);
    expect(calls[0]).toContain('$select=fullname,emailaddress1');
    await expect(svc.queryRecords('contacts', 'true', 10, ['fullname,x&y'])).rejects.toThrow(
      /Invalid column name: "x&y"/
    );
  });

  it('countRecordsBatch reports a bad name against that entry only, in order', async () => {
    const { client, calls } = recordingClient();
    const svc = new DataService(client);
    const results = await svc.countRecordsBatch([
      { entityNamePlural: 'accounts' },
      { entityNamePlural: BAD_TABLE },
      { entityNamePlural: 'contacts/x', filter: 'true' },
      { entityNamePlural: 'contacts' },
    ]);
    expect(results.map((r) => r.entityNamePlural)).toEqual([
      'accounts',
      BAD_TABLE,
      'contacts/x',
      'contacts',
    ]);
    expect(results[1]).toMatchObject({ count: -1, error: expect.stringMatching(/Invalid table name/) });
    expect(results[2]).toMatchObject({ count: -1, error: expect.stringMatching(/Invalid table name/) });
    // The valid names were looked up; the bad ones never reached a request.
    expect(calls.some((c) => c.includes("EntitySetName eq 'accounts'"))).toBe(true);
    expect(calls.some((c) => c.includes("EntitySetName eq 'contacts'"))).toBe(true);
    expect(calls.some((c) => c.includes('select=fullname') || c.includes('contacts/x'))).toBe(false);
  });
});

describe('MetadataService refuses names that would change the request address', () => {
  it('checks table, column, attribute type and option set names', async () => {
    const { client, calls } = recordingClient();
    const svc = new MetadataService(client);
    await expect(svc.getEntityMetadata("account')/x")).rejects.toThrow(/Invalid table name/);
    await expect(svc.getEntityAttributes('account', { attributeType: "String' or 1 eq 1" })).rejects.toThrow(
      /Invalid attribute type/
    );
    await expect(svc.getEntityAttribute('account', "name')")).rejects.toThrow(/Invalid column name/);
    await expect(svc.getEntityRelationships('account/x')).rejects.toThrow(/Invalid table name/);
    await expect(svc.getGlobalOptionSet("x')")).rejects.toThrow(/Invalid option set name/);
    await expect(svc.getGlobalOptionSets({ prefix: "new_')" })).rejects.toThrow(/Invalid option set prefix/);
    expect(calls).toEqual([]);
  });
});
