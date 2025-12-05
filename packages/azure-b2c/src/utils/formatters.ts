/**
 * Formatters for Azure B2C responses
 * Converts service responses to human-readable markdown format
 */

import type { B2CUser, B2CGroup, TenantSummary } from '../AzureB2CService.js';

/**
 * Format a single user as markdown
 */
export function formatUser(user: B2CUser): string {
  const lines: string[] = [];

  lines.push(`## ${user.displayName}`);
  lines.push('');

  // Basic info
  lines.push('### Basic Information');
  lines.push(`- **ID:** ${user.id}`);
  lines.push(`- **Display Name:** ${user.displayName}`);
  if (user.givenName) lines.push(`- **First Name:** ${user.givenName}`);
  if (user.surname) lines.push(`- **Last Name:** ${user.surname}`);
  lines.push(`- **Account Enabled:** ${user.accountEnabled ? 'Yes' : 'No'}`);
  lines.push('');

  // Contact info
  lines.push('### Contact Information');
  lines.push(`- **User Principal Name:** ${user.userPrincipalName}`);
  if (user.mail) lines.push(`- **Email:** ${user.mail}`);
  if (user.otherMails && user.otherMails.length > 0) {
    lines.push(`- **Other Emails:** ${user.otherMails.join(', ')}`);
  }
  if (user.mobilePhone) lines.push(`- **Mobile Phone:** ${user.mobilePhone}`);
  lines.push('');

  // Work info
  if (user.jobTitle || user.department) {
    lines.push('### Work Information');
    if (user.jobTitle) lines.push(`- **Job Title:** ${user.jobTitle}`);
    if (user.department) lines.push(`- **Department:** ${user.department}`);
    lines.push('');
  }

  // Location
  if (user.city || user.country) {
    lines.push('### Location');
    if (user.city) lines.push(`- **City:** ${user.city}`);
    if (user.country) lines.push(`- **Country:** ${user.country}`);
    lines.push('');
  }

  // Identities
  if (user.identities && user.identities.length > 0) {
    lines.push('### Identities');
    for (const identity of user.identities) {
      const type = identity.signInType === 'federated' ? 'Federated' : 'Local';
      lines.push(`- **${type}:** ${identity.issuerAssignedId} (${identity.issuer})`);
    }
    lines.push('');
  }

  // Timestamps
  if (user.createdDateTime) {
    lines.push('### Account Details');
    lines.push(`- **Created:** ${new Date(user.createdDateTime).toLocaleString()}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format user list as markdown table
 */
export function formatUserList(users: B2CUser[]): string {
  if (users.length === 0) {
    return 'No users found.';
  }

  const lines: string[] = [];

  lines.push(`## Users (${users.length})`);
  lines.push('');
  lines.push('| Display Name | Email | Account Type | Status |');
  lines.push('|--------------|-------|--------------|--------|');

  for (const user of users) {
    const email = user.mail || user.userPrincipalName;
    const accountType = getAccountType(user);
    const status = user.accountEnabled ? 'Enabled' : 'Disabled';
    lines.push(`| ${user.displayName} | ${email} | ${accountType} | ${status} |`);
  }

  return lines.join('\n');
}

/**
 * Format a single group as markdown
 */
export function formatGroup(group: B2CGroup): string {
  const lines: string[] = [];

  lines.push(`## ${group.displayName}`);
  lines.push('');
  lines.push(`- **ID:** ${group.id}`);
  if (group.description) lines.push(`- **Description:** ${group.description}`);
  lines.push(`- **Security Group:** ${group.securityEnabled ? 'Yes' : 'No'}`);
  lines.push(`- **Mail Enabled:** ${group.mailEnabled ? 'Yes' : 'No'}`);
  if (group.memberCount !== undefined) {
    lines.push(`- **Member Count:** ${group.memberCount}`);
  }

  return lines.join('\n');
}

/**
 * Format group list as markdown table
 */
export function formatGroupList(groups: B2CGroup[]): string {
  if (groups.length === 0) {
    return 'No groups found.';
  }

  const lines: string[] = [];

  lines.push(`## Groups (${groups.length})`);
  lines.push('');
  lines.push('| Group Name | Description | Security | Mail Enabled |');
  lines.push('|------------|-------------|----------|--------------|');

  for (const group of groups) {
    const description = group.description || '-';
    const truncatedDesc = description.length > 50 ? description.substring(0, 47) + '...' : description;
    lines.push(
      `| ${group.displayName} | ${truncatedDesc} | ${group.securityEnabled ? 'Yes' : 'No'} | ${group.mailEnabled ? 'Yes' : 'No'} |`
    );
  }

  return lines.join('\n');
}

/**
 * Format user with their groups
 */
export function formatUserWithGroups(user: B2CUser, groups: B2CGroup[]): string {
  const lines: string[] = [];

  lines.push(formatUser(user));

  lines.push('### Group Memberships');
  if (groups.length === 0) {
    lines.push('User is not a member of any groups.');
  } else {
    for (const group of groups) {
      lines.push(`- **${group.displayName}** ${group.description ? `- ${group.description}` : ''}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Format tenant summary as markdown
 */
export function formatTenantSummary(summary: TenantSummary): string {
  const lines: string[] = [];

  lines.push('# Azure AD B2C Tenant Summary');
  lines.push('');
  lines.push(`**Tenant ID:** ${summary.tenantId}`);
  lines.push('');

  lines.push('## User Statistics');
  lines.push(`- **Total Users:** ${summary.userCount}`);
  lines.push(`- **Enabled Users:** ${summary.enabledUserCount}`);
  lines.push(`- **Disabled Users:** ${summary.disabledUserCount}`);
  lines.push('');

  lines.push('## Account Types');
  lines.push(`- **Local Accounts:** ${summary.localAccountCount}`);
  lines.push(`- **Federated Accounts:** ${summary.federatedAccountCount}`);
  lines.push('');

  lines.push('## Groups');
  lines.push(`- **Total Groups:** ${summary.groupCount}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format operation result as markdown
 */
export function formatOperationResult(
  operation: string,
  success: boolean,
  details?: string
): string {
  const status = success ? 'Success' : 'Failed';
  const emoji = success ? '' : '(!)';

  let result = `## ${operation} ${emoji}\n\n**Status:** ${status}`;

  if (details) {
    result += `\n\n${details}`;
  }

  return result;
}

/**
 * Helper: Get account type string from user identities
 */
function getAccountType(user: B2CUser): string {
  if (!user.identities || user.identities.length === 0) {
    return 'Unknown';
  }

  const types = new Set<string>();

  for (const identity of user.identities) {
    if (identity.signInType === 'federated') {
      // Extract provider from issuer
      const issuer = identity.issuer.toLowerCase();
      if (issuer.includes('google')) types.add('Google');
      else if (issuer.includes('facebook')) types.add('Facebook');
      else if (issuer.includes('microsoft')) types.add('Microsoft');
      else if (issuer.includes('apple')) types.add('Apple');
      else types.add('Federated');
    } else if (identity.signInType === 'emailAddress') {
      types.add('Email');
    } else if (identity.signInType === 'userName') {
      types.add('Username');
    }
  }

  return Array.from(types).join(', ') || 'Unknown';
}
