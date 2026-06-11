/**
 * Load per-type work-item templates for the annotation-driven sync.
 *
 * Templates are plain markdown files with frontmatter + annotated sections.
 * They describe the default shape of a synced file for each work-item type:
 *   - which frontmatter keys are prefilled (and in what order)
 *   - which body sections appear (and which ADO refnames they map to)
 *
 * Load order for a given work-item type (case-insensitive, spaces→hyphens):
 *   1. `MCP_ADO_SYNC_TEMPLATE_DIR/{type-slug}.md` — user override, if set
 *   2. Built-in template shipped with the package
 *   3. Generic fallback (title + Description section only)
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnnotations } from './annotation-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Directory containing built-in templates, relative to this file. */
const BUILTIN_TEMPLATE_DIR = join(__dirname, 'templates');

export interface TemplateBodyField {
  /** ADO refname this section maps to. */
  refname: string;
  /** Heading text shown in the file. */
  heading: string;
}

export interface WorkItemTemplate {
  /** Work-item type the template applies to (from frontmatter `type`). */
  type: string;
  /** Frontmatter defaults (ordered), keyed by the key used in the template. */
  frontmatterOrder: string[];
  /** Frontmatter default values by key. */
  frontmatterDefaults: Record<string, any>;
  /** Body section definitions, in template order. */
  bodyFields: TemplateBodyField[];
  /** Raw template content for diagnostics. */
  raw: string;
}

/**
 * Slugify a work-item type for filename lookup.
 * "User Story" → "user-story", "Bug" → "bug".
 */
export function slugifyType(type: string): string {
  return type.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Load a template by work-item type. Returns the generic fallback if no
 * built-in or override template exists.
 */
export function loadTemplate(workItemType: string): WorkItemTemplate {
  const slug = slugifyType(workItemType);
  const overrideDir = process.env.MCP_ADO_SYNC_TEMPLATE_DIR;

  const candidates: string[] = [];
  if (overrideDir) candidates.push(join(overrideDir, `${slug}.md`));
  candidates.push(join(BUILTIN_TEMPLATE_DIR, `${slug}.md`));

  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, 'utf8');
        return parseTemplate(raw, workItemType);
      } catch (err: any) {
        console.error(`Failed to load template ${path}: ${err.message}`);
      }
    }
  }

  return genericFallback(workItemType);
}

/**
 * Parse a template file into a WorkItemTemplate.
 */
export function parseTemplate(raw: string, typeHint: string): WorkItemTemplate {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const frontmatterRaw = frontmatterMatch ? frontmatterMatch[1] : '';
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;

  const frontmatterOrder: string[] = [];
  const frontmatterDefaults: Record<string, any> = {};

  for (const line of frontmatterRaw.split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_.\-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    frontmatterOrder.push(key);
    frontmatterDefaults[key] = parseYamlScalar(value.trim());
  }

  const { annotated } = parseAnnotations(body);
  const bodyFields: TemplateBodyField[] = annotated.map((section) => ({
    refname: section.refname,
    heading: section.heading,
  }));

  const type = typeof frontmatterDefaults.type === 'string' ? frontmatterDefaults.type : typeHint;

  return { type, frontmatterOrder, frontmatterDefaults, bodyFields, raw };
}

/** Apply placeholder substitution ({{project}}, {{parent}}) to default values. */
export function applyTemplatePlaceholders(
  template: WorkItemTemplate,
  ctx: { project: string; parent?: number }
): WorkItemTemplate {
  const substitute = (value: any): any => {
    if (typeof value !== 'string') return value;
    return value
      .replace(/\{\{project\}\}/g, ctx.project)
      .replace(/\{\{parent\}\}/g, ctx.parent !== undefined ? String(ctx.parent) : '');
  };

  const defaults: Record<string, any> = {};
  for (const key of template.frontmatterOrder) {
    defaults[key] = substitute(template.frontmatterDefaults[key]);
  }

  return {
    ...template,
    frontmatterDefaults: defaults,
  };
}

/**
 * List all body-field refnames known for a work-item type. Used when
 * deciding which ADO fields to HTML-detect on pull.
 */
export function templateBodyRefnames(workItemType: string): string[] {
  const tpl = loadTemplate(workItemType);
  return tpl.bodyFields.map((f) => f.refname);
}

function genericFallback(workItemType: string): WorkItemTemplate {
  return {
    type: workItemType,
    frontmatterOrder: ['type', 'state', 'title', 'areaPath', 'iterationPath'],
    frontmatterDefaults: {
      type: workItemType,
      state: 'New',
      title: '',
      areaPath: '{{project}}',
      iterationPath: '{{project}}',
    },
    bodyFields: [
      { refname: 'System.Description', heading: 'Description' },
      { refname: 'Microsoft.VSTS.Common.AcceptanceCriteria', heading: 'Acceptance Criteria' },
    ],
    raw: '',
  };
}

function parseYamlScalar(value: string): any {
  if (value === '' || value === '~' || value === 'null') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}
