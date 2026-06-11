/**
 * Parse annotated body sections from a synced markdown file.
 *
 * A `##` line is a section boundary ONLY when the first non-empty line that
 * follows it is `<!-- ado-field: REFNAME -->`. Any other `##` line is treated
 * as part of the surrounding annotated section's content — this prevents
 * silent truncation of fields (e.g. Repro Steps) when the field body legitimately
 * contains `##` text.
 *
 * Anything before the first annotated section is the prose preamble.
 */

export interface AnnotatedSection {
  /** ADO reference name this section maps to. */
  refname: string;
  /** Body content (everything between the annotation and the next `##` heading). */
  content: string;
  /** Heading text as it appears in the file (for error reporting). */
  heading: string;
  /** Index of the heading line in the source (0-based). */
  lineIndex: number;
}

export interface LocalOnlySection {
  /** Heading text as it appears in the file. */
  heading: string;
  /** Body content. */
  content: string;
  /** Index of the heading line in the source (0-based). */
  lineIndex: number;
}

export interface ParseAnnotationsResult {
  /** Sections that sync to ADO fields. */
  annotated: AnnotatedSection[];
  /** Sections preserved in the file but not synced. */
  localOnly: LocalOnlySection[];
  /** Any content before the first `##` heading (prose preamble). Trimmed. */
  preamble: string;
}

const SECTION_HEADING_RE = /^##\s+(.+?)\s*$/;
const ANNOTATION_RE = /^<!--\s*ado-field:\s*([A-Za-z0-9_.\-]+)\s*-->$/;

/**
 * Parse the body of a markdown file (everything after frontmatter) into
 * annotated and local-only sections.
 */
export function parseAnnotations(body: string): ParseAnnotationsResult {
  const lines = body.split('\n');
  const annotated: AnnotatedSection[] = [];

  // Section boundaries: only `##` headings whose next non-empty line is an
  // `<!-- ado-field: REFNAME -->` annotation. All other `##` lines are
  // treated as content of whatever annotated section currently encloses them.
  const sections: Array<{
    headingLine: number;
    annotationLine: number;
    heading: string;
    refname: string;
  }> = [];
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(SECTION_HEADING_RE);
    if (!headingMatch) continue;

    let probe = i + 1;
    while (probe < lines.length && lines[probe].trim() === '') probe++;
    if (probe >= lines.length) continue;

    const annotationMatch = lines[probe].trim().match(ANNOTATION_RE);
    if (!annotationMatch) continue;

    sections.push({
      headingLine: i,
      annotationLine: probe,
      heading: headingMatch[1].trim(),
      refname: annotationMatch[1],
    });
  }

  // Preamble = everything before the first annotated `##` heading.
  const preambleEnd = sections.length > 0 ? sections[0].headingLine : lines.length;
  const preamble = lines.slice(0, preambleEnd).join('\n').trim();

  for (let idx = 0; idx < sections.length; idx++) {
    const current = sections[idx];
    const next = sections[idx + 1];
    const bodyStart = current.annotationLine + 1;
    const bodyEnd = next ? next.headingLine : lines.length;
    const content = lines.slice(bodyStart, bodyEnd).join('\n');
    annotated.push({
      refname: current.refname,
      content: stripTrailingSeparators(content).trim(),
      heading: current.heading,
      lineIndex: current.headingLine,
    });
  }

  // Local-only sections no longer exist under the annotation-strict model.
  // The field is kept on the result for backward compatibility with callers
  // that destructure it.
  return { annotated, localOnly: [], preamble };
}

/**
 * Build an annotated `##` section as a string.
 */
export function serializeAnnotatedSection(
  heading: string,
  refname: string,
  content: string
): string {
  const body = content.trim() || '';
  return `## ${heading}\n<!-- ado-field: ${refname} -->\n\n${body}\n`;
}

/**
 * Check whether a body has any `<!-- ado-field: ... -->` annotations.
 * Used to decide between annotated parsing and legacy fallback.
 */
export function hasAnnotations(body: string): boolean {
  return /<!--\s*ado-field:\s*[A-Za-z0-9_.\-]+\s*-->/.test(body);
}

function stripTrailingSeparators(content: string): string {
  // Strip trailing `---` horizontal rules used as visual separators between sections.
  return content.replace(/(\n\s*---\s*)+\s*$/, '');
}
