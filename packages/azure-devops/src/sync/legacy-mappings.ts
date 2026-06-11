/**
 * Backwards-compatibility mapping for pre-annotation synced files.
 *
 * Files generated before the annotation-driven sync format have `#`-level
 * section headings with no `<!-- ado-field: ... -->` comment. We can still
 * parse them by matching known headings against a fixed refname table.
 *
 * Type-aware: Bug work items historically used `# Description` for what is
 * semantically Repro Steps. After upgrade, a Bug's `# Description` section
 * maps to `Microsoft.VSTS.TCM.ReproSteps`, not `System.Description`.
 */

export interface LegacyHeadingRule {
  heading: string;
  refname: string;
  /** Optional type filter — if set, only applies when workItemType matches. */
  typeFilter?: string;
}

/**
 * Ordered list of legacy heading → refname rules.
 * First matching rule wins.
 *
 * Evaluated in order — bug-specific rules come before generic rules for
 * the same heading.
 */
export const LEGACY_HEADING_RULES: LegacyHeadingRule[] = [
  // Bug-specific: legacy bug files wrote repro steps under `# Description`.
  { heading: 'Description', refname: 'Microsoft.VSTS.TCM.ReproSteps', typeFilter: 'Bug' },
  // Generic
  { heading: 'Description', refname: 'System.Description' },
  { heading: 'Repro Steps', refname: 'Microsoft.VSTS.TCM.ReproSteps' },
  { heading: 'Acceptance Criteria', refname: 'Microsoft.VSTS.Common.AcceptanceCriteria' },
  // Deprecated custom fields — historically configurable via env vars
  { heading: 'How to Test', refname: 'Custom.Howtotest' },
  { heading: 'Deployment Information', refname: 'Custom.Deploymentinformation' },
  {
    heading: 'Predeployment Steps',
    refname: 'Custom.7519d1bc-5305-4905-822b-2b380e61b154',
  },
  {
    heading: 'Postdeployment Steps',
    refname: 'Custom.abd6763f-a242-4938-85ed-bda419e34e7e',
  },
];

/**
 * Resolve a legacy heading to an ADO refname given the work item type.
 * Returns null if the heading has no known mapping (section stays local-only).
 */
export function resolveLegacyHeading(heading: string, workItemType: string): string | null {
  const normalized = heading.trim();
  for (const rule of LEGACY_HEADING_RULES) {
    if (rule.heading !== normalized) continue;
    if (rule.typeFilter && rule.typeFilter !== workItemType) continue;
    return rule.refname;
  }
  return null;
}

/**
 * Override the default custom-field refnames from env vars. Preserved so that
 * existing installs relying on `AZUREDEVOPS_SYNC_FIELD_*` env vars still parse
 * their legacy files correctly. New installs should use templates instead.
 */
export function applyLegacyEnvOverrides(): void {
  const overrides: Array<[string, string | undefined]> = [
    ['How to Test', process.env.AZUREDEVOPS_SYNC_FIELD_HOW_TO_TEST],
    ['Deployment Information', process.env.AZUREDEVOPS_SYNC_FIELD_DEPLOYMENT_INFO],
    ['Predeployment Steps', process.env.AZUREDEVOPS_SYNC_FIELD_PREDEPLOY],
    ['Postdeployment Steps', process.env.AZUREDEVOPS_SYNC_FIELD_POSTDEPLOY],
  ];
  for (const [heading, envValue] of overrides) {
    if (!envValue) continue;
    const rule = LEGACY_HEADING_RULES.find((r) => r.heading === heading && !r.typeFilter);
    if (rule) rule.refname = envValue;
  }
}

// Apply env overrides once at module load.
applyLegacyEnvOverrides();
