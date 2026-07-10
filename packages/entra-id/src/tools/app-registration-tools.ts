import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, APPLICATION_READ_ALL, SP_CREDENTIAL_CAVEAT } from './tool-helpers.js';
import { DEFAULT_EXPIRY_DAYS } from '../services/app-registration-service.js';
import type {
  AppRegistrationFilter,
  CredentialTypeFilter,
} from '../models/entra-types.js';

export function registerAppRegistrationTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'entra-list-app-registrations',
    `Audit Entra ID app registrations for client secrets and certificates that are expiring or already expired. ` +
      `Filters cover BOTH secrets and certificates unless credentialType narrows them — an app whose only credential is an expiring certificate matches expiring-credentials, not no-credentials. ` +
      `expiryDays sets what counts as "expiring" and also drives the status on every credential returned. ` +
      `Microsoft Graph cannot filter on credential expiry or on a name substring, so any filter scans every app registration in the tenant before trimming to maxResults; when truncated is true, maxResults cut the list and the counts describe only the rows returned. ` +
      `${SP_CREDENTIAL_CAVEAT} ${APPLICATION_READ_ALL}`,
    {
      filter: z
        .enum(['no-credentials', 'expiring-credentials', 'expired-credentials'])
        .optional()
        .describe(
          'no-credentials = no secrets and no certificates at all; expiring-credentials = at least one still-valid credential expiring within expiryDays; expired-credentials = at least one credential already past its endDateTime. Omit to return every app registration.'
        ),
      credentialType: z
        .enum(['any', 'secret', 'certificate'])
        .optional()
        .describe(
          "Narrow the filter to one credential kind. Defaults to 'any' (secrets and certificates). Use 'secret' to reproduce a secrets-only audit."
        ),
      expiryDays: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          `Days ahead that count as expiring (default ${DEFAULT_EXPIRY_DAYS}). 0 means only already-expired credentials are flagged.`
        ),
      nameContains: z
        .string()
        .optional()
        .describe('Case-insensitive substring match on the app registration display name.'),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum app registrations to return. Omit for all.'),
    },
    READ_ONLY,
    async (args: {
      filter?: AppRegistrationFilter;
      credentialType?: CredentialTypeFilter;
      expiryDays?: number;
      nameContains?: string;
      maxResults?: number;
    }) => runTool('listing app registrations', () => ctx.appRegistration.listAppRegistrations(args))
  );

  server.tool(
    'entra-get-app-registration',
    `Full detail for one app registration: client secrets, certificates, redirect URIs, API permissions, and exposed OAuth2 scopes. ` +
      `Accepts either the object ID or the application (client) ID — both are GUIDs, and the object ID is tried first. ` +
      `API permission GUIDs are resolved to names via the resource's service principal; a permission the resource could not resolve is returned with unresolved=true and its raw GUID as the name. ` +
      `Microsoft Graph never returns a secret's value, only a three-character hint. ` +
      `${SP_CREDENTIAL_CAVEAT} ${APPLICATION_READ_ALL}`,
    {
      appIdOrObjectId: z
        .string()
        .describe("The app registration's object ID or application (client) ID. Must be a GUID."),
      expiryDays: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          `Days ahead that count as expiring, used to set the status on each credential (default ${DEFAULT_EXPIRY_DAYS}).`
        ),
    },
    READ_ONLY,
    async ({ appIdOrObjectId, expiryDays }: { appIdOrObjectId: string; expiryDays?: number }) =>
      runTool('getting app registration', () =>
        ctx.appRegistration.getAppRegistration(appIdOrObjectId, expiryDays ?? DEFAULT_EXPIRY_DAYS)
      )
  );
}
