import { describe, it, expect } from 'vitest';
import { buildCodeReviewConfig, parseAllowedRepositories } from '../context-factory.js';

describe('buildCodeReviewConfig - missing config fails clearly, naming the vars', () => {
  it('requires CODE_REVIEW_PROVIDER', () => {
    expect(() => buildCodeReviewConfig({})).toThrow(/CODE_REVIEW_PROVIDER/);
  });

  it('rejects an unknown provider', () => {
    expect(() => buildCodeReviewConfig({ CODE_REVIEW_PROVIDER: 'bitbucket' })).toThrow(/azure-devops|github-enterprise|github-app/);
  });

  it('azure-devops names the missing AZDO vars', () => {
    const err = grab(() => buildCodeReviewConfig({ CODE_REVIEW_PROVIDER: 'azure-devops' }));
    expect(err).toMatch(/CODE_REVIEW_AZDO_ORGANIZATION/);
    expect(err).toMatch(/CODE_REVIEW_AZDO_PAT/);
  });

  it('github-enterprise names the missing GHE vars', () => {
    const err = grab(() => buildCodeReviewConfig({ CODE_REVIEW_PROVIDER: 'github-enterprise' }));
    expect(err).toMatch(/CODE_REVIEW_GHE_BASE_URL/);
    expect(err).toMatch(/CODE_REVIEW_GHE_TOKEN/);
  });

  it('github-app names app id, installation id, and a private key source', () => {
    const err = grab(() => buildCodeReviewConfig({ CODE_REVIEW_PROVIDER: 'github-app', CODE_REVIEW_GHE_BASE_URL: 'https://ghe.example.com' }));
    expect(err).toMatch(/CODE_REVIEW_GHE_APP_ID/);
    expect(err).toMatch(/CODE_REVIEW_GHE_INSTALLATION_ID/);
    expect(err).toMatch(/CODE_REVIEW_GHE_PRIVATE_KEY/);
  });

  it('builds a valid azure-devops config', () => {
    const config = buildCodeReviewConfig({
      CODE_REVIEW_PROVIDER: 'azure-devops',
      CODE_REVIEW_AZDO_ORGANIZATION: 'contoso',
      CODE_REVIEW_AZDO_PAT: 'pat',
      CODE_REVIEW_AZDO_PROJECT: 'MyProject',
    });
    expect(config).toMatchObject({ provider: 'azure-devops', azdoOrganization: 'contoso', azdoProject: 'MyProject' });
  });
});

describe('azure-devops auth method - entra-id is opt-in, pat stays the default', () => {
  const AZDO_ENTRA = {
    CODE_REVIEW_PROVIDER: 'azure-devops',
    CODE_REVIEW_AZDO_AUTH_METHOD: 'entra-id',
    CODE_REVIEW_AZDO_ORGANIZATION: 'contoso',
    CODE_REVIEW_AZDO_CLIENT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    CODE_REVIEW_AZDO_CLIENT_SECRET: 'placeholder-secret-value',
    CODE_REVIEW_AZDO_TENANT_ID: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff',
  };

  it('defaults to pat when the variable is absent, so existing configs are untouched', () => {
    const config = buildCodeReviewConfig({
      CODE_REVIEW_PROVIDER: 'azure-devops',
      CODE_REVIEW_AZDO_ORGANIZATION: 'contoso',
      CODE_REVIEW_AZDO_PAT: 'pat',
    });
    expect(config.azdoAuthMethod).toBe('pat');
  });

  it('rejects an unknown auth method by name', () => {
    expect(() => buildCodeReviewConfig({ ...AZDO_ENTRA, CODE_REVIEW_AZDO_AUTH_METHOD: 'oauth' })).toThrow(
      /CODE_REVIEW_AZDO_AUTH_METHOD.*pat, entra-id/s,
    );
  });

  it('entra-id names every missing credential variable and does NOT demand a PAT', () => {
    const err = grab(() =>
      buildCodeReviewConfig({
        CODE_REVIEW_PROVIDER: 'azure-devops',
        CODE_REVIEW_AZDO_AUTH_METHOD: 'entra-id',
        CODE_REVIEW_AZDO_ORGANIZATION: 'contoso',
      }),
    );
    expect(err).toMatch(/CODE_REVIEW_AZDO_CLIENT_ID/);
    expect(err).toMatch(/CODE_REVIEW_AZDO_CLIENT_SECRET/);
    expect(err).toMatch(/CODE_REVIEW_AZDO_TENANT_ID/);
    expect(err).not.toMatch(/CODE_REVIEW_AZDO_PAT/);
  });

  it('builds a valid entra-id config with no PAT present', () => {
    const config = buildCodeReviewConfig(AZDO_ENTRA);
    expect(config).toMatchObject({
      provider: 'azure-devops',
      azdoAuthMethod: 'entra-id',
      azdoOrganization: 'contoso',
      azdoTenantId: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff',
    });
    expect(config.azdoPat).toBeUndefined();
  });

  it('pat mode still demands the PAT and ignores the entra variables', () => {
    const err = grab(() =>
      buildCodeReviewConfig({
        CODE_REVIEW_PROVIDER: 'azure-devops',
        CODE_REVIEW_AZDO_AUTH_METHOD: 'pat',
        CODE_REVIEW_AZDO_ORGANIZATION: 'contoso',
      }),
    );
    expect(err).toMatch(/CODE_REVIEW_AZDO_PAT/);
    expect(err).not.toMatch(/CODE_REVIEW_AZDO_CLIENT_ID/);
  });
});

describe('parseAllowedRepositories', () => {
  it('splits a comma list and lowercases', () => {
    expect(parseAllowedRepositories({ CODE_REVIEW_ALLOWED_REPOSITORIES: 'Repo-A, repo-b ' })).toEqual(['repo-a', 'repo-b']);
  });
  it('returns undefined when unset (no filtering)', () => {
    expect(parseAllowedRepositories({})).toBeUndefined();
  });
});

function grab(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('expected a throw');
}
