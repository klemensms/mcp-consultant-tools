/**
 * Azure B2C type definitions
 */

/**
 * Azure B2C user representation
 */
export interface B2CUser {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  userPrincipalName: string;
  mail?: string;
  otherMails?: string[];
  identities?: B2CIdentity[];
  accountEnabled: boolean;
  createdDateTime?: string;
  lastSignInDateTime?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
}

/**
 * B2C Identity (local or federated)
 */
export interface B2CIdentity {
  signInType: string;  // 'emailAddress', 'userName', 'federated'
  issuer: string;
  issuerAssignedId: string;
}

/**
 * B2C Group representation
 */
export interface B2CGroup {
  id: string;
  displayName: string;
  description?: string;
  mailEnabled: boolean;
  securityEnabled: boolean;
  memberCount?: number;
}

/**
 * Password profile for user creation/update
 */
export interface PasswordProfile {
  password: string;
  forceChangePasswordNextSignIn: boolean;
}

/**
 * User creation request
 */
export interface CreateUserRequest {
  displayName: string;
  identities: B2CIdentity[];
  passwordProfile: PasswordProfile;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
}

/**
 * User update request
 */
export interface UpdateUserRequest {
  displayName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
  accountEnabled?: boolean;
}

/**
 * Azure B2C service configuration
 */
export interface AzureB2CConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  enablePasswordReset: boolean;
  enableUserCreate: boolean;
  enableUserUpdate: boolean;
  enableUserDelete: boolean;
  maxResults?: number;
  cacheUsersTTL?: number;
}

/**
 * Tenant summary information
 */
export interface TenantSummary {
  tenantId: string;
  userCount: number;
  groupCount: number;
  enabledUserCount: number;
  disabledUserCount: number;
  localAccountCount: number;
  federatedAccountCount: number;
}
