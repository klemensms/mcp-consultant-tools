#!/usr/bin/env node
/**
 * Azure AD B2C MCP Server
 *
 * Provides user management capabilities for Azure AD B2C tenants via Microsoft Graph API.
 *
 * Tools (11 total):
 * - Read-only (6): list-users, get-user, search-users, list-groups, get-user-groups, get-group-members
 * - Password (2): reset-user-password, force-password-change (requires AZURE_B2C_ENABLE_PASSWORD_RESET)
 * - User Create (1): create-user (requires AZURE_B2C_ENABLE_USER_CREATE)
 * - User Update (1): update-user (requires AZURE_B2C_ENABLE_USER_UPDATE)
 * - User Delete (1): delete-user (requires AZURE_B2C_ENABLE_USER_DELETE)
 *
 * Prompts (2):
 * - b2c-user-overview: Formatted user profile with group memberships
 * - b2c-tenant-summary: Tenant statistics and user breakdown
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { AzureB2CService } from "./AzureB2CService.js";
import type { AzureB2CConfig, CreateUserRequest, UpdateUserRequest, B2CIdentity } from "./AzureB2CService.js";
import { z } from 'zod';
import {
  formatUser,
  formatUserList,
  formatGroup,
  formatGroupList,
  formatUserWithGroups,
  formatTenantSummary,
  formatOperationResult,
} from './utils/formatters.js';

// Re-export types
export { AzureB2CService };
export type { AzureB2CConfig, B2CUser, B2CGroup, B2CIdentity, CreateUserRequest, UpdateUserRequest } from "./AzureB2CService.js";

/**
 * Register Azure B2C tools and prompts on an MCP server
 */
export function registerAzureB2CTools(server: any, b2cService?: AzureB2CService) {
  let service: AzureB2CService | null = b2cService || null;

  /**
   * Lazy initialization of AzureB2CService
   */
  function getAzureB2CService(): AzureB2CService {
    if (!service) {
      const missingConfig: string[] = [];

      const tenantId = process.env.AZURE_B2C_TENANT_ID;
      const clientId = process.env.AZURE_B2C_CLIENT_ID;
      const clientSecret = process.env.AZURE_B2C_CLIENT_SECRET;

      if (!tenantId) missingConfig.push("AZURE_B2C_TENANT_ID");
      if (!clientId) missingConfig.push("AZURE_B2C_CLIENT_ID");
      if (!clientSecret) missingConfig.push("AZURE_B2C_CLIENT_SECRET");

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure B2C configuration: ${missingConfig.join(", ")}`);
      }

      const config: AzureB2CConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
        enablePasswordReset: process.env.AZURE_B2C_ENABLE_PASSWORD_RESET === 'true',
        enableUserCreate: process.env.AZURE_B2C_ENABLE_USER_CREATE === 'true',
        enableUserUpdate: process.env.AZURE_B2C_ENABLE_USER_UPDATE === 'true',
        enableUserDelete: process.env.AZURE_B2C_ENABLE_USER_DELETE === 'true',
        maxResults: parseInt(process.env.AZURE_B2C_MAX_RESULTS || '100'),
      };

      service = new AzureB2CService(config);
      console.error("Azure B2C service initialized");
    }
    return service;
  }

  // ========================================
  // PROMPTS (2)
  // ========================================

  server.prompt(
    "b2c-user-overview",
    "Get a comprehensive overview of a user including profile details and group memberships",
    {
      userId: z.string().describe("User ID or email address"),
    },
    async ({ userId }: { userId: string }) => {
      try {
        const b2cService = getAzureB2CService();

        // Get user details and groups in parallel
        const [user, groups] = await Promise.all([
          b2cService.getUser(userId),
          b2cService.getUserGroups(userId),
        ]);

        const output = formatUserWithGroups(user, groups);

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: output,
              },
            },
          ],
        };
      } catch (error: any) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Error getting user overview: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "b2c-tenant-summary",
    "Get a summary of the Azure AD B2C tenant including user and group statistics",
    {},
    async () => {
      try {
        const b2cService = getAzureB2CService();
        const summary = await b2cService.getTenantSummary();
        const output = formatTenantSummary(summary);

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: output,
              },
            },
          ],
        };
      } catch (error: any) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Error getting tenant summary: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  // ========================================
  // READ-ONLY TOOLS (6) - Always Enabled
  // ========================================

  server.tool(
    "b2c-list-users",
    "List Azure AD B2C users with optional filtering. Returns user details including identities and account status.",
    {
      top: z.number().optional().describe("Maximum number of users to return (default: 50, max: 100)"),
      filter: z.string().optional().describe("OData filter expression (e.g., \"accountEnabled eq true\")"),
    },
    async ({ top, filter }: { top?: number; filter?: string }) => {
      try {
        const b2cService = getAzureB2CService();
        const users = await b2cService.listUsers(top || 50, filter);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(users, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing users: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-get-user",
    "Get detailed information about a specific user by ID or email address.",
    {
      userId: z.string().describe("User ID (GUID) or email address"),
    },
    async ({ userId }: { userId: string }) => {
      try {
        const b2cService = getAzureB2CService();
        const user = await b2cService.getUser(userId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(user, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting user: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-search-users",
    "Search for users by display name, email, or other fields. Uses startswith matching.",
    {
      searchTerm: z.string().describe("Search term to match against user fields"),
      searchFields: z.array(z.enum(['displayName', 'mail', 'userPrincipalName', 'givenName', 'surname']))
        .optional()
        .describe("Fields to search (default: displayName, mail)"),
      top: z.number().optional().describe("Maximum results to return (default: 25)"),
    },
    async ({ searchTerm, searchFields, top }: { searchTerm: string; searchFields?: ('displayName' | 'mail' | 'userPrincipalName' | 'givenName' | 'surname')[]; top?: number }) => {
      try {
        const b2cService = getAzureB2CService();
        const users = await b2cService.searchUsers(
          searchTerm,
          searchFields || ['displayName', 'mail'],
          top || 25
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(users, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching users: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-list-groups",
    "List all groups in the Azure AD B2C tenant.",
    {
      top: z.number().optional().describe("Maximum number of groups to return (default: 50)"),
    },
    async ({ top }: { top?: number }) => {
      try {
        const b2cService = getAzureB2CService();
        const groups = await b2cService.listGroups(top || 50);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing groups: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-get-user-groups",
    "Get all groups that a user is a member of.",
    {
      userId: z.string().describe("User ID (GUID) or email address"),
    },
    async ({ userId }: { userId: string }) => {
      try {
        const b2cService = getAzureB2CService();
        const groups = await b2cService.getUserGroups(userId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting user groups: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-get-group-members",
    "Get all members of a specific group.",
    {
      groupId: z.string().describe("Group ID (GUID)"),
      top: z.number().optional().describe("Maximum members to return (default: 50)"),
    },
    async ({ groupId, top }: { groupId: string; top?: number }) => {
      try {
        const b2cService = getAzureB2CService();
        const members = await b2cService.getGroupMembers(groupId, top || 50);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(members, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting group members: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // PASSWORD TOOLS (2) - Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true
  // ========================================

  server.tool(
    "b2c-reset-user-password",
    "Reset a user's password. Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true. Only works for local accounts (not federated/social).",
    {
      userId: z.string().describe("User ID (GUID) or email address"),
      newPassword: z.string().describe("New password (must meet B2C complexity requirements: 8-256 chars, 3 of: lowercase, uppercase, digit, symbol)"),
      forceChangeOnNextLogin: z.boolean().optional().describe("Force user to change password on next login (default: false)"),
    },
    async ({ userId, newPassword, forceChangeOnNextLogin }: { userId: string; newPassword: string; forceChangeOnNextLogin?: boolean }) => {
      try {
        const b2cService = getAzureB2CService();
        await b2cService.resetUserPassword(userId, newPassword, forceChangeOnNextLogin || false);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Password reset successfully for user ${userId}`,
                forceChangeOnNextLogin: forceChangeOnNextLogin || false,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error resetting password: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-force-password-change",
    "Force a user to change their password on next login. Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true.",
    {
      userId: z.string().describe("User ID (GUID) or email address"),
    },
    async ({ userId }: { userId: string }) => {
      try {
        const b2cService = getAzureB2CService();
        await b2cService.forcePasswordChange(userId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `User ${userId} will be required to change password on next login`,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error forcing password change: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // USER CREATE TOOLS (2) - Requires AZURE_B2C_ENABLE_USER_CREATE=true
  // ========================================

  server.tool(
    "b2c-create-user",
    "Create a new local account user in Azure AD B2C. Requires AZURE_B2C_ENABLE_USER_CREATE=true.",
    {
      displayName: z.string().describe("User's display name"),
      email: z.string().describe("User's email address (used for sign-in)"),
      password: z.string().describe("Initial password (must meet B2C complexity requirements)"),
      forceChangePasswordNextSignIn: z.boolean().optional().describe("Force password change on first login (default: true)"),
      givenName: z.string().optional().describe("First name"),
      surname: z.string().optional().describe("Last name"),
      jobTitle: z.string().optional().describe("Job title"),
      department: z.string().optional().describe("Department"),
      mobilePhone: z.string().optional().describe("Mobile phone number"),
      city: z.string().optional().describe("City"),
      country: z.string().optional().describe("Country"),
    },
    async (params: {
      displayName: string;
      email: string;
      password: string;
      forceChangePasswordNextSignIn?: boolean;
      givenName?: string;
      surname?: string;
      jobTitle?: string;
      department?: string;
      mobilePhone?: string;
      city?: string;
      country?: string;
    }) => {
      try {
        const b2cService = getAzureB2CService();

        // Get tenant domain from config for issuer
        const config = b2cService.getConfigStatus();
        const issuer = config.tenantId.includes('.') ? config.tenantId : `${config.tenantId}.onmicrosoft.com`;

        const request: CreateUserRequest = {
          displayName: params.displayName,
          identities: [
            {
              signInType: 'emailAddress',
              issuer: issuer,
              issuerAssignedId: params.email,
            },
          ],
          passwordProfile: {
            password: params.password,
            forceChangePasswordNextSignIn: params.forceChangePasswordNextSignIn !== false, // default true
          },
          givenName: params.givenName,
          surname: params.surname,
          jobTitle: params.jobTitle,
          department: params.department,
          mobilePhone: params.mobilePhone,
          city: params.city,
          country: params.country,
        };

        const user = await b2cService.createUser(request);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `User created successfully`,
                user,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating user: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-update-user",
    "Update a user's profile information (not password). Requires AZURE_B2C_ENABLE_USER_UPDATE=true.",
    {
      userId: z.string().describe("User ID (GUID) or email address"),
      displayName: z.string().optional().describe("New display name"),
      givenName: z.string().optional().describe("First name"),
      surname: z.string().optional().describe("Last name"),
      jobTitle: z.string().optional().describe("Job title"),
      department: z.string().optional().describe("Department"),
      mobilePhone: z.string().optional().describe("Mobile phone number"),
      city: z.string().optional().describe("City"),
      country: z.string().optional().describe("Country"),
      accountEnabled: z.boolean().optional().describe("Enable or disable the account"),
    },
    async (params: {
      userId: string;
      displayName?: string;
      givenName?: string;
      surname?: string;
      jobTitle?: string;
      department?: string;
      mobilePhone?: string;
      city?: string;
      country?: string;
      accountEnabled?: boolean;
    }) => {
      try {
        const b2cService = getAzureB2CService();

        const updates: UpdateUserRequest = {};
        if (params.displayName !== undefined) updates.displayName = params.displayName;
        if (params.givenName !== undefined) updates.givenName = params.givenName;
        if (params.surname !== undefined) updates.surname = params.surname;
        if (params.jobTitle !== undefined) updates.jobTitle = params.jobTitle;
        if (params.department !== undefined) updates.department = params.department;
        if (params.mobilePhone !== undefined) updates.mobilePhone = params.mobilePhone;
        if (params.city !== undefined) updates.city = params.city;
        if (params.country !== undefined) updates.country = params.country;
        if (params.accountEnabled !== undefined) updates.accountEnabled = params.accountEnabled;

        if (Object.keys(updates).length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No updates provided. Specify at least one field to update.",
              },
            ],
            isError: true,
          };
        }

        const user = await b2cService.updateUser(params.userId, updates);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `User updated successfully`,
                updatedFields: Object.keys(updates),
                user,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating user: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // USER DELETE TOOL (1) - Requires AZURE_B2C_ENABLE_USER_DELETE=true
  // ========================================

  server.tool(
    "b2c-delete-user",
    "Delete a user from Azure AD B2C. THIS ACTION IS IRREVERSIBLE. Requires AZURE_B2C_ENABLE_USER_DELETE=true.",
    {
      userId: z.string().describe("User ID (GUID) to delete"),
      confirmDeletion: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ userId, confirmDeletion }: { userId: string; confirmDeletion: boolean }) => {
      try {
        if (!confirmDeletion) {
          return {
            content: [
              {
                type: "text",
                text: "Deletion not confirmed. Set confirmDeletion to true to proceed.",
              },
            ],
            isError: true,
          };
        }

        const b2cService = getAzureB2CService();
        await b2cService.deleteUser(userId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `User ${userId} has been permanently deleted`,
                warning: "This action cannot be undone",
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting user: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// ========================================
// CLI Entry Point
// ========================================

if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "azure-b2c",
    version: "22.0.0-beta.4",
    capabilities: { tools: {}, prompts: {} }
  });

  registerAzureB2CTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Azure B2C MCP server:", error);
    process.exit(1);
  });

  console.error("Azure B2C MCP server running");
}
