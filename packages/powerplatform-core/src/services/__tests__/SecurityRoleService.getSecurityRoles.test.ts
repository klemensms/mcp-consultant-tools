/**
 * D3: `security roles` returned 96 of 542 at its default cap, with a `summary` block
 * (total / managed / unmanaged / systemRolesExcluded) that described only the
 * truncated set. It reads as a complete census of the environment, so a security-role
 * review written from it covers under a fifth of the roles and states no caveat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityRoleService } from '../SecurityRoleService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const makeRequest = vi.fn();
const service = new SecurityRoleService({
  makeRequest,
  getOrganizationUrl: () => BASE,
} as unknown as PowerPlatformClient);

const rawRole = (id: number, name = `Custom Role ${id}`, managed = false) => ({
  roleid: `role-${id}`,
  name,
  roleidunique: `unique-${id}`,
  ismanaged: managed,
  iscustomizable: { Value: true },
  _businessunitid_value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
});

const serve = (rows: ReturnType<typeof rawRole>[], pageSize: number) => {
  let served = 0;
  makeRequest.mockImplementation(async () => {
    const value = rows.slice(served, served + pageSize);
    served += value.length;
    const body: Record<string, unknown> = { value };
    if (served < rows.length) {
      body['@odata.nextLink'] = `${BASE}/api/data/v9.2/roles?$skiptoken=${served}`;
    }
    return body;
  });
};

describe('SecurityRoleService.getSecurityRoles', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('a capped census is distinguishable from a complete one', async () => {
    serve(
      Array.from({ length: 542 }, (_, i) => rawRole(i)),
      100
    );

    const result = await service.getSecurityRoles({ maxRecords: 100 });

    expect(result.summary.total).toBe(100);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.truncation.totalAvailable).toBeNull();
    expect(result.truncation.requestedMax).toBe(100);
  });

  it('returns every role by default, so the summary describes the environment', async () => {
    serve(
      Array.from({ length: 542 }, (_, i) => rawRole(i, `Custom Role ${i}`, i % 2 === 0)),
      5000
    );

    const result = await service.getSecurityRoles();

    expect(result.summary.total).toBe(542);
    expect(result.summary.managed).toBe(271);
    expect(result.summary.unmanaged).toBe(271);
    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.totalAvailable).toBe(542);
  });

  it('excludes system roles inside the paging loop and counts them', async () => {
    serve(
      [
        rawRole(1, 'System Administrator'),
        rawRole(2, 'Custom Role 2'),
        rawRole(3, 'Basic User'),
        rawRole(4, 'Custom Role 4'),
      ],
      2
    );

    const result = await service.getSecurityRoles();

    expect(result.roles.map((r) => r.name)).toEqual(['Custom Role 2', 'Custom Role 4']);
    expect(result.summary.systemRolesExcluded).toBe(2);
    expect(result.truncation.hasMore).toBe(false);
  });

  it('a cap counts roles returned, not roles fetched', async () => {
    // System roles must not eat into the cap, or a cap of 2 silently returns 1.
    serve(
      [
        rawRole(1, 'System Administrator'),
        rawRole(2, 'Custom Role 2'),
        rawRole(3, 'Basic User'),
        rawRole(4, 'Custom Role 4'),
      ],
      2
    );

    const result = await service.getSecurityRoles({ maxRecords: 2 });

    expect(result.roles).toHaveLength(2);
    expect(result.truncation.hasMore).toBe(false);
  });
});
