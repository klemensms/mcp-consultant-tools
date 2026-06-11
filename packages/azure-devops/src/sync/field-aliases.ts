/**
 * Frontmatter key → ADO reference name resolver.
 *
 * Frontmatter in synced markdown files uses raw ADO refnames as keys
 * (e.g. `System.Title`, `Custom.ConsultancyProcess`). A small alias table
 * provides friendly shortcuts for the most common fields so human-written
 * files stay readable.
 *
 * Resolution rules:
 *  1. Reserved keys (sync metadata) are returned as-is with a null refname.
 *  2. Alias → refname lookup (case-sensitive).
 *  3. Unknown keys are passed through unchanged (treated as refnames).
 */

/** Keys that are sync metadata, never sent to ADO as field updates. */
export const RESERVED_FRONTMATTER_KEYS = new Set<string>([
  'id',
  'type',
  'project',
  'parent',
  'parentTitle',
  'url',
  'lastSyncedRevision',
  'lastSyncedAt',
]);

/**
 * Friendly aliases → ADO reference names. Add entries here when a field is
 * common enough across clients to deserve a short key.
 */
export const FIELD_ALIASES: Record<string, string> = {
  title: 'System.Title',
  state: 'System.State',
  assignedTo: 'System.AssignedTo',
  areaPath: 'System.AreaPath',
  iterationPath: 'System.IterationPath',
  tags: 'System.Tags',
  priority: 'Microsoft.VSTS.Common.Priority',
  severity: 'Microsoft.VSTS.Common.Severity',
  storyPoints: 'Microsoft.VSTS.Scheduling.StoryPoints',
  remainingWork: 'Microsoft.VSTS.Scheduling.RemainingWork',
  effort: 'Microsoft.VSTS.Scheduling.Effort',
  originalEstimate: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
  completedWork: 'Microsoft.VSTS.Scheduling.CompletedWork',
  moscow: 'Custom.MoSCoW',
};

/** Reverse lookup: refname → canonical alias (first alias that resolves back). */
const REFNAME_TO_ALIAS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [alias, refname] of Object.entries(FIELD_ALIASES)) {
    if (!(refname in map)) map[refname] = alias;
  }
  return map;
})();

/**
 * Resolve a frontmatter key to its ADO refname, or null if the key is reserved
 * sync metadata.
 */
export function resolveRefname(key: string): string | null {
  if (RESERVED_FRONTMATTER_KEYS.has(key)) return null;
  return FIELD_ALIASES[key] ?? key;
}

/**
 * When writing frontmatter from ADO data, pick the friendliest key for a given
 * refname (alias if one exists, else the refname itself).
 */
export function preferredKey(refname: string): string {
  return REFNAME_TO_ALIAS[refname] ?? refname;
}

/**
 * True when a frontmatter key is reserved sync metadata (not an ADO field).
 */
export function isReservedKey(key: string): boolean {
  return RESERVED_FRONTMATTER_KEYS.has(key);
}
