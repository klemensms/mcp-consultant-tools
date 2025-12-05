/**
 * Azure AD B2C Integration
 *
 * Provides user management capabilities for Azure AD B2C tenants via Microsoft Graph API.
 * Supports user listing, search, password management, and group operations.
 *
 * Security Model:
 * - Read-only operations: Always enabled (list, get, search users/groups)
 * - Password operations: Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true
 * - User creation: Requires AZURE_B2C_ENABLE_USER_CREATE=true
 * - User deletion: Requires AZURE_B2C_ENABLE_USER_DELETE=true
 *
 * Authentication:
 * - Uses Microsoft Graph API with client credentials flow
 * - Requires app registration with User.ReadWrite.All permission
 * - App must have "User Administrator" role for password operations
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client, PageCollection } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { auditLogger } from '@mcp-consultant-tools/core';

// ============================================================================
// Interfaces and Types
// ============================================================================

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
  tenantId: string;           // B2C tenant ID (GUID or domain like contoso.onmicrosoft.com)
  clientId: string;           // App registration client ID
  clientSecret: string;       // App registration client secret
  enablePasswordReset: boolean;  // Allow password operations
  enableUserCreate: boolean;     // Allow user creation
  enableUserUpdate: boolean;     // Allow user profile updates
  enableUserDelete: boolean;     // Allow user deletion
  maxResults?: number;           // Default: 100
  cacheUsersTTL?: number;        // Default: 300s (5 minutes)
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

// ============================================================================
// AzureB2CService Class
// ============================================================================

export class AzureB2CService {
  private config: AzureB2CConfig;
  private graphClient: Client | null = null;
  private credential: ClientSecretCredential | null = null;

  // Cache for user/group lists
  private usersCache: { data: B2CUser[]; expires: number } | null = null;
  private groupsCache: { data: B2CGroup[]; expires: number } | null = null;

  constructor(config: AzureB2CConfig) {
    // Apply defaults
    this.config = {
      maxResults: 100,
      cacheUsersTTL: 300,
      ...config,
    };

    // Validate required fields
    if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'Azure B2C requires tenantId, clientId, and clientSecret configuration'
      );
    }
  }

  // ==========================================================================
  // Authentication / Client Setup
  // ==========================================================================

  /**
   * Get or create the Microsoft Graph client
   */
  private getClient(): Client {
    if (!this.graphClient) {
      // Create credential
      this.credential = new ClientSecretCredential(
        this.config.tenantId,
        this.config.clientId,
        this.config.clientSecret
      );

      // Create auth provider
      const authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      // Create Graph client
      this.graphClient = Client.initWithMiddleware({
        authProvider,
      });
    }

    return this.graphClient;
  }

  // ==========================================================================
  // Read-Only User Operations (Always Enabled)
  // ==========================================================================

  /**
   * List all users with pagination
   */
  async listUsers(
    top: number = 50,
    filter?: string,
    skipCache: boolean = false
  ): Promise<B2CUser[]> {
    const timer = auditLogger.startTimer();

    // Check cache if not skipping
    if (!skipCache && !filter && this.usersCache && this.usersCache.expires > Date.now()) {
      console.error('Returning cached user list');
      return this.usersCache.data.slice(0, top);
    }

    try {
      const client = this.getClient();
      const limit = Math.min(top, this.config.maxResults!);

      let request = client
        .api('/users')
        .top(limit)
        .select([
          'id',
          'displayName',
          'givenName',
          'surname',
          'userPrincipalName',
          'mail',
          'otherMails',
          'identities',
          'accountEnabled',
          'createdDateTime',
          'jobTitle',
          'department',
          'mobilePhone',
          'city',
          'country',
        ]);

      if (filter) {
        request = request.filter(filter);
      }

      const response = await request.get();
      const users = this.mapUsersResponse(response.value);

      // Cache if no filter
      if (!filter) {
        this.usersCache = {
          data: users,
          expires: Date.now() + this.config.cacheUsersTTL! * 1000,
        };
      }

      auditLogger.log({
        operation: 'list-users',
        operationType: 'READ',
        componentType: 'User',
        parameters: { top: limit, filter: filter || 'none' },
        success: true,
        executionTimeMs: timer(),
      });

      return users;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-users',
        operationType: 'READ',
        componentType: 'User',
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'list users');
    }
  }

  /**
   * Get user by ID or email
   */
  async getUser(userIdOrEmail: string): Promise<B2CUser> {
    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      const response = await client
        .api(`/users/${userIdOrEmail}`)
        .select([
          'id',
          'displayName',
          'givenName',
          'surname',
          'userPrincipalName',
          'mail',
          'otherMails',
          'identities',
          'accountEnabled',
          'createdDateTime',
          'jobTitle',
          'department',
          'mobilePhone',
          'city',
          'country',
        ])
        .get();

      const user = this.mapUserResponse(response);

      auditLogger.log({
        operation: 'get-user',
        operationType: 'READ',
        componentType: 'User',
        componentName: userIdOrEmail,
        success: true,
        executionTimeMs: timer(),
      });

      return user;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-user',
        operationType: 'READ',
        componentType: 'User',
        componentName: userIdOrEmail,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'get user');
    }
  }

  /**
   * Search users by display name, email, or other criteria
   */
  async searchUsers(
    searchTerm: string,
    searchFields: ('displayName' | 'mail' | 'userPrincipalName' | 'givenName' | 'surname')[] = ['displayName', 'mail'],
    top: number = 25
  ): Promise<B2CUser[]> {
    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();
      const limit = Math.min(top, this.config.maxResults!);

      // Build filter using startswith for each field
      const filters = searchFields.map(
        (field) => `startswith(${field}, '${searchTerm.replace(/'/g, "''")}')`
      );
      const filterString = filters.join(' or ');

      const response = await client
        .api('/users')
        .top(limit)
        .filter(filterString)
        .select([
          'id',
          'displayName',
          'givenName',
          'surname',
          'userPrincipalName',
          'mail',
          'otherMails',
          'identities',
          'accountEnabled',
          'createdDateTime',
        ])
        .get();

      const users = this.mapUsersResponse(response.value);

      auditLogger.log({
        operation: 'search-users',
        operationType: 'READ',
        componentType: 'User',
        parameters: { searchTerm, searchFields, resultCount: users.length },
        success: true,
        executionTimeMs: timer(),
      });

      return users;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-users',
        operationType: 'READ',
        componentType: 'User',
        parameters: { searchTerm },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'search users');
    }
  }

  // ==========================================================================
  // Read-Only Group Operations (Always Enabled)
  // ==========================================================================

  /**
   * List all groups
   */
  async listGroups(top: number = 50): Promise<B2CGroup[]> {
    const timer = auditLogger.startTimer();

    // Check cache
    if (this.groupsCache && this.groupsCache.expires > Date.now()) {
      console.error('Returning cached group list');
      return this.groupsCache.data.slice(0, top);
    }

    try {
      const client = this.getClient();
      const limit = Math.min(top, this.config.maxResults!);

      const response = await client
        .api('/groups')
        .top(limit)
        .select(['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled'])
        .get();

      const groups = this.mapGroupsResponse(response.value);

      // Cache the result
      this.groupsCache = {
        data: groups,
        expires: Date.now() + this.config.cacheUsersTTL! * 1000,
      };

      auditLogger.log({
        operation: 'list-groups',
        operationType: 'READ',
        componentType: 'Group',
        parameters: { top: limit, groupCount: groups.length },
        success: true,
        executionTimeMs: timer(),
      });

      return groups;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-groups',
        operationType: 'READ',
        componentType: 'Group',
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'list groups');
    }
  }

  /**
   * Get groups a user belongs to
   */
  async getUserGroups(userId: string): Promise<B2CGroup[]> {
    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      const response = await client
        .api(`/users/${userId}/memberOf`)
        .select(['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled'])
        .get();

      // Filter to only groups (memberOf can include roles too)
      const groups = response.value
        .filter((item: any) => item['@odata.type'] === '#microsoft.graph.group')
        .map((g: any) => this.mapGroupResponse(g));

      auditLogger.log({
        operation: 'get-user-groups',
        operationType: 'READ',
        componentType: 'Group',
        componentName: userId,
        parameters: { groupCount: groups.length },
        success: true,
        executionTimeMs: timer(),
      });

      return groups;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-user-groups',
        operationType: 'READ',
        componentType: 'Group',
        componentName: userId,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'get user groups');
    }
  }

  /**
   * Get members of a group
   */
  async getGroupMembers(groupId: string, top: number = 50): Promise<B2CUser[]> {
    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();
      const limit = Math.min(top, this.config.maxResults!);

      const response = await client
        .api(`/groups/${groupId}/members`)
        .top(limit)
        .select([
          'id',
          'displayName',
          'givenName',
          'surname',
          'userPrincipalName',
          'mail',
          'accountEnabled',
        ])
        .get();

      // Filter to only users
      const users = response.value
        .filter((item: any) => item['@odata.type'] === '#microsoft.graph.user')
        .map((u: any) => this.mapUserResponse(u));

      auditLogger.log({
        operation: 'get-group-members',
        operationType: 'READ',
        componentType: 'Group',
        componentName: groupId,
        parameters: { memberCount: users.length },
        success: true,
        executionTimeMs: timer(),
      });

      return users;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-group-members',
        operationType: 'READ',
        componentType: 'Group',
        componentName: groupId,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'get group members');
    }
  }

  // ==========================================================================
  // Password Operations (Requires enablePasswordReset=true)
  // ==========================================================================

  /**
   * Reset user password
   * Requires: AZURE_B2C_ENABLE_PASSWORD_RESET=true
   */
  async resetUserPassword(
    userId: string,
    newPassword: string,
    forceChangeOnNextLogin: boolean = false
  ): Promise<void> {
    this.checkPermission('password reset', this.config.enablePasswordReset);

    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      await client.api(`/users/${userId}`).update({
        passwordProfile: {
          password: newPassword,
          forceChangePasswordNextSignIn: forceChangeOnNextLogin,
        },
      });

      auditLogger.log({
        operation: 'reset-password',
        operationType: 'UPDATE',
        componentType: 'User',
        componentName: userId,
        parameters: { forceChangeOnNextLogin },
        success: true,
        executionTimeMs: timer(),
      });

      // Invalidate user cache
      this.usersCache = null;
    } catch (error: any) {
      auditLogger.log({
        operation: 'reset-password',
        operationType: 'UPDATE',
        componentType: 'User',
        componentName: userId,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'reset password');
    }
  }

  /**
   * Force password change on next login
   * Requires: AZURE_B2C_ENABLE_PASSWORD_RESET=true
   */
  async forcePasswordChange(userId: string): Promise<void> {
    this.checkPermission('password reset', this.config.enablePasswordReset);

    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      await client.api(`/users/${userId}`).update({
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
        },
      });

      auditLogger.log({
        operation: 'force-password-change',
        operationType: 'UPDATE',
        componentType: 'User',
        componentName: userId,
        success: true,
        executionTimeMs: timer(),
      });

      // Invalidate user cache
      this.usersCache = null;
    } catch (error: any) {
      auditLogger.log({
        operation: 'force-password-change',
        operationType: 'UPDATE',
        componentType: 'User',
        componentName: userId,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'force password change');
    }
  }

  // ==========================================================================
  // User Creation Operations (Requires enableUserCreate=true)
  // ==========================================================================

  /**
   * Create a new local account user
   * Requires: AZURE_B2C_ENABLE_USER_CREATE=true
   */
  async createUser(request: CreateUserRequest): Promise<B2CUser> {
    this.checkPermission('user creation', this.config.enableUserCreate);

    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      const response = await client.api('/users').post({
        displayName: request.displayName,
        identities: request.identities,
        passwordProfile: request.passwordProfile,
        givenName: request.givenName,
        surname: request.surname,
        jobTitle: request.jobTitle,
        department: request.department,
        mobilePhone: request.mobilePhone,
        city: request.city,
        country: request.country,
      });

      const user = this.mapUserResponse(response);

      auditLogger.log({
        operation: 'create-user',
        operationType: 'CREATE',
        componentType: 'User',
        componentName: request.displayName,
        success: true,
        executionTimeMs: timer(),
      });

      // Invalidate user cache
      this.usersCache = null;

      return user;
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-user',
        operationType: 'CREATE',
        componentType: 'User',
        componentName: request.displayName,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'create user');
    }
  }

  /**
   * Update user profile (non-password fields)
   * Requires: AZURE_B2C_ENABLE_USER_UPDATE=true
   */
  async updateUser(userId: string, updates: UpdateUserRequest): Promise<B2CUser> {
    this.checkPermission('user update', this.config.enableUserUpdate);

    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      await client.api(`/users/${userId}`).update(updates);

      // Fetch updated user
      const user = await this.getUser(userId);

      auditLogger.log({
        operation: 'update-user',
        operationType: 'UPDATE',
        componentType: 'User',
        componentName: userId,
        parameters: { updatedFields: Object.keys(updates) },
        success: true,
        executionTimeMs: timer(),
      });

      // Invalidate user cache
      this.usersCache = null;

      return user;
    } catch (error: any) {
      auditLogger.log({
        operation: 'update-user',
        operationType: 'UPDATE',
        componentType: 'User',
        componentName: userId,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'update user');
    }
  }

  // ==========================================================================
  // User Deletion Operations (Requires enableUserDelete=true)
  // ==========================================================================

  /**
   * Delete a user (irreversible)
   * Requires: AZURE_B2C_ENABLE_USER_DELETE=true
   */
  async deleteUser(userId: string): Promise<void> {
    this.checkPermission('user deletion', this.config.enableUserDelete);

    const timer = auditLogger.startTimer();

    try {
      const client = this.getClient();

      await client.api(`/users/${userId}`).delete();

      auditLogger.log({
        operation: 'delete-user',
        operationType: 'DELETE',
        componentType: 'User',
        componentName: userId,
        success: true,
        executionTimeMs: timer(),
      });

      // Invalidate user cache
      this.usersCache = null;
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-user',
        operationType: 'DELETE',
        componentType: 'User',
        componentName: userId,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'delete user');
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get tenant summary (user/group counts)
   */
  async getTenantSummary(): Promise<TenantSummary> {
    const timer = auditLogger.startTimer();

    try {
      const [users, groups] = await Promise.all([
        this.listUsers(1000), // Get up to 1000 users for counting
        this.listGroups(1000),
      ]);

      const enabledUsers = users.filter((u) => u.accountEnabled);
      const disabledUsers = users.filter((u) => !u.accountEnabled);

      // Count by identity type
      let localAccountCount = 0;
      let federatedAccountCount = 0;

      for (const user of users) {
        if (user.identities) {
          const hasLocal = user.identities.some(
            (i) => i.signInType === 'emailAddress' || i.signInType === 'userName'
          );
          const hasFederated = user.identities.some((i) => i.signInType === 'federated');

          if (hasLocal) localAccountCount++;
          if (hasFederated) federatedAccountCount++;
        }
      }

      const summary: TenantSummary = {
        tenantId: this.config.tenantId,
        userCount: users.length,
        groupCount: groups.length,
        enabledUserCount: enabledUsers.length,
        disabledUserCount: disabledUsers.length,
        localAccountCount,
        federatedAccountCount,
      };

      auditLogger.log({
        operation: 'get-tenant-summary',
        operationType: 'READ',
        componentType: 'Tenant',
        success: true,
        executionTimeMs: timer(),
      });

      return summary;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-tenant-summary',
        operationType: 'READ',
        componentType: 'Tenant',
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.enhanceError(error, 'get tenant summary');
    }
  }

  /**
   * Test connection to the B2C tenant
   */
  async testConnection(): Promise<{
    connected: boolean;
    tenantId: string;
    canReadUsers: boolean;
    canReadGroups: boolean;
    error?: string;
  }> {
    const timer = auditLogger.startTimer();

    try {
      let canReadUsers = false;
      let canReadGroups = false;

      // Test user read
      try {
        await this.listUsers(1);
        canReadUsers = true;
      } catch (e: any) {
        console.error(`Cannot read users: ${e.message}`);
      }

      // Test group read
      try {
        await this.listGroups(1);
        canReadGroups = true;
      } catch (e: any) {
        console.error(`Cannot read groups: ${e.message}`);
      }

      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'Tenant',
        success: true,
        executionTimeMs: timer(),
      });

      return {
        connected: canReadUsers || canReadGroups,
        tenantId: this.config.tenantId,
        canReadUsers,
        canReadGroups,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'Tenant',
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      return {
        connected: false,
        tenantId: this.config.tenantId,
        canReadUsers: false,
        canReadGroups: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current configuration status
   */
  getConfigStatus(): {
    tenantId: string;
    enablePasswordReset: boolean;
    enableUserCreate: boolean;
    enableUserUpdate: boolean;
    enableUserDelete: boolean;
  } {
    return {
      tenantId: this.config.tenantId,
      enablePasswordReset: this.config.enablePasswordReset,
      enableUserCreate: this.config.enableUserCreate,
      enableUserUpdate: this.config.enableUserUpdate,
      enableUserDelete: this.config.enableUserDelete,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Check if operation is permitted
   */
  private checkPermission(operation: string, enabled: boolean): void {
    if (!enabled) {
      throw new Error(
        `${operation} is not enabled. ` +
          `Set the appropriate environment variable to enable this operation.`
      );
    }
  }

  /**
   * Map Graph API user response to B2CUser
   */
  private mapUserResponse(response: any): B2CUser {
    return {
      id: response.id,
      displayName: response.displayName,
      givenName: response.givenName,
      surname: response.surname,
      userPrincipalName: response.userPrincipalName,
      mail: response.mail,
      otherMails: response.otherMails,
      identities: response.identities,
      accountEnabled: response.accountEnabled,
      createdDateTime: response.createdDateTime,
      jobTitle: response.jobTitle,
      department: response.department,
      mobilePhone: response.mobilePhone,
      city: response.city,
      country: response.country,
    };
  }

  /**
   * Map array of Graph API user responses
   */
  private mapUsersResponse(responses: any[]): B2CUser[] {
    return responses.map((r) => this.mapUserResponse(r));
  }

  /**
   * Map Graph API group response to B2CGroup
   */
  private mapGroupResponse(response: any): B2CGroup {
    return {
      id: response.id,
      displayName: response.displayName,
      description: response.description,
      mailEnabled: response.mailEnabled,
      securityEnabled: response.securityEnabled,
    };
  }

  /**
   * Map array of Graph API group responses
   */
  private mapGroupsResponse(responses: any[]): B2CGroup[] {
    return responses.map((r) => this.mapGroupResponse(r));
  }

  /**
   * Enhance error with helpful context
   */
  private enhanceError(error: any, operation: string): Error {
    const message = error.message || String(error);

    // Handle common Graph API errors
    if (error.statusCode === 401 || message.includes('Unauthorized')) {
      return new Error(
        `Unauthorized to ${operation}. ` +
          `Verify app registration has correct API permissions (User.ReadWrite.All) ` +
          `and "User Administrator" role assignment. ` +
          `Original error: ${message}`
      );
    }

    if (error.statusCode === 403 || message.includes('Forbidden')) {
      return new Error(
        `Forbidden to ${operation}. ` +
          `The app may lack required permissions or role assignments. ` +
          `Original error: ${message}`
      );
    }

    if (error.statusCode === 404 || message.includes('Request_ResourceNotFound')) {
      return new Error(
        `Resource not found when attempting to ${operation}. ` +
          `Verify the user/group ID is correct. ` +
          `Original error: ${message}`
      );
    }

    if (message.includes('Invalid password')) {
      return new Error(
        `Invalid password format. Password must meet Azure AD B2C complexity requirements: ` +
          `8-256 characters, at least 3 of: lowercase, uppercase, digit, symbol. ` +
          `Original error: ${message}`
      );
    }

    return new Error(`Failed to ${operation}: ${message}`);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.usersCache = null;
    this.groupsCache = null;
  }
}
