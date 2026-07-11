/**
 * Shared option parsing for the code-review CLI commands. Commander passes every option through as
 * a string, so validate before the service sees it.
 */

export function parseIntOption(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer, got: '${value}'`);
  }
  return parsed;
}

export function parseExtensions(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(',').map((e) => (e.startsWith('.') ? e : `.${e}`));
}

/** Resolve the project/org from an explicit --project or the Azure DevOps project env fallback. */
export function requireProject(explicit: string | undefined): string {
  const project = explicit ?? process.env.CODE_REVIEW_AZDO_PROJECT;
  if (!project) {
    throw new Error('--project is required (or set CODE_REVIEW_AZDO_PROJECT).');
  }
  return project;
}

/** Rendered under any list whose counts were cut short by a paging cap. */
export function truncationNote(truncated: boolean): string {
  return truncated ? '  ⚠️ Truncated by a paging cap — more results exist' : '';
}
