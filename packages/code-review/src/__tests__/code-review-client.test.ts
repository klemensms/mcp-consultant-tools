import { describe, it, expect } from 'vitest';
import {
  CodeReviewClient,
  parseNextLink,
  normalizeGheApiBase,
  describeUnprovisionedPrincipal,
  describeCloneAuthFailure,
  notFoundHint,
  forbiddenHint,
} from '../code-review-client.js';

/**
 * A 404 under the Azure DevOps provider was answering with GitHub SAML SSO guidance, naming a
 * "Settings > Developer settings" page that does not exist for that reader — reported from a live
 * run where the real cause was a stale project name. A confidently wrong hint costs more than no
 * hint, because it sends someone into the wrong product before they doubt it.
 */
describe('status hints name the provider actually in use', () => {
  it('does not send an Azure DevOps 404 to GitHub SAML settings', () => {
    const hint = notFoundHint('azure-devops', 'Contoso');
    expect(hint).not.toMatch(/SAML|Developer settings|GitHub/i);
    expect(hint).toContain('Contoso');
    // The measured cause: a project name carried over from a clone remote that no longer exists.
    expect(hint).toContain('cr-list-repos');
  });

  it('keeps the SAML guidance for the GitHub providers, where it is correct', () => {
    expect(notFoundHint('github-enterprise')).toMatch(/SAML SSO/);
    expect(notFoundHint('github-app')).toMatch(/SAML SSO/);
  });

  it('does not send an Azure DevOps 403 to GitHub SAML settings either', () => {
    expect(forbiddenHint('azure-devops', 'entra-id')).not.toMatch(/SAML|GitHub/i);
    expect(forbiddenHint('azure-devops', 'pat')).not.toMatch(/SAML|GitHub/i);
  });

  it('distinguishes the two Azure DevOps auth methods on a 403, which need different fixes', () => {
    expect(forbiddenHint('azure-devops', 'entra-id')).toMatch(/service principal/i);
    expect(forbiddenHint('azure-devops', 'pat')).toMatch(/PAT/);
  });

  it('keeps the SAML guidance on a GHE 403', () => {
    expect(forbiddenHint('github-enterprise')).toMatch(/SAML SSO/);
  });
});

describe('parseNextLink', () => {
  it('extracts the rel="next" URL from a Link header', () => {
    const header =
      '<https://ghe.example.com/api/v3/orgs/o/repos?page=2>; rel="next", <https://ghe.example.com/api/v3/orgs/o/repos?page=5>; rel="last"';
    expect(parseNextLink(header)).toBe('https://ghe.example.com/api/v3/orgs/o/repos?page=2');
  });

  it('returns null when there is no next page', () => {
    expect(parseNextLink('<https://x/page=5>; rel="last"')).toBeNull();
    expect(parseNextLink(undefined)).toBeNull();
  });
});

describe('normalizeGheApiBase', () => {
  it('appends /api/v3 when absent', () => {
    expect(normalizeGheApiBase('https://ghe.example.com')).toBe('https://ghe.example.com/api/v3');
  });
  it('leaves an existing /api/v3 alone', () => {
    expect(normalizeGheApiBase('https://ghe.example.com/api/v3')).toBe('https://ghe.example.com/api/v3');
  });
});

describe('constructor config validation', () => {
  it('rejects azure-devops without organization/PAT', () => {
    expect(() => new CodeReviewClient({ provider: 'azure-devops' })).toThrow(/AZDO_ORGANIZATION|AZDO_PAT/);
  });
  it('rejects github-enterprise without base URL/token', () => {
    expect(() => new CodeReviewClient({ provider: 'github-enterprise' })).toThrow(/GHE_BASE_URL|GHE_TOKEN/);
  });
  it('rejects azure-devops entra-id when no token source was supplied', () => {
    expect(
      () => new CodeReviewClient({ provider: 'azure-devops', azdoAuthMethod: 'entra-id', azdoOrganization: 'contoso' }),
    ).toThrow(/AZDO_CLIENT_ID|AZDO_CLIENT_SECRET|AZDO_TENANT_ID/);
  });
  it('accepts azure-devops entra-id with a token source and no PAT', () => {
    expect(
      () =>
        new CodeReviewClient(
          { provider: 'azure-devops', azdoAuthMethod: 'entra-id', azdoOrganization: 'contoso' },
          undefined,
          { getToken: async () => 'tok' } as any,
        ),
    ).not.toThrow();
  });
});

describe('describeUnprovisionedPrincipal — TF401444 is an identity problem, not a bad credential', () => {
  // Azure DevOps names the identity as a backslash triple: tenant\tenant\principal. All three
  // segments are GUIDs on a real response — which is what the original fixture got wrong (it used
  // the literal word "tenant" for the first two, so "first GUID in the message" accidentally
  // matched). Measured against a live tenant 2026-08-13.
  const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff';
  const OBJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const body = {
    message: `TF401444: Please sign-in at least once as ${TENANT_ID}\\${TENANT_ID}\\${OBJECT_ID} in a web browser to enable access to the service.`,
    typeKey: 'UnauthorizedRequestException',
  };

  it('quotes the PRINCIPAL object id, never the tenant id that precedes it', () => {
    const described = describeUnprovisionedPrincipal('contoso', body);
    expect(described).toContain(OBJECT_ID);
    // The whole point: an admin searching Users for the tenant id finds nothing.
    expect(described).not.toContain(TENANT_ID);
  });

  it('names the membership prerequisite and the organization', () => {
    const described = describeUnprovisionedPrincipal('contoso', body);
    expect(described).toContain('TF401444');
    expect(described).toContain('contoso');
    expect(described).toMatch(/not a member/i);
    // The reader must not be sent off to check the secret — that is the wrong fix.
    expect(described).toMatch(/issued and accepted/i);
  });

  it('still works when the message carries no object id', () => {
    const described = describeUnprovisionedPrincipal('contoso', { message: 'TF401444: Please sign-in at least once.' });
    expect(described).toContain('TF401444');
    expect(described).toContain('contoso');
  });

  it('falls back to the last GUID when the identity is not backslash-separated', () => {
    const described = describeUnprovisionedPrincipal('contoso', {
      message: `TF401444: Please sign-in at least once as ${OBJECT_ID} in a web browser.`,
    });
    expect(described).toContain(OBJECT_ID);
  });

  it('returns null for any other 401 body, leaving the generic handling in place', () => {
    expect(describeUnprovisionedPrincipal('contoso', { message: 'TF400813: user is not authorized' })).toBeNull();
    expect(describeUnprovisionedPrincipal('contoso', undefined)).toBeNull();
    expect(describeUnprovisionedPrincipal('contoso', 'plain text body')).toBeNull();
  });
});

describe('describeCloneAuthFailure — a clone gets no TF401444 body, only "Authentication failed"', () => {
  const gitFailure =
    "Git clone failed: Command failed: git -c http.extraHeader=Authorization: Bearer *** clone --depth=1 https://dev.azure.com/contoso/MyProject/_git/MyRepo /tmp/mcp-cr-x\nfatal: Authentication failed for 'https://dev.azure.com/contoso/MyProject/_git/MyRepo/'";

  it('names the membership prerequisite under entra-id, so a clone-first user has a route to the fix', () => {
    const hint = describeCloneAuthFailure('contoso', 'entra-id', gitFailure);
    expect(hint).toContain('TF401444');
    expect(hint).toMatch(/not a member/i);
    expect(hint).toContain('contoso');
  });

  it('points at the credential under pat, not at organization membership', () => {
    const hint = describeCloneAuthFailure('contoso', 'pat', gitFailure);
    expect(hint).toMatch(/PAT/);
    expect(hint).not.toMatch(/not a member/i);
  });

  it('also matches the terminal-prompts-disabled form git uses when it wants a username', () => {
    const prompts = "Git clone failed: fatal: could not read Username for 'https://dev.azure.com': terminal prompts disabled";
    expect(describeCloneAuthFailure('contoso', 'entra-id', prompts)).toMatch(/not a member/i);
  });

  it('returns null for a non-auth clone failure, so a real error is not buried under an auth guess', () => {
    expect(describeCloneAuthFailure('contoso', 'entra-id', 'Git clone failed: fatal: repository not found')).toBeNull();
    expect(describeCloneAuthFailure('contoso', 'entra-id', 'Git clone failed: fatal: reference is not a tree')).toBeNull();
  });
});

describe('Packages API provider guards (surface the real limitation, never a masked 403)', () => {
  it('github-app: package operations refuse with a clear message (Apps cannot use the Packages API)', async () => {
    const client = new CodeReviewClient(
      { provider: 'github-app', gheBaseUrl: 'https://ghe.example.com', gheAppId: '1', gheInstallationId: '2' },
      { getToken: async () => 'tok' } as any,
    );
    await expect(client.listOrgPackages('contoso')).rejects.toThrow(/github-app|GitHub App|read:packages/);
    await expect(client.getPackageVersions('contoso', 'pkg')).rejects.toThrow(/github-app|GitHub App|read:packages/);
  });

  it('azure-devops: package operations refuse (GitHub-only feature)', async () => {
    const client = new CodeReviewClient({
      provider: 'azure-devops',
      azdoOrganization: 'contoso',
      azdoPat: 'pat',
    });
    await expect(client.listOrgPackages('contoso')).rejects.toThrow(/github-enterprise/);
  });
});
