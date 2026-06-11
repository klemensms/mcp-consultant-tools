/**
 * Azure B2C Group Service
 *
 * Handles group operations, tenant summary, and connection testing.
 */

import { auditLogger } from '@mcp-consultant-tools/core';
import type { B2CClient } from '../b2c-client.js';
import type { UserService } from './user-service.js';
import type { B2CUser, B2CGroup, TenantSummary } from '../models/index.js';

export class GroupService {
  private client: B2CClient;
  private userService: UserService;

  // Cache for group lists
  private groupsCache: { data: B2CGroup[]; expires: number } | null = null;

  constructor(client: B2CClient, userService: UserService) {
    this.client = client;
    this.userService = userService;
  }

  // ==========================================================================
  // Read-Only Group Operations (Always Enabled)
  // ==========================================================================

  /**
   * List all groups
   */
  async listGroups(top: number = 50): Promise<B2CGroup[]> {
    const timer = auditLogger.startTimer();
    const config = this.client.getConfig();

    // Check cache
    if (this.groupsCache && this.groupsCache.expires > Date.now()) {
      console.error('Returning cached group list');
      return this.groupsCache.data.slice(0, top);
    }

    try {
      const graphClient = this.client.getClient();
      const limit = Math.min(top, config.maxResults!);

      const response = await graphClient
        .api('/groups')
        .top(limit)
        .select(['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled'])
        .get();

      const groups = this.client.mapGroupsResponse(response.value);

      this.groupsCache = {
        data: groups,
        expires: Date.now() + config.cacheUsersTTL! * 1000,
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

      throw this.client.enhanceError(error, 'list groups');
    }
  }

  /**
   * Get groups a user belongs to
   */
  async getUserGroups(userId: string): Promise<B2CGroup[]> {
    const timer = auditLogger.startTimer();

    try {
      const graphClient = this.client.getClient();

      const response = await graphClient
        .api(`/users/${userId}/memberOf`)
        .select(['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled'])
        .get();

      // Filter to only groups (memberOf can include roles too)
      const groups = response.value
        .filter((item: any) => item['@odata.type'] === '#microsoft.graph.group')
        .map((g: any) => this.client.mapGroupResponse(g));

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

      throw this.client.enhanceError(error, 'get user groups');
    }
  }

  /**
   * Get members of a group
   */
  async getGroupMembers(groupId: string, top: number = 50, includeAllFields: boolean = false): Promise<B2CUser[] | any[]> {
    const timer = auditLogger.startTimer();
    const config = this.client.getConfig();

    try {
      const graphClient = this.client.getClient();
      const limit = Math.min(top, config.maxResults!);

      let request = graphClient
        .api(`/groups/${groupId}/members`)
        .top(limit);

      if (!includeAllFields) {
        request = request.select([
          'id', 'displayName', 'givenName', 'surname',
          'userPrincipalName', 'mail', 'accountEnabled',
        ]);
      }

      const response = await request.get();

      // Filter to only users
      const userItems = response.value.filter((item: any) => item['@odata.type'] === '#microsoft.graph.user');

      if (includeAllFields) {
        auditLogger.log({
          operation: 'get-group-members',
          operationType: 'READ',
          componentType: 'Group',
          componentName: groupId,
          parameters: { memberCount: userItems.length, includeAllFields: true },
          success: true,
          executionTimeMs: timer(),
        });
        return userItems;
      }

      const users = userItems.map((u: any) => this.client.mapUserResponse(u));

      auditLogger.log({
        operation: 'get-group-members',
        operationType: 'READ',
        componentType: 'Group',
        componentName: groupId,
        parameters: { memberCount: users.length, includeAllFields: false },
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

      throw this.client.enhanceError(error, 'get group members');
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
    const config = this.client.getConfig();

    try {
      const [users, groups] = await Promise.all([
        this.userService.listUsers(1000) as Promise<B2CUser[]>,
        this.listGroups(1000),
      ]);

      const enabledUsers = users.filter((u) => u.accountEnabled);
      const disabledUsers = users.filter((u) => !u.accountEnabled);

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
        tenantId: config.tenantId,
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

      throw this.client.enhanceError(error, 'get tenant summary');
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
    const config = this.client.getConfig();

    try {
      let canReadUsers = false;
      let canReadGroups = false;

      try {
        await this.userService.listUsers(1);
        canReadUsers = true;
      } catch (e: any) {
        console.error(`Cannot read users: ${e.message}`);
      }

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
        tenantId: config.tenantId,
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
        tenantId: config.tenantId,
        canReadUsers: false,
        canReadGroups: false,
        error: error.message,
      };
    }
  }

  /** Clear group cache */
  clearCache(): void {
    this.groupsCache = null;
  }
}
