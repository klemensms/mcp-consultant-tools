/**
 * User CLI Commands - 8 commands mapping to user-related MCP tools
 *
 * Read-only: list, get, search
 * Password: reset-password, force-pwd-change
 * Write: create, update, delete
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import type { CreateUserRequest, UpdateUserRequest } from '../../models/index.js';
import { outputResult } from '../output.js';

export function registerUserCommands(program: Command, ctx: ServiceContext): void {
  const user = program.command('user').description('User management operations');

  // ========================================
  // READ-ONLY
  // ========================================

  user
    .command('list')
    .description('List Azure AD B2C users with optional filtering')
    .option('-n, --top <n>', 'Maximum number of users to return', '50')
    .option('-f, --filter <expr>', 'OData filter expression')
    .option('--all-fields', 'Return all fields including extension_* attributes', false)
    .action(async (opts: any) => {
      try {
        const users = await ctx.users.listUsers(
          parseInt(opts.top),
          opts.filter,
          false,
          opts.allFields
        );
        outputResult(
          {
            fileName: 'b2c-users',
            data: users,
            summary: `Found ${Array.isArray(users) ? users.length : 0} user(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list users'); }
    });

  user
    .command('get')
    .description('Get detailed information about a specific user')
    .argument('<userId>', 'User ID (GUID) or email address')
    .option('--all-fields', 'Return all fields including extension_* attributes', false)
    .action(async (userId: string, opts: any) => {
      try {
        const result = await ctx.users.getUser(userId, opts.allFields);
        outputResult(
          {
            fileName: `b2c-user-${userId}`,
            data: result,
            summary: `User: ${(result as any).displayName || userId}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get user'); }
    });

  user
    .command('search')
    .description('Search for users by display name, email, or other fields')
    .argument('<searchTerm>', 'Search term to match against user fields')
    .option('-f, --fields <fields>', 'Comma-separated fields to search (displayName,mail,userPrincipalName,givenName,surname)', 'displayName,mail')
    .option('-n, --top <n>', 'Maximum results to return', '25')
    .option('--all-fields', 'Return all fields including extension_* attributes', false)
    .action(async (searchTerm: string, opts: any) => {
      try {
        const searchFields = opts.fields.split(',').map((f: string) => f.trim()) as any;
        const users = await ctx.users.searchUsers(
          searchTerm,
          searchFields,
          parseInt(opts.top),
          opts.allFields
        );
        outputResult(
          {
            fileName: `b2c-search-${searchTerm.replace(/\s+/g, '-')}`,
            data: users,
            summary: `Found ${Array.isArray(users) ? users.length : 0} user(s) matching '${searchTerm}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search users'); }
    });

  // ========================================
  // PASSWORD OPERATIONS
  // ========================================

  user
    .command('reset-password')
    .description('Reset a user\'s password (requires AZURE_B2C_ENABLE_PASSWORD_RESET=true)')
    .argument('<userId>', 'User ID (GUID) or email address')
    .argument('<newPassword>', 'New password (must meet B2C complexity requirements)')
    .option('--force-change', 'Force user to change password on next login', false)
    .action(async (userId: string, newPassword: string, opts: any) => {
      try {
        await ctx.users.resetUserPassword(userId, newPassword, opts.forceChange);
        outputResult(
          { persist: false,
            fileName: `b2c-reset-pwd-${userId}`,
            data: { success: true, message: `Password reset for user ${userId}`, forceChangeOnNextLogin: opts.forceChange },
            summary: `Password reset successfully for user ${userId}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'reset password'); }
    });

  user
    .command('force-pwd-change')
    .description('Force a user to change their password on next login (requires AZURE_B2C_ENABLE_PASSWORD_RESET=true)')
    .argument('<userId>', 'User ID (GUID) or email address')
    .action(async (userId: string) => {
      try {
        await ctx.users.forcePasswordChange(userId);
        outputResult(
          {
            fileName: `b2c-force-pwd-${userId}`,
            data: { success: true, message: `User ${userId} will be required to change password on next login` },
            summary: `User ${userId} will be required to change password on next login`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'force password change'); }
    });

  // ========================================
  // CREATE / UPDATE / DELETE
  // ========================================

  user
    .command('create')
    .description('Create a new local account user (requires AZURE_B2C_ENABLE_USER_CREATE=true)')
    .requiredOption('--display-name <name>', 'User\'s display name')
    .requiredOption('--email <email>', 'User\'s email address (used for sign-in)')
    .requiredOption('--password <password>', 'Initial password (must meet B2C complexity requirements)')
    .option('--no-force-change', 'Do not force password change on first login')
    .option('--given-name <name>', 'First name')
    .option('--surname <name>', 'Last name')
    .option('--job-title <title>', 'Job title')
    .option('--department <dept>', 'Department')
    .option('--mobile-phone <phone>', 'Mobile phone number')
    .option('--city <city>', 'City')
    .option('--country <country>', 'Country')
    .action(async (opts: any) => {
      try {
        const configStatus = ctx.users.getConfigStatus();
        const issuer = configStatus.tenantId.includes('.')
          ? configStatus.tenantId
          : `${configStatus.tenantId}.onmicrosoft.com`;

        const request: CreateUserRequest = {
          displayName: opts.displayName,
          identities: [
            {
              signInType: 'emailAddress',
              issuer: issuer,
              issuerAssignedId: opts.email,
            },
          ],
          passwordProfile: {
            password: opts.password,
            forceChangePasswordNextSignIn: opts.forceChange !== false,
          },
          givenName: opts.givenName,
          surname: opts.surname,
          jobTitle: opts.jobTitle,
          department: opts.department,
          mobilePhone: opts.mobilePhone,
          city: opts.city,
          country: opts.country,
        };

        const result = await ctx.users.createUser(request);
        outputResult(
          { persist: false,
            fileName: `b2c-created-user`,
            data: { success: true, message: 'User created successfully', user: result },
            summary: `Created user '${opts.displayName}' (${(result as any).id})`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create user'); }
    });

  user
    .command('update')
    .description('Update a user\'s profile information (requires AZURE_B2C_ENABLE_USER_UPDATE=true)')
    .argument('<userId>', 'User ID (GUID) or email address')
    .option('--display-name <name>', 'New display name')
    .option('--given-name <name>', 'First name')
    .option('--surname <name>', 'Last name')
    .option('--job-title <title>', 'Job title')
    .option('--department <dept>', 'Department')
    .option('--mobile-phone <phone>', 'Mobile phone number')
    .option('--city <city>', 'City')
    .option('--country <country>', 'Country')
    .option('--account-enabled <bool>', 'Enable or disable the account (true/false)')
    .action(async (userId: string, opts: any) => {
      try {
        const updates: UpdateUserRequest = {};
        if (opts.displayName !== undefined) updates.displayName = opts.displayName;
        if (opts.givenName !== undefined) updates.givenName = opts.givenName;
        if (opts.surname !== undefined) updates.surname = opts.surname;
        if (opts.jobTitle !== undefined) updates.jobTitle = opts.jobTitle;
        if (opts.department !== undefined) updates.department = opts.department;
        if (opts.mobilePhone !== undefined) updates.mobilePhone = opts.mobilePhone;
        if (opts.city !== undefined) updates.city = opts.city;
        if (opts.country !== undefined) updates.country = opts.country;
        if (opts.accountEnabled !== undefined) updates.accountEnabled = opts.accountEnabled === 'true';

        if (Object.keys(updates).length === 0) {
          process.stderr.write('Error: No updates provided. Specify at least one field to update.\n');
          process.exit(1);
        }

        const result = await ctx.users.updateUser(userId, updates);
        outputResult(
          { persist: false,
            fileName: `b2c-updated-user-${userId}`,
            data: { success: true, message: 'User updated successfully', updatedFields: Object.keys(updates), user: result },
            summary: `Updated user ${userId} (fields: ${Object.keys(updates).join(', ')})`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update user'); }
    });

  user
    .command('delete')
    .description('Delete a user from Azure AD B2C (IRREVERSIBLE, requires AZURE_B2C_ENABLE_USER_DELETE=true)')
    .argument('<userId>', 'User ID (GUID) to delete')
    .option('--confirm', 'Confirm deletion (required)')
    .action(async (userId: string, opts: any) => {
      try {
        if (!opts.confirm) {
          process.stderr.write('Error: Deletion not confirmed. Use --confirm to proceed.\n');
          process.exit(1);
        }

        await ctx.users.deleteUser(userId);
        outputResult(
          { persist: false,
            fileName: `b2c-deleted-user-${userId}`,
            data: { success: true, message: `User ${userId} has been permanently deleted`, warning: 'This action cannot be undone' },
            summary: `User ${userId} has been permanently deleted`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete user'); }
    });
}
