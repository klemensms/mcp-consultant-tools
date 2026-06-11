/**
 * Azure B2C User Tools
 *
 * 8 tools: list-users, get-user, search-users, reset-password, force-pwd-change,
 * create-user, update-user, delete-user
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import type { CreateUserRequest, UpdateUserRequest } from '../models/index.js';
import { descWithExamples, USER_FILTER_EXAMPLES, USER_ID_EXAMPLES } from '../tool-examples.js';

export function registerUserTools(server: any, ctx: ServiceContext): void {
  // ========================================
  // READ-ONLY TOOLS (3) - Always Enabled
  // ========================================

  server.tool(
    "b2c-list-users",
    "List Azure AD B2C users with optional filtering. Returns user details including identities and account status. Set includeAllFields=true to get all fields including extension_* attributes.",
    {
      top: z.number().optional().describe("Maximum number of users to return (default: 50, max: 100)"),
      filter: z.string().optional().describe(
        descWithExamples("OData filter expression", USER_FILTER_EXAMPLES)
      ),
      includeAllFields: z.boolean().optional().describe("Return all fields including extension_* attributes like CrmContactId, MemberId (default: false)"),
    },
    async ({ top, filter, includeAllFields }: { top?: number; filter?: string; includeAllFields?: boolean }) => {
      try {
        const users = await ctx.users.listUsers(top || 50, filter, false, includeAllFields || false);

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
    "Get detailed information about a specific user by ID or email address. Set includeAllFields=true to get all fields including extension_* attributes.",
    {
      userId: z.string().describe(
        descWithExamples("User ID (GUID) or email address", USER_ID_EXAMPLES)
      ),
      includeAllFields: z.boolean().optional().describe("Return all fields including extension_* attributes like CrmContactId, MemberId (default: false)"),
    },
    async ({ userId, includeAllFields }: { userId: string; includeAllFields?: boolean }) => {
      try {
        const user = await ctx.users.getUser(userId, includeAllFields || false);

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
    "Search for users by display name, email, or other fields. Uses startswith matching. Set includeAllFields=true to get all fields including extension_* attributes.",
    {
      searchTerm: z.string().describe("Search term to match against user fields (e.g., 'John', 'user@example.com')"),
      searchFields: z.array(z.enum(['displayName', 'mail', 'userPrincipalName', 'givenName', 'surname']))
        .optional()
        .describe("Fields to search. Common values: displayName, mail, userPrincipalName, givenName, surname (default: displayName, mail)"),
      top: z.number().optional().describe("Maximum results to return (default: 25)"),
      includeAllFields: z.boolean().optional().describe("Return all fields including extension_* attributes like CrmContactId, MemberId (default: false)"),
    },
    async ({ searchTerm, searchFields, top, includeAllFields }: { searchTerm: string; searchFields?: ('displayName' | 'mail' | 'userPrincipalName' | 'givenName' | 'surname')[]; top?: number; includeAllFields?: boolean }) => {
      try {
        const users = await ctx.users.searchUsers(
          searchTerm,
          searchFields || ['displayName', 'mail'],
          top || 25,
          includeAllFields || false
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

  // ========================================
  // PASSWORD TOOLS (2) - Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true
  // ========================================

  server.tool(
    "b2c-reset-user-password",
    "Reset a user's password. Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true. Only works for local accounts (not federated/social).",
    {
      userId: z.string().describe(
        descWithExamples("User ID (GUID) or email address", USER_ID_EXAMPLES)
      ),
      newPassword: z.string().describe("New password (must meet B2C complexity requirements: 8-256 chars, 3 of: lowercase, uppercase, digit, symbol)"),
      forceChangeOnNextLogin: z.boolean().optional().describe("Force user to change password on next login (default: false)"),
    },
    async ({ userId, newPassword, forceChangeOnNextLogin }: { userId: string; newPassword: string; forceChangeOnNextLogin?: boolean }) => {
      try {
        await ctx.users.resetUserPassword(userId, newPassword, forceChangeOnNextLogin || false);

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
    "b2c-force-pwd-change",
    "Force a user to change their password on next login. Requires AZURE_B2C_ENABLE_PASSWORD_RESET=true.",
    {
      userId: z.string().describe(
        descWithExamples("User ID (GUID) or email address", USER_ID_EXAMPLES)
      ),
    },
    async ({ userId }: { userId: string }) => {
      try {
        await ctx.users.forcePasswordChange(userId);

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
  // USER CREATE/UPDATE TOOLS (2)
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
        // Get tenant domain from config for issuer
        const configStatus = ctx.users.getConfigStatus();
        const issuer = configStatus.tenantId.includes('.') ? configStatus.tenantId : `${configStatus.tenantId}.onmicrosoft.com`;

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
            forceChangePasswordNextSignIn: params.forceChangePasswordNextSignIn !== false,
          },
          givenName: params.givenName,
          surname: params.surname,
          jobTitle: params.jobTitle,
          department: params.department,
          mobilePhone: params.mobilePhone,
          city: params.city,
          country: params.country,
        };

        const user = await ctx.users.createUser(request);

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
      userId: z.string().describe(
        descWithExamples("User ID (GUID) or email address", USER_ID_EXAMPLES)
      ),
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

        const user = await ctx.users.updateUser(params.userId, updates);

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
  // USER DELETE TOOL (1)
  // ========================================

  server.tool(
    "b2c-delete-user",
    "Delete a user from Azure AD B2C. THIS ACTION IS IRREVERSIBLE. Requires AZURE_B2C_ENABLE_USER_DELETE=true.",
    {
      userId: z.string().describe(
        descWithExamples("User ID (GUID) to delete", USER_ID_EXAMPLES)
      ),
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

        await ctx.users.deleteUser(userId);

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

  console.error("azure-b2c user tools registered: 8 tools");
}
