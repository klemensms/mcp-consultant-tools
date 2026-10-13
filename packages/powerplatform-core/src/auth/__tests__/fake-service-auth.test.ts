import { describe, it, expect, afterEach } from 'vitest';
import { createAuthProvider, FAKE_SERVICE_TOKEN } from '../index.js';

const base = { clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };

afterEach(() => {
  delete process.env.MCP_POWERPLATFORM_FAKE_SERVICE;
});

describe('fake-service auth', () => {
  it('hands out the fixed token for a loopback organisation URL', async () => {
    process.env.MCP_POWERPLATFORM_FAKE_SERVICE = '1';
    const auth = createAuthProvider({ ...base, organizationUrl: 'http://127.0.0.1:4321' });
    expect(await auth.getAccessToken('http://127.0.0.1:4321')).toBe(FAKE_SERVICE_TOKEN);
  });

  it('refuses any organisation URL that is not on this machine', () => {
    process.env.MCP_POWERPLATFORM_FAKE_SERVICE = '1';
    expect(() => createAuthProvider({ ...base, organizationUrl: 'https://mcptests.crm4.dynamics.com' })).toThrow(
      /not on this machine/
    );
    expect(() => createAuthProvider({ ...base, organizationUrl: 'http://127.0.0.1.example.com' })).toThrow(
      /not on this machine/
    );
  });

  it('refuses a token for any other resource', async () => {
    process.env.MCP_POWERPLATFORM_FAKE_SERVICE = '1';
    const auth = createAuthProvider({ ...base, organizationUrl: 'http://localhost:4321' });
    await expect(auth.getAccessToken('https://service.flow.microsoft.com')).rejects.toThrow(/Dataverse Web API only/);
  });

  it('is off unless the variable is exactly 1', () => {
    process.env.MCP_POWERPLATFORM_FAKE_SERVICE = 'true';
    const auth = createAuthProvider({ ...base, organizationUrl: 'https://mcptests.crm4.dynamics.com' });
    expect(auth.constructor.name).not.toBe('FakeServiceAuth');
  });
});
