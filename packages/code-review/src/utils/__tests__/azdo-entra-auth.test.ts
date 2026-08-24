import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { AZURE_DEVOPS_RESOURCE_ID, describeTokenError } from '../azdo-entra-auth.js';

const PLANTED_SECRET = 'planted-entra-value-do-not-log';

describe('AZURE_DEVOPS_RESOURCE_ID', () => {
  it('is the Azure DevOps first-party app id, used as the /.default scope', () => {
    expect(`${AZURE_DEVOPS_RESOURCE_ID}/.default`).toBe('499b84ac-1321-427f-aa17-267ca6975798/.default');
  });
});

describe('describeTokenError - the client secret must never reach the message', () => {
  /** An axios error carries the outbound form body (with the secret) on `config.data`. */
  function tokenRequestFailure(status: number, data: unknown): AxiosError {
    const error = new AxiosError('Request failed with status code ' + status);
    error.config = {
      data: `grant_type=client_credentials&client_secret=${PLANTED_SECRET}`,
      headers: {} as never,
    };
    error.response = { status, data, statusText: '', headers: {}, config: error.config } as never;
    return error;
  }

  it('uses the Entra error_description and leaks nothing from the request body', () => {
    const described = describeTokenError(
      tokenRequestFailure(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret.' }),
    );
    expect(described).toContain('AADSTS7000215');
    expect(described).not.toContain(PLANTED_SECRET);
  });

  it('falls back to the error code, then to the bare status', () => {
    expect(describeTokenError(tokenRequestFailure(400, { error: 'unauthorized_client' }))).toContain('unauthorized_client');
    expect(describeTokenError(tokenRequestFailure(503, {}))).toContain('503');
  });

  it('handles a non-axios failure', () => {
    expect(describeTokenError(new Error('getaddrinfo ENOTFOUND'))).toBe('getaddrinfo ENOTFOUND');
  });
});
