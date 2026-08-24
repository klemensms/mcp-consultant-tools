/**
 * HTML detection for ADO large-text fields.
 *
 * ADO supports both HTML and Markdown for long-text fields. Sync only
 * works against markdown, so before pulling (or pushing) we auto-detect
 * HTML and either convert it or report it as skipped.
 *
 * This module is intentionally generic - it no longer maintains a fixed
 * list of "additional" custom fields. Callers pass in the refname list
 * they care about (usually derived from the loaded template).
 */

/**
 * Standard ADO large-text fields with native markdown support.
 */
export const STANDARD_LARGE_TEXT_FIELDS = [
  'System.Description',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.TCM.ReproSteps',
] as const;

/**
 * Return the list of large-text fields to check for a work item. Combines
 * the standard set with any caller-supplied custom refnames (from the
 * loaded template).
 */
export function getAllLargeTextFields(customRefnames: string[] = []): string[] {
  const set = new Set<string>([...STANDARD_LARGE_TEXT_FIELDS, ...customRefnames]);
  return [...set];
}

// ---------------------------------------------------------------------------
// HTML detection (pattern-based heuristic)
// ---------------------------------------------------------------------------

const HTML_STRUCTURAL_PATTERNS = [
  /<div[^>]*>/i,
  /<p[^>]*>/i,
  /<h[1-6][^>]*>/i,
  /<strong[^>]*>/i,
  /<em[^>]*>/i,
  /<ul[^>]*>/i,
  /<ol[^>]*>/i,
  /<li[^>]*>/i,
  /<table[^>]*>/i,
  /<tr[^>]*>/i,
  /<td[^>]*>/i,
  /<span[^>]*>/i,
];

const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+/m,
  /\*\*[^*]+\*\*/,
  /^\s*[-*+]\s+/m,
  /^\s*\d+\.\s+/m,
  /\[.+?\]\(.+?\)/,
  /```[\s\S]*?```/,
  /`[^`]+`/,
  /^\s*>\s+/m,
];

export function isHtmlContent(content: string | null | undefined): boolean {
  if (!content?.trim()) return false;
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(content)) return false;
  }
  for (const pattern of HTML_STRUCTURAL_PATTERNS) {
    if (pattern.test(content)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Field format check (driven by the caller-supplied refname list)
// ---------------------------------------------------------------------------

export type FieldFormat = 'markdown' | 'html' | 'not_present';

export interface FieldFormatResult {
  description: 'markdown' | 'html';
  acceptanceCriteria: 'markdown' | 'html';
  reproSteps: 'markdown' | 'html' | 'not_present';
  ready: boolean;
  warnings: string[];
  /** Format for each custom body field, keyed by refname. */
  additionalFields: Record<string, FieldFormat>;
  details: {
    descriptionLength: number;
    acceptanceCriteriaLength: number;
    reproStepsLength: number;
  };
}

export function checkFieldFormats(
  workItem: {
    fields?: {
      'System.Description'?: string;
      'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
      [key: string]: any;
    };
  },
  additionalRefnames: string[] = []
): FieldFormatResult {
  const fields = workItem.fields || {};
  const description = fields['System.Description'] || '';
  const acceptanceCriteria = fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '';
  const reproSteps = fields['Microsoft.VSTS.TCM.ReproSteps'] || '';

  const descriptionIsHtml = isHtmlContent(description);
  const acceptanceCriteriaIsHtml = isHtmlContent(acceptanceCriteria);
  const reproStepsIsHtml = isHtmlContent(reproSteps);

  const warnings: string[] = [];
  const additionalFields: Record<string, FieldFormat> = {};

  for (const refname of additionalRefnames) {
    if (
      refname === 'System.Description' ||
      refname === 'Microsoft.VSTS.Common.AcceptanceCriteria' ||
      refname === 'Microsoft.VSTS.TCM.ReproSteps'
    ) {
      // Covered by the dedicated slots above.
      continue;
    }
    const content = fields[refname];
    if (!content || (typeof content === 'string' && !content.trim())) {
      additionalFields[refname] = 'not_present';
      continue;
    }
    if (typeof content === 'string' && isHtmlContent(content)) {
      warnings.push(`${refname} is HTML - will be skipped`);
      additionalFields[refname] = 'html';
    } else {
      additionalFields[refname] = 'markdown';
    }
  }

  let reproStepsFormat: FieldFormat = 'not_present';
  if (reproSteps && reproSteps.trim()) {
    reproStepsFormat = reproStepsIsHtml ? 'html' : 'markdown';
  }

  return {
    description: descriptionIsHtml ? 'html' : 'markdown',
    acceptanceCriteria: acceptanceCriteriaIsHtml ? 'html' : 'markdown',
    reproSteps: reproStepsFormat,
    ready: !descriptionIsHtml && !acceptanceCriteriaIsHtml && reproStepsFormat !== 'html',
    warnings,
    additionalFields,
    details: {
      descriptionLength: description.length,
      acceptanceCriteriaLength: acceptanceCriteria.length,
      reproStepsLength: reproSteps.length,
    },
  };
}

export function getConversionInstructions(): string {
  return `To convert HTML fields to markdown in Azure DevOps:
1. Open the work item in Azure DevOps
2. Click in the Description or Acceptance Criteria field
3. Look for the "Convert to Markdown" button in the toolbar
4. Click it and confirm the conversion
5. Save the work item
6. Re-run the sync command

Note: Some organizations may have HTML format enforced. Contact your ADO admin if the option is not available.`;
}
