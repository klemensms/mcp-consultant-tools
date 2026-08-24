/**
 * Markdown Serialization Utilities
 *
 * Convert between ADO work items and local markdown files.
 *
 * Files use YAML frontmatter (scalar fields - ADO refnames or friendly
 * aliases) + body sections (long text fields tagged with
 * `<!-- ado-field: REFNAME -->` comments). The sync engine is generic:
 * any field named in the file is pushed to ADO, any field not named is
 * left alone.
 *
 * Legacy files (pre-annotation) are detected and parsed via a
 * legacy-mappings fallback table. They auto-upgrade to the annotated
 * format on the next pull.
 */

import { isHtmlContent } from './html-detection.js';
import { htmlToMarkdown, normalizeMarkdownForCompare } from './html-converter.js';
import {
  parseAnnotations,
  hasAnnotations,
  serializeAnnotatedSection,
  type LocalOnlySection,
} from './annotation-parser.js';
import {
  isReservedKey,
  preferredKey,
  resolveRefname,
} from './field-aliases.js';
import { resolveLegacyHeading } from './legacy-mappings.js';
import {
  applyTemplatePlaceholders,
  loadTemplate,
  type WorkItemTemplate,
} from './template-loader.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Subset of frontmatter values used by downstream services (sync-service,
 * file-utils) via stable friendly names. Always populated on parse by
 * pulling the corresponding refname out of `fieldMap`.
 */
export interface WorkItemFrontmatter {
  id: number;
  title: string;
  type: string;
  state: string;
  url: string;
  assignedTo?: string;
  storyPoints?: number;
  parent?: number;
  moscow?: string;
  tags?: string[];
  areaPath?: string;
  iterationPath?: string;
  lastSyncedRevision: number;
  lastSyncedAt: string;
}

/**
 * Legacy slot for the four historically-supported custom fields. Retained
 * so that pre-annotation callers (and reports) keep working. New-style
 * consumers should read `bodyFieldMap` instead.
 */
export interface AdditionalFields {
  howToTest?: string;
  deploymentInformation?: string;
  predeploymentSteps?: string;
  postdeploymentSteps?: string;
}

export interface ParsedWorkItemFile {
  /** Friendly-name frontmatter view for back-compat. */
  frontmatter: WorkItemFrontmatter;
  /** All scalar ADO fields from frontmatter, keyed by refname. */
  fieldMap: Record<string, FieldValue>;
  /** All body text fields (from annotated sections OR legacy headings), keyed by refname. */
  bodyFieldMap: Record<string, string>;
  /** Sections with no ADO-field annotation - preserved in the file but not pushed. */
  localOnlySections: LocalOnlySection[];
  /** Work item type (mirrors frontmatter.type). */
  workItemType: string;

  // Legacy convenience fields - populated from bodyFieldMap for back-compat.
  description: string;
  reproSteps: string;
  acceptanceCriteria: string;
  additionalFields: AdditionalFields;

  rawContent: string;
}

export type FieldValue = string | number | boolean | string[];

export interface CommentsFrontmatter {
  id: number;
  title: string;
  commentCount: number;
  lastSyncedAt: string;
}

export interface ParsedComment {
  author: string;
  date: string;
  content: string;
}

export interface WorkItemToMarkdownResult {
  content: string;
  skippedFields: string[];
}

// ---------------------------------------------------------------------------
// YAML helpers (frontmatter)
// ---------------------------------------------------------------------------

function serializeFrontmatter(data: Record<string, any>, order?: string[]): string {
  const lines: string[] = ['---'];
  const orderedKeys = order ? [...order, ...Object.keys(data).filter((k) => !order.includes(k))] : Object.keys(data);

  for (const key of orderedKeys) {
    if (!(key in data)) continue;
    const value = data[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`- ${item}`);
    } else if (typeof value === 'string') {
      if (
        value.includes(':') ||
        value.includes('#') ||
        value.includes('\n') ||
        value.match(/^[\d.]+$/) ||
        value === 'true' ||
        value === 'false' ||
        value === 'null' ||
        value === ''
      ) {
        lines.push(`${key}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function parseFrontmatter(yamlContent: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlContent.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  // Key regex supports ADO refnames with dots (e.g. System.Title, Custom.AgenticData).
  const keyRe = /^([A-Za-z_][A-Za-z0-9_.\-]*)\s*:\s*(.*)?$/;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.match(/^\s*-\s+/)) {
      if (currentKey && currentArray !== null) {
        const value = line.replace(/^\s*-\s+/, '').trim();
        currentArray.push(parseYamlValue(value));
      }
      continue;
    }
    const match = line.match(keyRe);
    if (match) {
      if (currentKey && currentArray !== null) result[currentKey] = currentArray;
      currentKey = match[1];
      const rawValue = match[2]?.trim();
      if (!rawValue) {
        currentArray = [];
      } else {
        currentArray = null;
        result[currentKey] = parseYamlValue(rawValue);
      }
    }
  }
  if (currentKey && currentArray !== null) result[currentKey] = currentArray;
  return result;
}

function parseYamlValue(value: string): any {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (value.match(/^-?\d+$/)) return parseInt(value, 10);
  if (value.match(/^-?\d+\.\d+$/)) return parseFloat(value);
  return value;
}

// ---------------------------------------------------------------------------
// Field coercion (ADO value ↔ frontmatter value)
// ---------------------------------------------------------------------------

/**
 * Convert a raw ADO field value to a frontmatter-writable scalar or array.
 * Handles the one weird case: `System.AssignedTo` comes back as an object
 * `{displayName, uniqueName, ...}`; frontmatter shows the displayName.
 * `System.Tags` is a semicolon-separated string; frontmatter shows an array.
 */
function adoValueToFrontmatter(refname: string, raw: any): FieldValue | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (refname === 'System.AssignedTo') {
    if (typeof raw === 'object' && raw.displayName) return raw.displayName as string;
    if (typeof raw === 'string') return raw;
    return null;
  }
  if (refname === 'System.Tags') {
    if (typeof raw !== 'string') return null;
    return raw.split(';').map((t: string) => t.trim()).filter((t) => t);
  }
  if (typeof raw === 'object') return String(raw);
  return raw as FieldValue;
}

/**
 * Convert a frontmatter value back to the shape ADO expects in a PATCH.
 */
function frontmatterValueToAdo(refname: string, value: FieldValue): any {
  if (refname === 'System.Tags' && Array.isArray(value)) {
    return value.join('; ');
  }
  return value;
}

/**
 * Stable comparison between a frontmatter value and the current ADO value.
 */
function fieldEquals(refname: string, local: FieldValue | undefined, remote: any): boolean {
  const remoteNorm = adoValueToFrontmatter(refname, remote);
  if (local === undefined && (remoteNorm === null || remoteNorm === '')) return true;
  if (local === undefined || remoteNorm === null) return false;
  if (Array.isArray(local) && Array.isArray(remoteNorm)) {
    return local.length === remoteNorm.length && local.every((v, i) => v === remoteNorm[i]);
  }
  return String(local) === String(remoteNorm);
}

// ---------------------------------------------------------------------------
// DOWN: ADO work item → markdown file
// ---------------------------------------------------------------------------

/**
 * Serialize an ADO work item to an annotated markdown file.
 *
 * Follows the template for `fields['System.WorkItemType']`. Frontmatter
 * order and body-section order come from the template. Fields the ADO
 * response carries but the template doesn't mention are appended to the
 * frontmatter with a discovery comment (see D4 in the design plan).
 */
export function workItemToMarkdown(workItem: any, revision: number): WorkItemToMarkdownResult {
  const fields = workItem.fields || {};
  const workItemType = fields['System.WorkItemType'] || 'Unknown';
  const project = (fields['System.TeamProject'] as string) || '';
  const template = applyTemplatePlaceholders(loadTemplate(workItemType), { project });
  const skippedFields: string[] = [];

  // ----- Frontmatter -----
  const fmData: Record<string, any> = {};
  const fmOrder: string[] = [];

  // Reserved metadata (always at top)
  fmData.id = workItem.id;
  fmOrder.push('id');
  fmData.type = workItemType;
  fmOrder.push('type');
  if (fields['System.Parent']) {
    fmData.parent = fields['System.Parent'];
    fmOrder.push('parent');
  }
  fmData.url = workItem._links?.html?.href || `https://dev.azure.com/_workitems/edit/${workItem.id}`;
  fmOrder.push('url');

  const bodyRefnames = new Set(template.bodyFields.map((f) => f.refname));

  // Template-declared frontmatter fields (in template order)
  for (const templateKey of template.frontmatterOrder) {
    if (templateKey === 'type') continue; // already emitted above
    const refname = resolveRefname(templateKey);
    if (refname === null) continue; // reserved keys handled elsewhere
    if (bodyRefnames.has(refname)) continue; // body fields don't go in frontmatter
    const raw = fields[refname];
    const value = adoValueToFrontmatter(refname, raw);
    if (value === null || value === '') {
      // Keep the template default as an empty placeholder so the agent sees the slot.
      fmData[templateKey] = template.frontmatterDefaults[templateKey] ?? '';
    } else {
      fmData[templateKey] = value;
    }
    fmOrder.push(templateKey);
  }

  // ADO fields not in the template - surface as discovery entries.
  // Short scalars go to frontmatter; long-form text goes to extra body sections.
  const emittedRefnames = new Set<string>();
  for (const templateKey of template.frontmatterOrder) {
    const r = resolveRefname(templateKey);
    if (r) emittedRefnames.add(r);
  }
  const extraBodyFields: Array<{ refname: string; heading: string; content: string; isHtml: boolean }> = [];
  for (const [refname, raw] of Object.entries(fields)) {
    if (emittedRefnames.has(refname)) continue;
    if (bodyRefnames.has(refname)) continue;
    if (isIgnoredSystemField(refname)) continue;
    if (looksLikeBodyField(raw)) {
      extraBodyFields.push({
        refname,
        heading: refnameToHeading(refname),
        content: String(raw),
        isHtml: isHtmlContent(String(raw)),
      });
      continue;
    }
    const value = adoValueToFrontmatter(refname, raw);
    if (value === null || value === '') continue;
    fmData[refname] = value;
    fmOrder.push(refname);
  }

  // Sync metadata (always at bottom)
  fmData.lastSyncedRevision = revision;
  fmOrder.push('lastSyncedRevision');
  fmData.lastSyncedAt = new Date().toISOString();
  fmOrder.push('lastSyncedAt');

  // ----- Body -----
  let content = serializeFrontmatter(fmData, fmOrder);
  content += '\n';

  for (const bodyField of template.bodyFields) {
    const raw = fields[bodyField.refname] || '';
    if (!raw || !String(raw).trim()) {
      content += '\n' + serializeAnnotatedSection(bodyField.heading, bodyField.refname, '');
      continue;
    }
    if (isHtmlContent(raw)) {
      skippedFields.push(`${bodyField.heading} (HTML)`);
      content += '\n' + serializeAnnotatedSection(bodyField.heading, bodyField.refname, '');
      continue;
    }
    content += '\n' + serializeAnnotatedSection(bodyField.heading, bodyField.refname, String(raw).trim());
  }

  // Extra body fields discovered from the ADO response (not in the template).
  for (const extra of extraBodyFields) {
    if (extra.isHtml) {
      skippedFields.push(`${extra.heading} (HTML)`);
      content += '\n' + serializeAnnotatedSection(extra.heading, extra.refname, '');
      continue;
    }
    content += '\n' + serializeAnnotatedSection(extra.heading, extra.refname, extra.content.trim());
  }

  return { content, skippedFields };
}

/**
 * Turn an ADO refname into a human-friendly heading.
 * `Custom.AgenticData` → "Agentic Data".
 * `Microsoft.VSTS.TCM.SystemInfo` → "System Info".
 * `System.Description` → "Description".
 */
function refnameToHeading(refname: string): string {
  const last = refname.split('.').pop() || refname;
  // Split camelCase / PascalCase at word boundaries.
  return last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function isIgnoredSystemField(refname: string): boolean {
  // Board/kanban state per work item - team-specific & not user-editable.
  if (refname.startsWith('WEF_')) return true;
  // Computed hierarchy fields (derived from AreaPath/IterationPath).
  if (refname.startsWith('System.AreaLevel') || refname.startsWith('System.IterationLevel')) return true;
  if (refname === 'System.AreaId' || refname === 'System.IterationId' || refname === 'System.NodeName') return true;
  // Audit and revision metadata - ADO controls these.
  switch (refname) {
    case 'System.Id':
    case 'System.Rev':
    case 'System.WorkItemType':
    case 'System.TeamProject':
    case 'System.CreatedBy':
    case 'System.CreatedDate':
    case 'System.ChangedBy':
    case 'System.ChangedDate':
    case 'System.AuthorizedAs':
    case 'System.AuthorizedDate':
    case 'System.RevisedDate':
    case 'System.BoardColumn':
    case 'System.BoardColumnDone':
    case 'System.BoardLane':
    case 'System.CommentCount':
    case 'System.Watermark':
    case 'System.PersonId':
    case 'System.History':
    case 'System.Reason':
    case 'System.Parent': // surfaced as friendly `parent` in frontmatter
    case 'Microsoft.VSTS.Common.StateChangeDate':
    case 'Microsoft.VSTS.Common.ActivatedDate':
    case 'Microsoft.VSTS.Common.ActivatedBy':
    case 'Microsoft.VSTS.Common.ResolvedDate':
    case 'Microsoft.VSTS.Common.ResolvedBy':
    case 'Microsoft.VSTS.Common.ClosedDate':
    case 'Microsoft.VSTS.Common.ClosedBy':
      return true;
    default:
      return false;
  }
}

/**
 * Heuristic: an unknown ADO field should be surfaced as a body section (not
 * a frontmatter scalar) when its value is a long-form text field. A single
 * newline or any HTML pattern is strong evidence that the content belongs
 * in body.
 */
function looksLikeBodyField(value: any): boolean {
  if (typeof value !== 'string') return false;
  if (value.includes('\n')) return true;
  if (value.length > 200) return true;
  if (isHtmlContent(value)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// UP: markdown file → ADO (parse)
// ---------------------------------------------------------------------------

export function parseWorkItemMarkdown(content: string): ParsedWorkItemFile {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Invalid work item markdown file: missing YAML frontmatter');
  }
  const frontmatterRaw = frontmatterMatch[1];
  const frontmatterData = parseFrontmatter(frontmatterRaw);

  if (!frontmatterData.id || typeof frontmatterData.id !== 'number') {
    throw new Error('Invalid work item markdown file: missing or invalid "id" in frontmatter');
  }

  const body = content.slice(frontmatterMatch[0].length);
  const workItemType = (frontmatterData.type as string) || 'Unknown';

  // Build the scalar fieldMap from frontmatter (aliases resolved).
  const fieldMap: Record<string, FieldValue> = {};
  for (const [key, rawValue] of Object.entries(frontmatterData)) {
    if (isReservedKey(key)) continue;
    if (rawValue === undefined || rawValue === null) continue;
    const refname = resolveRefname(key);
    if (!refname) continue;
    fieldMap[refname] = rawValue as FieldValue;
  }

  // Parse body sections.
  let bodyFieldMap: Record<string, string> = {};
  let localOnlySections: LocalOnlySection[] = [];

  if (hasAnnotations(body)) {
    const parsed = parseAnnotations(body);
    for (const section of parsed.annotated) {
      if (!section.content.trim()) continue;
      if (bodyFieldMap[section.refname]) {
        bodyFieldMap[section.refname] += '\n\n' + section.content;
      } else {
        bodyFieldMap[section.refname] = section.content;
      }
    }
    localOnlySections = parsed.localOnly;
  } else {
    // Legacy parse: map `#` or `##` headings via the legacy table.
    bodyFieldMap = parseLegacyBody(body, workItemType, localOnlySections);
  }

  // Populate back-compat fields.
  const frontmatter = buildLegacyFrontmatterView(frontmatterData, fieldMap);
  const description = bodyFieldMap['System.Description'] || '';
  const reproSteps = bodyFieldMap['Microsoft.VSTS.TCM.ReproSteps'] || '';
  const acceptanceCriteria = bodyFieldMap['Microsoft.VSTS.Common.AcceptanceCriteria'] || '';
  const additionalFields: AdditionalFields = {
    howToTest: bodyFieldMap['Custom.Howtotest'],
    deploymentInformation: bodyFieldMap['Custom.Deploymentinformation'],
    predeploymentSteps: bodyFieldMap['Custom.7519d1bc-5305-4905-822b-2b380e61b154'],
    postdeploymentSteps: bodyFieldMap['Custom.abd6763f-a242-4938-85ed-bda419e34e7e'],
  };

  return {
    frontmatter,
    fieldMap,
    bodyFieldMap,
    localOnlySections,
    workItemType,
    description,
    reproSteps,
    acceptanceCriteria,
    additionalFields,
    rawContent: content,
  };
}

/**
 * Parse legacy `# Heading` sections using the legacy-mappings fallback.
 */
function parseLegacyBody(
  body: string,
  workItemType: string,
  localOut: LocalOnlySection[]
): Record<string, string> {
  const lines = body.split('\n');
  const headings: Array<{ index: number; text: string; level: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,2})\s+(.+?)\s*$/);
    if (m) headings.push({ index: i, text: m[2].trim(), level: m[1].length });
  }

  const out: Record<string, string> = {};
  for (let h = 0; h < headings.length; h++) {
    const current = headings[h];
    const next = headings[h + 1];
    const bodyLines = lines.slice(current.index + 1, next ? next.index : lines.length);
    const sectionContent = stripLegacySeparators(bodyLines.join('\n')).trim();
    if (!sectionContent) continue;
    if (isPlaceholder(sectionContent, current.text)) continue;

    const refname = resolveLegacyHeading(current.text, workItemType);
    if (refname) {
      if (out[refname]) {
        out[refname] += '\n\n' + sectionContent;
      } else {
        out[refname] = sectionContent;
      }
    } else {
      localOut.push({ heading: current.text, content: sectionContent, lineIndex: current.index });
    }
  }
  return out;
}

function stripLegacySeparators(content: string): string {
  return content.replace(/(\n\s*---\s*)+\s*$/, '').replace(/^\s*(---\s*\n)+/, '');
}

function isPlaceholder(content: string, heading: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed === `_No ${heading.toLowerCase()} provided._` ||
    trimmed === `[Your ${heading.toLowerCase()} here]`
  );
}

function buildLegacyFrontmatterView(
  raw: Record<string, any>,
  fieldMap: Record<string, FieldValue>
): WorkItemFrontmatter {
  const tagsRaw = fieldMap['System.Tags'];
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw
    : typeof tagsRaw === 'string' && tagsRaw
      ? tagsRaw.split(';').map((t) => t.trim()).filter(Boolean)
      : undefined;

  return {
    id: raw.id as number,
    title: (fieldMap['System.Title'] as string) || '',
    type: (raw.type as string) || 'Unknown',
    state: (fieldMap['System.State'] as string) || '',
    url: (raw.url as string) || '',
    assignedTo: fieldMap['System.AssignedTo'] as string | undefined,
    storyPoints: fieldMap['Microsoft.VSTS.Scheduling.StoryPoints'] as number | undefined,
    parent: raw.parent as number | undefined,
    moscow: fieldMap['Custom.MoSCoW'] as string | undefined,
    tags,
    areaPath: fieldMap['System.AreaPath'] as string | undefined,
    iterationPath: fieldMap['System.IterationPath'] as string | undefined,
    lastSyncedRevision: (raw.lastSyncedRevision as number) || 0,
    lastSyncedAt: (raw.lastSyncedAt as string) || '',
  };
}

// ---------------------------------------------------------------------------
// UP: build ADO patch operations
// ---------------------------------------------------------------------------

export function buildPatchOperations(
  parsed: ParsedWorkItemFile,
  currentWorkItem: any,
  skipAutoConvert: boolean = false
): { operations: any[]; skippedFields: string[]; convertedFields: string[] } {
  const operations: any[] = [];
  const skippedFields: string[] = [];
  const convertedFields: string[] = [];
  const currentFields = currentWorkItem.fields || {};

  const allRefnames = new Set<string>([
    ...Object.keys(parsed.fieldMap),
    ...Object.keys(parsed.bodyFieldMap),
  ]);

  for (const refname of allRefnames) {
    const isBodyField = refname in parsed.bodyFieldMap;
    const localValue: FieldValue | undefined = isBodyField
      ? parsed.bodyFieldMap[refname]
      : parsed.fieldMap[refname];
    const currentRaw = currentFields[refname];
    const currentString = typeof currentRaw === 'string' ? currentRaw : '';
    const isHtmlField = isBodyField && typeof currentRaw === 'string' && isHtmlContent(currentRaw);

    if (isHtmlField && skipAutoConvert) {
      skippedFields.push(`${refname} (HTML in ADO - skipAutoConvert=true)`);
      continue;
    }

    // Data-loss guard: don't overwrite non-empty ADO content with empty local content.
    const localIsEmpty =
      localValue === undefined ||
      localValue === '' ||
      (Array.isArray(localValue) && localValue.length === 0);

    if (isBodyField) {
      if (localIsEmpty && currentString.trim()) {
        skippedFields.push(
          `${refname} (local file has no content - skipping to prevent data loss)`
        );
        continue;
      }
      if (localIsEmpty && !currentString) continue;

      // Compare local Markdown against the ADO value to detect a real edit.
      // ADO stores body fields as HTML but the local file holds Markdown, so for
      // an HTML field we compare against the same Markdown the pull produces -
      // otherwise an *unedited* field never matches and gets re-pushed, flipping
      // it to Markdown format and overwriting a complex table with the lossy
      // pulled Markdown (data loss). Equal → user didn't touch it → skip.
      const currentComparable = isHtmlField ? htmlToMarkdown(currentString) : currentString;
      if (
        normalizeMarkdownForCompare(String(localValue)) ===
        normalizeMarkdownForCompare(currentComparable)
      ) {
        continue;
      }

      operations.push({
        op: currentString ? 'replace' : 'add',
        path: `/fields/${refname}`,
        value: String(localValue),
      });
      operations.push({
        op: 'add',
        path: `/multilineFieldsFormat/${refname}`,
        value: 'Markdown',
      });
      if (isHtmlField) convertedFields.push(refname);
    } else {
      if (localIsEmpty && (currentRaw === undefined || currentRaw === '' || currentRaw === null)) {
        continue;
      }
      if (fieldEquals(refname, localValue, currentRaw)) continue;
      if (localIsEmpty && currentRaw !== undefined && currentRaw !== '' && currentRaw !== null) {
        // For scalar fields, allow setting to empty only when user clearly intended it.
        // Convention: undefined (key missing) → skip; empty-string key → write empty.
        if (localValue === undefined) continue;
      }

      operations.push({
        op: currentRaw !== undefined && currentRaw !== null && currentRaw !== '' ? 'replace' : 'add',
        path: `/fields/${refname}`,
        value: frontmatterValueToAdo(refname, localValue as FieldValue),
      });
    }
  }

  return { operations, skippedFields, convertedFields };
}

// ---------------------------------------------------------------------------
// NEW WORK ITEMS (no id yet)
// ---------------------------------------------------------------------------

export interface NewWorkItemFrontmatter {
  title: string;
  type: string;
  state: string;
  parent?: number;
  assignedTo?: string;
  storyPoints?: number;
  moscow?: string;
  tags?: string[];
  areaPath?: string;
  iterationPath?: string;
}

export interface ParsedNewWorkItemFile {
  frontmatter: NewWorkItemFrontmatter;
  fieldMap: Record<string, FieldValue>;
  bodyFieldMap: Record<string, string>;
  localOnlySections: LocalOnlySection[];
  workItemType: string;
  description: string;
  reproSteps: string;
  acceptanceCriteria: string;
  additionalFields: AdditionalFields;
  rawContent: string;
}

export function isNewWorkItem(frontmatter: Record<string, any>): boolean {
  return !frontmatter.id || typeof frontmatter.id !== 'number';
}

export function parseNewWorkItemMarkdown(content: string): ParsedNewWorkItemFile {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Invalid work item markdown file: missing YAML frontmatter');
  }
  const frontmatterData = parseFrontmatter(frontmatterMatch[1]);
  if (!frontmatterData.title || typeof frontmatterData.title !== 'string') {
    throw new Error('New work item files require a "title" field');
  }
  if (
    frontmatterData.parent !== undefined &&
    frontmatterData.parent !== null &&
    typeof frontmatterData.parent !== 'number'
  ) {
    throw new Error('The "parent" field must be a number (work item ID)');
  }

  const body = content.slice(frontmatterMatch[0].length);
  const workItemType = (frontmatterData.type as string) || 'User Story';

  const fieldMap: Record<string, FieldValue> = {};
  for (const [key, rawValue] of Object.entries(frontmatterData)) {
    if (isReservedKey(key)) continue;
    if (rawValue === undefined || rawValue === null) continue;
    const refname = resolveRefname(key);
    if (!refname) continue;
    fieldMap[refname] = rawValue as FieldValue;
  }

  let bodyFieldMap: Record<string, string> = {};
  const localOnlySections: LocalOnlySection[] = [];
  if (hasAnnotations(body)) {
    const parsed = parseAnnotations(body);
    for (const section of parsed.annotated) {
      if (!section.content.trim()) continue;
      if (isPlaceholder(section.content, section.heading)) continue;
      bodyFieldMap[section.refname] = bodyFieldMap[section.refname]
        ? bodyFieldMap[section.refname] + '\n\n' + section.content
        : section.content;
    }
    localOnlySections.push(...parsed.localOnly);
  } else {
    bodyFieldMap = parseLegacyBody(body, workItemType, localOnlySections);
  }

  const tagsRaw = fieldMap['System.Tags'];
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw
    : typeof tagsRaw === 'string' && tagsRaw
      ? tagsRaw.split(';').map((t) => t.trim()).filter(Boolean)
      : undefined;

  const frontmatter: NewWorkItemFrontmatter = {
    title: frontmatterData.title,
    type: workItemType,
    state: (frontmatterData.state as string) || 'New',
    parent: frontmatterData.parent ?? undefined,
    assignedTo: fieldMap['System.AssignedTo'] as string | undefined,
    storyPoints: fieldMap['Microsoft.VSTS.Scheduling.StoryPoints'] as number | undefined,
    moscow: fieldMap['Custom.MoSCoW'] as string | undefined,
    tags,
    areaPath: fieldMap['System.AreaPath'] as string | undefined,
    iterationPath: fieldMap['System.IterationPath'] as string | undefined,
  };

  return {
    frontmatter,
    fieldMap,
    bodyFieldMap,
    localOnlySections,
    workItemType,
    description: bodyFieldMap['System.Description'] || '',
    reproSteps: bodyFieldMap['Microsoft.VSTS.TCM.ReproSteps'] || '',
    acceptanceCriteria: bodyFieldMap['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
    additionalFields: {
      howToTest: bodyFieldMap['Custom.Howtotest'],
      deploymentInformation: bodyFieldMap['Custom.Deploymentinformation'],
      predeploymentSteps: bodyFieldMap['Custom.7519d1bc-5305-4905-822b-2b380e61b154'],
      postdeploymentSteps: bodyFieldMap['Custom.abd6763f-a242-4938-85ed-bda419e34e7e'],
    },
    rawContent: content,
  };
}

/**
 * Split new-work-item fields into standard (safe for creation) and custom
 * (must be set via a follow-up update because ADO rejects custom fields
 * during creation).
 *
 * Standard = refname starts with `System.*` or `Microsoft.VSTS.*`.
 * Custom   = everything else (conventionally `Custom.*`).
 */
export interface NewWorkItemFieldSplit {
  standardFields: Record<string, any>;
  customFields: Record<string, any>;
}

export function buildNewWorkItemFields(
  parsed: ParsedNewWorkItemFile,
  parentWorkItem?: any
): NewWorkItemFieldSplit {
  const parentFields = parentWorkItem?.fields || {};
  const standardFields: Record<string, any> = {};
  const customFields: Record<string, any> = {};

  // Title is mandatory; force it from the top-level frontmatter shape.
  standardFields['System.Title'] = parsed.frontmatter.title;
  standardFields['System.State'] = parsed.frontmatter.state || 'New';

  // Fold in every scalar field from the fieldMap.
  for (const [refname, value] of Object.entries(parsed.fieldMap)) {
    if (value === undefined || value === null || value === '') continue;
    const target = isStandardRefname(refname) ? standardFields : customFields;
    target[refname] = frontmatterValueToAdo(refname, value);
  }

  // Fold in every body field (description, AC, repro steps, custom body fields).
  for (const [refname, value] of Object.entries(parsed.bodyFieldMap)) {
    if (!value || !value.trim()) continue;
    const target = isStandardRefname(refname) ? standardFields : customFields;
    target[refname] = value;
  }

  // Inherit area/iteration path from parent when not provided.
  if (!standardFields['System.AreaPath'] && parentFields['System.AreaPath']) {
    standardFields['System.AreaPath'] = parentFields['System.AreaPath'];
  }
  if (!standardFields['System.IterationPath'] && parentFields['System.IterationPath']) {
    standardFields['System.IterationPath'] = parentFields['System.IterationPath'];
  }

  return { standardFields, customFields };
}

function isStandardRefname(refname: string): boolean {
  return refname.startsWith('System.') || refname.startsWith('Microsoft.VSTS.');
}

// ---------------------------------------------------------------------------
// Template generation (new work item file scaffold)
// ---------------------------------------------------------------------------

export function generateNewWorkItemTemplate(
  parentId: number | undefined,
  parentTitle: string,
  project: string,
  workItemType: string = 'User Story'
): string {
  const template = applyTemplatePlaceholders(loadTemplate(workItemType), {
    project,
    parent: parentId,
  });

  const fmData: Record<string, any> = { ...template.frontmatterDefaults };
  const fmOrder = [...template.frontmatterOrder];

  // Default `title` to a descriptive placeholder when blank in the template.
  const titleKey = template.frontmatterOrder.includes('title')
    ? 'title'
    : Object.keys(fmData).find((k) => resolveRefname(k) === 'System.Title');
  if (titleKey && (!fmData[titleKey] || fmData[titleKey] === '')) {
    fmData[titleKey] = `New ${workItemType} Title`;
  }

  if (parentId !== undefined) {
    fmData.parent = parentId;
    if (!fmOrder.includes('parent')) fmOrder.splice(1, 0, 'parent'); // after `type`
  }

  let content = serializeFrontmatter(fmData, fmOrder);
  content += '\n';
  if (parentId !== undefined) {
    content += `\n> Parent: **#${parentId}** - ${parentTitle}\n`;
  }
  content += `> Project: ${project}\n`;

  for (const bodyField of template.bodyFields) {
    content += '\n' + serializeAnnotatedSection(bodyField.heading, bodyField.refname, '');
  }

  return content;
}

// ---------------------------------------------------------------------------
// Comments (unchanged - read-only export)
// ---------------------------------------------------------------------------

export function commentsToMarkdown(workItem: any, comments: any[]): string {
  const fields = workItem.fields || {};
  const frontmatter: Record<string, any> = {
    id: workItem.id,
    title: fields['System.Title'] || '',
    commentCount: comments.length,
    lastSyncedAt: new Date().toISOString(),
  };
  let content = serializeFrontmatter(frontmatter);
  content += '\n\n# Comments\n\n';
  content += '> **NOTE**: This file is read-only. Comments cannot be pushed back to ADO.\n\n';
  if (comments.length === 0) {
    content += '_No comments on this work item._\n';
  } else {
    const sorted = [...comments].sort((a, b) => {
      const da = new Date(a.createdDate || a.publishedDate || 0).getTime();
      const db = new Date(b.createdDate || b.publishedDate || 0).getTime();
      return da - db;
    });
    sorted.forEach((comment, index) => {
      content += '---\n\n';
      content += `## Comment #${index + 1}\n`;
      content += `**Author**: ${comment.createdBy?.displayName || 'Unknown'}\n`;
      content += `**Date**: ${comment.createdDate || comment.publishedDate || 'Unknown'}\n\n`;
      content += `${comment.text || comment.content || ''}\n\n`;
    });
  }
  return content;
}

// ---------------------------------------------------------------------------
// Sync revision bump + new-file → synced-file conversion
// ---------------------------------------------------------------------------

export function updateSyncRevision(content: string, newRevision: number): string {
  const updated = content.replace(
    /lastSyncedRevision:\s*\d+/,
    `lastSyncedRevision: ${newRevision}`
  );
  return updated.replace(
    /lastSyncedAt:\s*[^\n]+/,
    `lastSyncedAt: ${new Date().toISOString()}`
  );
}

export function convertNewFileToSynced(
  content: string,
  workItemId: number,
  revision: number,
  url: string
): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Invalid work item markdown file: missing YAML frontmatter');
  }
  const frontmatterData = parseFrontmatter(frontmatterMatch[1]);
  const contentAfterFrontmatter = content.slice(frontmatterMatch[0].length);

  // Rebuild frontmatter with id + sync metadata inserted at the top.
  const newData: Record<string, any> = { id: workItemId };
  const newOrder: string[] = ['id'];

  for (const [key, value] of Object.entries(frontmatterData)) {
    if (key === 'id') continue;
    newData[key] = value;
    newOrder.push(key);
  }
  newData.url = url;
  if (!newOrder.includes('url')) newOrder.push('url');
  newData.lastSyncedRevision = revision;
  newOrder.push('lastSyncedRevision');
  newData.lastSyncedAt = new Date().toISOString();
  newOrder.push('lastSyncedAt');

  // Strip the transient "Parent:"/"Project:" note lines used only for template readability.
  const cleaned = contentAfterFrontmatter
    .replace(/>\s*Parent:.*\n/i, '')
    .replace(/>\s*Project:.*\n/i, '');

  return serializeFrontmatter(newData, newOrder) + cleaned;
}

// ---------------------------------------------------------------------------
// Internal helpers exposed for tests / sync-service
// ---------------------------------------------------------------------------

/**
 * Return the list of large-text (body) refnames that should be HTML-checked
 * for a given work-item type. Driven by the loaded template.
 */
export function templateBodyRefnamesForType(workItemType: string): string[] {
  return loadTemplate(workItemType).bodyFields.map((f) => f.refname);
}
