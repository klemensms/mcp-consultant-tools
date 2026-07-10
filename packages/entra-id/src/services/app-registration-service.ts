/**
 * App-registration audit: which apps have client secrets or certificates that are
 * expiring or already expired.
 *
 * Graph cannot filter on credential expiry — `passwordCredentials` and `keyCredentials`
 * appear nowhere in the filterable-properties table for `/applications`. Every filter
 * here is therefore client-side, which is why a filtered list scans the whole tenant
 * before it trims. Truncating the fetch first would hide matches beyond the cut.
 * https://learn.microsoft.com/en-us/graph/aad-advanced-queries#application-properties
 */

import { EntraIdClient, statusCodeOf } from '../entra-client.js';
import { classifyCredential, type CredentialStatus } from '../utils/credential-status.js';
import { assertGuid } from '../utils/guid.js';
import type {
  GraphApplication,
  GraphPasswordCredential,
  GraphKeyCredential,
  GraphRequiredResourceAccess,
  GraphServicePrincipal,
  AppRegistrationSummary,
  AppRegistrationDetail,
  AppRegistrationFilter,
  CredentialTypeFilter,
  CredentialCounts,
  SecretInfo,
  CertificateInfo,
  RedirectUriInfo,
  ApiPermissionInfo,
  ExposedScopeInfo,
  ListAppRegistrationsOptions,
  ListAppRegistrationsResult,
} from '../models/entra-types.js';

export const DEFAULT_EXPIRY_DAYS = 30;

/**
 * Graph returns only what is selected. Omitting a credential collection here would make
 * every application look credential-free and every audit read "nothing is expiring".
 */
const LIST_SELECT = ['id', 'appId', 'displayName', 'passwordCredentials', 'keyCredentials'];

const DETAIL_SELECT = [
  ...LIST_SELECT,
  'createdDateTime',
  'signInAudience',
  'web',
  'spa',
  'publicClient',
  'requiredResourceAccess',
  'api',
];

// ---------------------------------------------------------------------------
// Pure mappers and predicates — unit-tested without a Graph client
// ---------------------------------------------------------------------------

export function toSecretInfo(
  pc: GraphPasswordCredential,
  now: Date,
  thresholdDays: number
): SecretInfo {
  const { status, daysUntilExpiry } = classifyCredential(pc.endDateTime, now, thresholdDays);
  return {
    keyId: pc.keyId ?? null,
    displayName: pc.displayName ?? null,
    hint: pc.hint ?? null,
    startDateTime: pc.startDateTime ?? null,
    endDateTime: pc.endDateTime ?? null,
    status,
    daysUntilExpiry,
  };
}

export function toCertificateInfo(
  kc: GraphKeyCredential,
  now: Date,
  thresholdDays: number
): CertificateInfo {
  const { status, daysUntilExpiry } = classifyCredential(kc.endDateTime, now, thresholdDays);
  return {
    keyId: kc.keyId ?? null,
    displayName: kc.displayName ?? null,
    type: kc.type ?? null,
    usage: kc.usage ?? null,
    startDateTime: kc.startDateTime ?? null,
    endDateTime: kc.endDateTime ?? null,
    status,
    daysUntilExpiry,
  };
}

export function countCredentials(
  secrets: SecretInfo[],
  certificates: CertificateInfo[]
): CredentialCounts {
  const byStatus: Record<CredentialStatus, number> = {
    expired: 0,
    expiring: 0,
    active: 0,
    unknown: 0,
  };

  for (const credential of [...secrets, ...certificates]) {
    byStatus[credential.status] += 1;
  }

  return {
    secrets: secrets.length,
    certificates: certificates.length,
    ...byStatus,
  };
}

export function toSummary(
  app: GraphApplication,
  now: Date,
  thresholdDays: number
): AppRegistrationSummary {
  const secrets = (app.passwordCredentials ?? []).map((pc) => toSecretInfo(pc, now, thresholdDays));
  const certificates = (app.keyCredentials ?? []).map((kc) =>
    toCertificateInfo(kc, now, thresholdDays)
  );

  return {
    objectId: app.id,
    appId: app.appId,
    displayName: app.displayName ?? null,
    secrets,
    certificates,
    credentialCounts: countCredentials(secrets, certificates),
  };
}

export function collectRedirectUris(app: GraphApplication): RedirectUriInfo[] {
  return [
    ...(app.web?.redirectUris ?? []).map((uri) => ({ uri, platform: 'web' as const })),
    ...(app.spa?.redirectUris ?? []).map((uri) => ({ uri, platform: 'spa' as const })),
    ...(app.publicClient?.redirectUris ?? []).map((uri) => ({
      uri,
      platform: 'publicClient' as const,
    })),
  ];
}

export function resolvePermissions(
  requiredResourceAccess: GraphRequiredResourceAccess[],
  servicePrincipals: Map<string, GraphServicePrincipal | null>
): ApiPermissionInfo[] {
  const permissions: ApiPermissionInfo[] = [];

  for (const resource of requiredResourceAccess) {
    const sp = servicePrincipals.get(resource.resourceAppId) ?? null;

    for (const access of resource.resourceAccess ?? []) {
      const match =
        access.type === 'Scope'
          ? sp?.oauth2PermissionScopes?.find((s) => s.id === access.id)?.value
          : sp?.appRoles?.find((r) => r.id === access.id)?.value;

      permissions.push({
        resourceAppId: resource.resourceAppId,
        resourceDisplayName: sp?.displayName ?? resource.resourceAppId,
        permissionName: match ?? access.id,
        permissionType: access.type === 'Scope' ? 'Delegated' : 'Application',
        unresolved: match === undefined,
      });
    }
  }

  return permissions;
}

/** Which credential collections a filter looks at. `any` is the default and covers both. */
function credentialsFor(
  summary: AppRegistrationSummary,
  credentialType: CredentialTypeFilter
): Array<{ status: CredentialStatus }> {
  if (credentialType === 'secret') return summary.secrets;
  if (credentialType === 'certificate') return summary.certificates;
  return [...summary.secrets, ...summary.certificates];
}

/**
 * `expiring` never overlaps `expired`: classifyCredential returns exactly one status,
 * so a filter needs no "not already expired" guard.
 */
export function matchesFilter(
  summary: AppRegistrationSummary,
  filter: AppRegistrationFilter,
  credentialType: CredentialTypeFilter
): boolean {
  const credentials = credentialsFor(summary, credentialType);

  switch (filter) {
    case 'no-credentials':
      return credentials.length === 0;
    case 'expired-credentials':
      return credentials.some((c) => c.status === 'expired');
    case 'expiring-credentials':
      return credentials.some((c) => c.status === 'expiring');
  }
}

/** Case-insensitive substring match. Client-side: Graph's $filter has no `contains`. */
export function matchesName(summary: AppRegistrationSummary, nameContains: string): boolean {
  return (summary.displayName ?? '').toLowerCase().includes(nameContains.toLowerCase());
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AppRegistrationService {
  constructor(private client: EntraIdClient) {}

  async listAppRegistrations(
    options: ListAppRegistrationsOptions = {},
    now: Date = new Date()
  ): Promise<ListAppRegistrationsResult> {
    const expiryDays = options.expiryDays ?? DEFAULT_EXPIRY_DAYS;
    const credentialType = options.credentialType ?? 'any';
    const hasClientFilter = options.filter !== undefined || options.nameContains !== undefined;

    // Only a plain unfiltered list can stop paging early; a filter must see every app first.
    const fetchLimit = hasClientFilter ? undefined : options.maxResults;

    let page;
    try {
      page = await this.client.paginate<GraphApplication>(
        '/applications',
        LIST_SELECT,
        fetchLimit
      );
    } catch (error) {
      throw this.client.enhanceError(error, 'listing app registrations');
    }

    let applications = page.items.map((app) => toSummary(app, now, expiryDays));
    let truncated = page.truncated;

    if (options.nameContains !== undefined) {
      applications = applications.filter((a) => matchesName(a, options.nameContains!));
    }

    if (options.filter !== undefined) {
      applications = applications.filter((a) => matchesFilter(a, options.filter!, credentialType));
    }

    if (hasClientFilter && options.maxResults !== undefined && applications.length > options.maxResults) {
      applications = applications.slice(0, options.maxResults);
      truncated = true;
    }

    return { applications, total: applications.length, truncated, expiryDays };
  }

  async getAppRegistration(
    appIdOrObjectId: string,
    expiryDays: number = DEFAULT_EXPIRY_DAYS,
    now: Date = new Date()
  ): Promise<AppRegistrationDetail> {
    const id = assertGuid(appIdOrObjectId, 'appIdOrObjectId');
    const app = await this.fetchApplication(id);

    const requiredResourceAccess = app.requiredResourceAccess ?? [];
    const resourceAppIds = [...new Set(requiredResourceAccess.map((r) => r.resourceAppId))];

    const resolved = await Promise.all(
      resourceAppIds.map((appId) => this.client.getServicePrincipalByAppId(appId))
    );
    const servicePrincipals = new Map(resourceAppIds.map((appId, i) => [appId, resolved[i]]));

    return {
      ...toSummary(app, now, expiryDays),
      createdDateTime: app.createdDateTime ?? null,
      signInAudience: app.signInAudience ?? null,
      redirectUris: collectRedirectUris(app),
      apiPermissions: resolvePermissions(requiredResourceAccess, servicePrincipals),
      exposedScopes: (app.api?.oauth2PermissionScopes ?? []).map(
        (s): ExposedScopeInfo => ({
          id: s.id,
          value: s.value ?? null,
          displayName: s.adminConsentDisplayName ?? null,
          isEnabled: s.isEnabled ?? false,
        })
      ),
    };
  }

  /**
   * A GUID may be either the object id or the appId, so try the object-id path and fall
   * back to the `appId` alternate key.
   *
   * Only a 404 justifies the fallback. The source this was ported from caught every error
   * here, so a 403 from a missing Application.Read.All grant surfaced as "not found".
   */
  private async fetchApplication(id: string): Promise<GraphApplication> {
    try {
      return await this.client.get<GraphApplication>(`/applications/${id}`, DETAIL_SELECT);
    } catch (error) {
      if (statusCodeOf(error) !== 404) {
        throw this.client.enhanceError(error, `getting app registration ${id}`);
      }
    }

    try {
      return await this.client.get<GraphApplication>(
        `/applications(appId='${id}')`,
        DETAIL_SELECT
      );
    } catch (error) {
      if (statusCodeOf(error) === 404) {
        throw new Error(
          `App registration not found: ${id} (looked up as both an object ID and an application ID)`
        );
      }
      throw this.client.enhanceError(error, `getting app registration ${id}`);
    }
  }
}
