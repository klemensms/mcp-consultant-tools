/**
 * Azure B2C User Service
 *
 * Handles user CRUD, search, and password operations.
 */

import { auditLogger } from '@mcp-consultant-tools/core';
import type { PiiProtectionPipeline } from '@mcp-consultant-tools/core';
import type { B2CClient } from '../b2c-client.js';
import type { B2CUser, CreateUserRequest, UpdateUserRequest } from '../models/index.js';

export class UserService {
  private client: B2CClient;

  // Cache for user lists
  private usersCache: { data: B2CUser[]; expires: number } | null = null;

  constructor(
    client: B2CClient,
    private readonly piiPipeline?: PiiProtectionPipeline
  ) {
    this.client = client;
  }

  // Redact response data through the PII pipeline. Cache stores unredacted
  // data; redaction happens on every return so per-session salt stays
  // consistent within a process.
  private redact<T>(data: T): T {
    if (!this.piiPipeline?.isEnabled) return data;
    return this.piiPipeline.redactResponse('b2c-user', data).data;
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
    skipCache: boolean = false,
    includeAllFields: boolean = false
  ): Promise<B2CUser[] | any[]> {
    const timer = auditLogger.startTimer();
    const config = this.client.getConfig();

    // Check cache if not skipping (only for mapped responses)
    if (!skipCache && !filter && !includeAllFields && this.usersCache && this.usersCache.expires > Date.now()) {
      console.error('Returning cached user list');
      return this.redact(this.usersCache.data.slice(0, top));
    }

    try {
      const graphClient = this.client.getClient();
      const limit = Math.min(top, config.maxResults!);

      let request = graphClient
        .api('/users')
        .top(limit);

      if (!includeAllFields) {
        request = request.select([
          'id', 'displayName', 'givenName', 'surname',
          'userPrincipalName', 'mail', 'otherMails', 'identities',
          'accountEnabled', 'createdDateTime', 'jobTitle', 'department',
          'mobilePhone', 'city', 'country',
        ]);
      }

      if (filter) {
        request = request.filter(filter);
      }

      const response = await request.get();

      if (includeAllFields) {
        auditLogger.log({
          operation: 'list-users',
          operationType: 'READ',
          componentType: 'User',
          parameters: { top: limit, filter: filter || 'none', includeAllFields: true },
          success: true,
          executionTimeMs: timer(),
        });
        return this.redact(response.value);
      }

      const users = this.client.mapUsersResponse(response.value);

      if (!filter) {
        this.usersCache = {
          data: users,
          expires: Date.now() + config.cacheUsersTTL! * 1000,
        };
      }

      auditLogger.log({
        operation: 'list-users',
        operationType: 'READ',
        componentType: 'User',
        parameters: { top: limit, filter: filter || 'none', includeAllFields: false },
        success: true,
        executionTimeMs: timer(),
      });

      return this.redact(users);
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-users',
        operationType: 'READ',
        componentType: 'User',
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw this.client.enhanceError(error, 'list users');
    }
  }

  /**
   * Get user by ID or email
   */
  async getUser(userIdOrEmail: string, includeAllFields: boolean = false): Promise<B2CUser | any> {
    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      let request = graphClient.api(`/users/${userIdOrEmail}`);

      if (!includeAllFields) {
        request = request.select([
          'id', 'displayName', 'givenName', 'surname',
          'userPrincipalName', 'mail', 'otherMails', 'identities',
          'accountEnabled', 'createdDateTime', 'jobTitle', 'department',
          'mobilePhone', 'city', 'country',
        ]);
      }

      const response = await request.get();

      if (includeAllFields) {
        auditLogger.log({
          operation: 'get-user',
          operationType: 'READ',
          componentType: 'User',
          componentName: userIdOrEmail,
          parameters: { includeAllFields: true },
          success: true,
          executionTimeMs: timer(),
        });
        return this.redact(response);
      }

      const user = this.client.mapUserResponse(response);

      auditLogger.log({
        operation: 'get-user',
        operationType: 'READ',
        componentType: 'User',
        componentName: userIdOrEmail,
        parameters: { includeAllFields: false },
        success: true,
        executionTimeMs: timer(),
      });

      return this.redact(user);
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

      throw this.client.enhanceError(error, 'get user');
    }
  }

  /**
   * Search users by display name, email, or other criteria
   */
  async searchUsers(
    searchTerm: string,
    searchFields: ('displayName' | 'mail' | 'userPrincipalName' | 'givenName' | 'surname')[] = ['displayName', 'mail'],
    top: number = 25,
    includeAllFields: boolean = false
  ): Promise<B2CUser[] | any[]> {
    const timer = auditLogger.startTimer();
    const config = this.client.getConfig();

    try {
      const graphClient = this.client.getClient();
      const limit = Math.min(top, config.maxResults!);

      const filters = searchFields.map(
        (field) => `startswith(${field}, '${searchTerm.replace(/'/g, "''")}')`
      );
      const filterString = filters.join(' or ');

      let request = graphClient
        .api('/users')
        .top(limit)
        .filter(filterString);

      if (!includeAllFields) {
        request = request.select([
          'id', 'displayName', 'givenName', 'surname',
          'userPrincipalName', 'mail', 'otherMails', 'identities',
          'accountEnabled', 'createdDateTime',
        ]);
      }

      const response = await request.get();

      if (includeAllFields) {
        auditLogger.log({
          operation: 'search-users',
          operationType: 'READ',
          componentType: 'User',
          parameters: { searchTerm, searchFields, resultCount: response.value.length, includeAllFields: true },
          success: true,
          executionTimeMs: timer(),
        });
        return this.redact(response.value);
      }

      const users = this.client.mapUsersResponse(response.value);

      auditLogger.log({
        operation: 'search-users',
        operationType: 'READ',
        componentType: 'User',
        parameters: { searchTerm, searchFields, resultCount: users.length, includeAllFields: false },
        success: true,
        executionTimeMs: timer(),
      });

      return this.redact(users);
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

      throw this.client.enhanceError(error, 'search users');
    }
  }

  // ==========================================================================
  // Password Operations (Requires enablePasswordReset=true)
  // ==========================================================================

  /**
   * Reset user password
   */
  async resetUserPassword(
    userId: string,
    newPassword: string,
    forceChangeOnNextLogin: boolean = false
  ): Promise<void> {
    const config = this.client.getConfig();
    this.client.checkPermission('password reset', config.enablePasswordReset);

    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      await graphClient.api(`/users/${userId}`).update({
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

      this.invalidateCache();
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

      throw this.client.enhanceError(error, 'reset password');
    }
  }

  /**
   * Force password change on next login
   */
  async forcePasswordChange(userId: string): Promise<void> {
    const config = this.client.getConfig();
    this.client.checkPermission('password reset', config.enablePasswordReset);

    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      await graphClient.api(`/users/${userId}`).update({
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

      this.invalidateCache();
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

      throw this.client.enhanceError(error, 'force password change');
    }
  }

  // ==========================================================================
  // User Creation Operations (Requires enableUserCreate=true)
  // ==========================================================================

  /**
   * Create a new local account user
   */
  async createUser(request: CreateUserRequest): Promise<B2CUser> {
    const config = this.client.getConfig();
    this.client.checkPermission('user creation', config.enableUserCreate);

    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      const response = await graphClient.api('/users').post({
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

      const user = this.client.mapUserResponse(response);

      auditLogger.log({
        operation: 'create-user',
        operationType: 'CREATE',
        componentType: 'User',
        componentName: request.displayName,
        success: true,
        executionTimeMs: timer(),
      });

      this.invalidateCache();

      return this.redact(user);
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

      throw this.client.enhanceError(error, 'create user');
    }
  }

  /**
   * Update user profile (non-password fields)
   */
  async updateUser(userId: string, updates: UpdateUserRequest): Promise<B2CUser> {
    const config = this.client.getConfig();
    this.client.checkPermission('user update', config.enableUserUpdate);

    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      await graphClient.api(`/users/${userId}`).update(updates);

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

      this.invalidateCache();

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

      throw this.client.enhanceError(error, 'update user');
    }
  }

  // ==========================================================================
  // User Deletion Operations (Requires enableUserDelete=true)
  // ==========================================================================

  /**
   * Delete a user (irreversible)
   */
  async deleteUser(userId: string): Promise<void> {
    const config = this.client.getConfig();
    this.client.checkPermission('user deletion', config.enableUserDelete);

    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      await graphClient.api(`/users/${userId}`).delete();

      auditLogger.log({
        operation: 'delete-user',
        operationType: 'DELETE',
        componentType: 'User',
        componentName: userId,
        success: true,
        executionTimeMs: timer(),
      });

      this.invalidateCache();
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

      throw this.client.enhanceError(error, 'delete user');
    }
  }

  /** Invalidate the user cache */
  invalidateCache(): void {
    this.usersCache = null;
  }

  /** Get current config status */
  getConfigStatus(): {
    tenantId: string;
    enablePasswordReset: boolean;
    enableUserCreate: boolean;
    enableUserUpdate: boolean;
    enableUserDelete: boolean;
  } {
    const config = this.client.getConfig();
    return {
      tenantId: config.tenantId,
      enablePasswordReset: config.enablePasswordReset,
      enableUserCreate: config.enableUserCreate,
      enableUserUpdate: config.enableUserUpdate,
      enableUserDelete: config.enableUserDelete,
    };
  }
}
