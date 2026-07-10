/**
 * Microsoft Graph v1.0 shapes (raw) and this package's output shapes (derived).
 *
 * Raw fields are typed optional wherever Graph may omit them, because Graph omits
 * anything outside `$select` rather than returning null — an over-narrow type here
 * turns a missing field into a silent `undefined` at runtime.
 * See https://learn.microsoft.com/en-us/graph/api/resources/application
 */

import type { CredentialStatus } from '../utils/credential-status.js';

// ---------------------------------------------------------------------------
// Raw Graph shapes
// ---------------------------------------------------------------------------

/** https://learn.microsoft.com/en-us/graph/api/resources/passwordcredential */
export interface GraphPasswordCredential {
  keyId?: string;
  displayName?: string | null;
  /** First three characters of the secret. `secretText` is NEVER returned on a GET. */
  hint?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
}

/** https://learn.microsoft.com/en-us/graph/api/resources/keycredential */
export interface GraphKeyCredential {
  keyId?: string;
  displayName?: string | null;
  /** e.g. `AsymmetricX509Cert`. Graph documents examples, not a closed enum. */
  type?: string | null;
  /** e.g. `Verify`. Graph documents examples, not a closed enum. */
  usage?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  /** The raw public key. Always null on a list call, even when $select-ed. Not read here. */
  key?: string | null;
}

export interface GraphResourceAccess {
  id: string;
  /** `Scope` = delegated permission, `Role` = application permission. */
  type: 'Scope' | 'Role' | string;
}

export interface GraphRequiredResourceAccess {
  resourceAppId: string;
  resourceAccess?: GraphResourceAccess[];
}

export interface GraphOAuth2PermissionScope {
  id: string;
  value?: string;
  adminConsentDisplayName?: string | null;
  isEnabled?: boolean;
}

export interface GraphAppRole {
  id: string;
  value?: string;
  displayName?: string | null;
  isEnabled?: boolean;
}

export interface GraphApplication {
  id: string;
  appId: string;
  displayName?: string | null;
  createdDateTime?: string | null;
  signInAudience?: string | null;
  passwordCredentials?: GraphPasswordCredential[];
  keyCredentials?: GraphKeyCredential[];
  web?: { redirectUris?: string[] };
  spa?: { redirectUris?: string[] };
  publicClient?: { redirectUris?: string[] };
  requiredResourceAccess?: GraphRequiredResourceAccess[];
  api?: { oauth2PermissionScopes?: GraphOAuth2PermissionScope[] };
}

export interface GraphServicePrincipal {
  appId: string;
  displayName?: string | null;
  appRoles?: GraphAppRole[];
  oauth2PermissionScopes?: GraphOAuth2PermissionScope[];
}

// ---------------------------------------------------------------------------
// Derived output shapes
// ---------------------------------------------------------------------------

interface CredentialBase {
  keyId: string | null;
  displayName: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  status: CredentialStatus;
  daysUntilExpiry: number | null;
}

export interface SecretInfo extends CredentialBase {
  /** First three characters of the secret value. Graph never returns the secret itself. */
  hint: string | null;
}

export interface CertificateInfo extends CredentialBase {
  type: string | null;
  usage: string | null;
}

export interface RedirectUriInfo {
  uri: string;
  platform: 'web' | 'spa' | 'publicClient';
}

export interface ApiPermissionInfo {
  resourceAppId: string;
  resourceDisplayName: string;
  /** The permission's machine name, or the raw GUID when the resource could not be resolved. */
  permissionName: string;
  permissionType: 'Delegated' | 'Application';
  /** True when permissionName is still a GUID because the resource SP was unreadable. */
  unresolved: boolean;
}

export interface ExposedScopeInfo {
  id: string;
  value: string | null;
  displayName: string | null;
  isEnabled: boolean;
}

/** Per-app counts, so a caller can triage without walking every credential. */
export interface CredentialCounts {
  secrets: number;
  certificates: number;
  expired: number;
  expiring: number;
  active: number;
  unknown: number;
}

export interface AppRegistrationSummary {
  objectId: string;
  appId: string;
  displayName: string | null;
  secrets: SecretInfo[];
  certificates: CertificateInfo[];
  credentialCounts: CredentialCounts;
}

export interface AppRegistrationDetail extends AppRegistrationSummary {
  createdDateTime: string | null;
  signInAudience: string | null;
  redirectUris: RedirectUriInfo[];
  apiPermissions: ApiPermissionInfo[];
  exposedScopes: ExposedScopeInfo[];
}

/**
 * `no-credentials` / `expired-credentials` / `expiring-credentials` are evaluated over
 * BOTH secrets and certificates unless `credentialType` narrows them.
 *
 * The source this was ported from filtered on secrets only, so an app whose sole
 * credential was an expiring certificate matched `no-secrets` and never matched
 * `expiring-secrets` — a false all-clear on the exact thing this tool exists to find.
 */
export type AppRegistrationFilter =
  | 'no-credentials'
  | 'expiring-credentials'
  | 'expired-credentials';

export type CredentialTypeFilter = 'any' | 'secret' | 'certificate';

export interface ListAppRegistrationsOptions {
  filter?: AppRegistrationFilter;
  credentialType?: CredentialTypeFilter;
  /** Days ahead that counts as "expiring". Also drives the `status` on every credential. */
  expiryDays?: number;
  /** Case-insensitive substring match on displayName. Applied client-side. */
  nameContains?: string;
  maxResults?: number;
}

export interface ListAppRegistrationsResult {
  applications: AppRegistrationSummary[];
  total: number;
  /** True when `maxResults` cut the list. Every count above covers only the returned rows. */
  truncated: boolean;
  /** The threshold used to classify every credential in this result. */
  expiryDays: number;
}
