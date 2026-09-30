/**
 * Which delegated mail permissions each group of tools needs, and how a Graph
 * 403 is explained. The server signs in with the .default scope, so it gets
 * whatever the app registration has admin consent for; a missing permission
 * breaks only the tools that need it, and signing in again cannot add it.
 */
import { isEnabled, requireEnabled } from '@mcp-consultant-tools/m365-core';

export type MailGroup = 'read' | 'write' | 'drafts' | 'categories' | 'send' | 'delete';

interface GroupRule {
  /** Any one of these covers the group. */
  needs: string[];
  switch?: string;
  /** A read switch: on while unset, so a configuration from before it existed keeps reading. */
  onWhenUnset?: boolean;
}

/**
 * Whether a switch is on. Write switches need the exact string `true`. Read
 * switches (onWhenUnset) are on while unset or empty and off for any other
 * value than `true`, so `false` turns them off.
 */
function switchOn(rule: GroupRule): boolean {
  if (!rule.switch) return true;
  if (rule.onWhenUnset && (process.env[rule.switch] ?? '').trim() === '') return true;
  return isEnabled(rule.switch);
}

function requireSwitch(rule: GroupRule, capability: string): void {
  if (!rule.onWhenUnset) {
    if (rule.switch) requireEnabled(rule.switch, capability);
    return;
  }
  if (!switchOn(rule)) {
    throw new Error(`${capability} is disabled. Set ${rule.switch}=true, or remove the variable, to enable.`);
  }
}

export const MAIL_READ = 'OUTLOOK_ENABLE_MAIL_READ';
export const CALENDAR_READ = 'OUTLOOK_ENABLE_CALENDAR_READ';

const RULES: Record<MailGroup, GroupRule> = {
  read: { needs: ['Mail.Read', 'Mail.ReadWrite'], switch: MAIL_READ, onWhenUnset: true },
  write: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_WRITE' },
  drafts: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_DRAFTS' },
  categories: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_CATEGORIES' },
  send: { needs: ['Mail.Send'], switch: 'OUTLOOK_ENABLE_SEND' },
  delete: { needs: ['Mail.ReadWrite'], switch: 'OUTLOOK_ENABLE_DELETE' },
};

export type CalendarGroup =
  | 'calendar-read' | 'calendar-shared' | 'calendar-write' | 'calendar-invite' | 'calendar-delegate' | 'calendar-recording';

/**
 * Calendar groups. Read is on while its switch is unset, like mail read.
 * Recording has no switch: it is a per-meeting option on a write that its own
 * switch already gates.
 */
const CALENDAR_RULES: Record<CalendarGroup, GroupRule & { capability: string }> = {
  'calendar-read': {
    needs: ['Calendars.Read', 'Calendars.ReadWrite'],
    switch: CALENDAR_READ,
    onWhenUnset: true,
    capability: 'Calendar read (your own calendar, free/busy and meeting-time suggestions)',
  },
  'calendar-shared': {
    needs: ['Calendars.Read.Shared', 'Calendars.ReadWrite.Shared'],
    switch: 'OUTLOOK_ENABLE_CALENDAR_SHARED',
    capability: "Reading colleagues' shared calendars",
  },
  'calendar-write': {
    needs: ['Calendars.ReadWrite'],
    switch: 'OUTLOOK_ENABLE_CALENDAR_WRITE',
    capability: 'Calendar write (appointments on your own calendar that notify nobody)',
  },
  'calendar-invite': {
    needs: ['Calendars.ReadWrite'],
    switch: 'OUTLOOK_ENABLE_CALENDAR_INVITE',
    capability: 'Calendar invitations (anything that notifies another person)',
  },
  'calendar-delegate': {
    needs: ['Calendars.ReadWrite.Shared'],
    switch: 'OUTLOOK_ENABLE_CALENDAR_DELEGATE',
    capability: 'Changing a calendar you are a delegate on',
  },
  'calendar-recording': { needs: ['OnlineMeetings.ReadWrite'], capability: 'Automatic recording' },
};

export const CALENDAR_SWITCHES = [
  CALENDAR_READ, 'OUTLOOK_ENABLE_CALENDAR_SHARED', 'OUTLOOK_ENABLE_CALENDAR_WRITE', 'OUTLOOK_ENABLE_CALENDAR_INVITE', 'OUTLOOK_ENABLE_CALENDAR_DELEGATE',
];

/** Throw, naming the variable, when a calendar group's switch is off. Groups without a switch always pass. */
export function requireCalendarSwitch(group: CalendarGroup): void {
  const rule = CALENDAR_RULES[group];
  requireSwitch(rule, rule.capability);
}

/** Throw, naming the variable, when OUTLOOK_ENABLE_MAIL_READ turns mail reading off. */
export function requireMailRead(): void {
  requireSwitch(RULES.read, 'Mail read (folders, messages, search, conversations, attachments, categories)');
}

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
  /** The switch that turns the group on. */
  switch?: string;
  /** Whether the switch is on. The read switches are on while unset. */
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
    enabled: switchOn(rule),
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
    categories: describe(RULES.categories),
    send: describe(RULES.send),
    delete: describe(RULES.delete),
  };
}

export function describeCalendarAccess(grantedScopes: string[]): Record<CalendarGroup, GroupAccess> {
  const granted = new Set(grantedScopes.map((scope) => scope.toLowerCase()));
  const entries = (Object.keys(CALENDAR_RULES) as CalendarGroup[]).map((group) => {
    const rule = CALENDAR_RULES[group];
    const access: GroupAccess = {
      needs: rule.needs,
      granted: rule.needs.some((need) => granted.has(need.toLowerCase())),
      ...(rule.switch ? { switch: rule.switch } : {}),
      enabled: switchOn(rule),
    };
    return [group, access] as const;
  });
  return Object.fromEntries(entries) as Record<CalendarGroup, GroupAccess>;
}

/**
 * Explain a 403 from Graph as the missing delegated permission for a mail or
 * calendar tool group. Any other error is returned unchanged.
 */
export function permissionHint(error: unknown, group: MailGroup | CalendarGroup): Error {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  if (statusCode !== 403) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const rule = group in CALENDAR_RULES ? CALENDAR_RULES[group as CalendarGroup] : RULES[group as MailGroup];
  const needs = rule.needs.join(' or ');
  return new Error(
    `Microsoft Graph refused this request (403 Forbidden). The sign-in does not carry the delegated ${needs} ` +
      'permission this needs. An administrator grants it on the app registration, with admin consent; ' +
      'signing in again does not add it. Call mail-auth-status to see which permissions the sign-in carries.'
  );
}
