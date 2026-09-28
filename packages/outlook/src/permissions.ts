/**
 * Which delegated mail permissions each group of tools needs, and how a Graph
 * 403 is explained. The server signs in with the .default scope, so it gets
 * whatever the app registration has admin consent for; a missing permission
 * breaks only the tools that need it, and signing in again cannot add it.
 */
import { isEnabled } from '@mcp-consultant-tools/m365-core';

export type MailGroup = 'read' | 'write' | 'drafts' | 'send' | 'delete';

interface GroupRule {
  /** Any one of these covers the group. */
  needs: string[];
  switch?: string;
}

const RULES: Record<MailGroup, GroupRule> = {
  read: { needs: ['Mail.Read', 'Mail.ReadWrite'] },
  write: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_WRITE' },
  drafts: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_DRAFTS' },
  send: { needs: ['Mail.Send'], switch: 'OUTLOOK_ENABLE_SEND' },
  delete: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_DELETE' },
};

const WRITE = 'OUTLOOK_ENABLE_WRITE';
const DRAFTS = 'OUTLOOK_ENABLE_DRAFTS';

/** Any one of these lets the Outlook sign-in read a SharePoint or OneDrive file it is given a link to. */
export const ATTACH_FROM_LINK_NEEDS = ['Files.Read.All', 'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All'];

/**
 * Drafts have their own switch. While OUTLOOK_ENABLE_DRAFTS is unset they
 * follow OUTLOOK_ENABLE_WRITE, so a configuration from before the split
 * behaves as it did.
 */
export function draftsFollowWrite(): boolean {
  return (process.env[DRAFTS] ?? '').trim() === '';
}

export function draftsEnabled(): boolean {
  return draftsFollowWrite() ? isEnabled(WRITE) : isEnabled(DRAFTS);
}

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

export interface DraftsAccess extends GroupAccess {
  /** True while OUTLOOK_ENABLE_DRAFTS is unset and the group follows OUTLOOK_ENABLE_WRITE. */
  followsWrite: boolean;
  /** Whether mail-add-draft-attachment can attach a linked SharePoint or OneDrive file, or only insert the link. */
  attachFromLink: { needs: string[]; granted: boolean };
}

export function describeMailAccess(grantedScopes: string[]): Record<Exclude<MailGroup, 'drafts'>, GroupAccess> & { drafts: DraftsAccess } {
  const granted = new Set(grantedScopes.map((scope) => scope.toLowerCase()));
  const describe = (rule: GroupRule): GroupAccess => ({
    needs: rule.needs,
    granted: rule.needs.some((need) => granted.has(need.toLowerCase())),
    ...(rule.switch ? { switch: rule.switch } : {}),
    enabled: rule.switch ? isEnabled(rule.switch) : true,
  });
  const hasAny = (needs: string[]) => needs.some((need) => granted.has(need.toLowerCase()));
  return {
    read: describe(RULES.read),
    write: describe(RULES.write),
    drafts: {
      ...describe(RULES.drafts),
      enabled: draftsEnabled(),
      followsWrite: draftsFollowWrite(),
      attachFromLink: { needs: ATTACH_FROM_LINK_NEEDS, granted: hasAny(ATTACH_FROM_LINK_NEEDS) },
    },
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
