/**
 * Which delegated mail permissions each group of tools needs, and how a Graph
 * 403 is explained. The server signs in with the .default scope, so it gets
 * whatever the app registration has admin consent for; a missing permission
 * breaks only the tools that need it, and signing in again cannot add it.
 */
import { isEnabled } from '@mcp-consultant-tools/m365-core';

export type MailGroup = 'read' | 'write' | 'send' | 'delete';

interface GroupRule {
  /** Any one of these covers the group. */
  needs: string[];
  switch?: string;
}

const RULES: Record<MailGroup, GroupRule> = {
  read: { needs: ['Mail.Read', 'Mail.ReadWrite'] },
  write: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_WRITE' },
  send: { needs: ['Mail.Send'], switch: 'OUTLOOK_ENABLE_SEND' },
  delete: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_DELETE' },
};

export interface GroupAccess {
  /** Delegated permissions, any one of which covers this group. */
  needs: string[];
  /** Whether the signed-in token carries one of them. */
  granted: boolean;
  /** The switch that turns the group on; read has none. */
  switch?: string;
  /** Whether the switch is on (always true for read). */
  enabled: boolean;
}

export function describeMailAccess(grantedScopes: string[]): Record<MailGroup, GroupAccess> {
  const granted = new Set(grantedScopes.map((scope) => scope.toLowerCase()));
  const describe = (rule: GroupRule): GroupAccess => ({
    needs: rule.needs,
    granted: rule.needs.some((need) => granted.has(need.toLowerCase())),
    ...(rule.switch ? { switch: rule.switch } : {}),
    enabled: rule.switch ? isEnabled(rule.switch) : true,
  });
  return {
    read: describe(RULES.read),
    write: describe(RULES.write),
    send: describe(RULES.send),
    delete: describe(RULES.delete),
  };
}

/**
 * Explain a 403 from Graph as the missing delegated permission for a tool
 * group. Any other error is returned unchanged.
 */
export function permissionHint(error: unknown, group: MailGroup): Error {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  if (statusCode !== 403) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const needs = RULES[group].needs.join(' or ');
  return new Error(
    `Microsoft Graph refused this request (403 Forbidden). The sign-in does not carry the delegated ${needs} ` +
      'permission this needs. An administrator grants it on the app registration, with admin consent; ' +
      'signing in again does not add it. Call mail-auth-status to see which permissions the sign-in carries.'
  );
}
