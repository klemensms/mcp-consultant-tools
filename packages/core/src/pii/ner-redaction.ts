import nlp from 'compromise';
import { tokenize } from './field-redaction.js';
import type { LayerReport, PiiConfig } from './types.js';

const ODATA_ANNOTATION_RE = /@OData\./;

interface MutableState {
  redactionCounts: Record<string, number>;
  fieldsAffected: Set<string>;
}

function recordRedaction(state: MutableState, type: string, fieldPath: string) {
  state.redactionCounts[type] = (state.redactionCounts[type] ?? 0) + 1;
  state.fieldsAffected.add(fieldPath);
}

function trimTokenEdges(s: string): string {
  return s.replace(/^[\s\-–—,.;:]+|[\s\-–—,.;:]+$/g, '');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactPeopleInString(
  value: string,
  salt: Buffer,
  state: MutableState,
  fieldPath: string
): string {
  const doc = nlp(value);
  const people = doc.people().out('array') as string[];
  if (people.length === 0) return value;

  let result = value;
  const seen = new Set<string>();
  for (const raw of people) {
    const cleaned = trimTokenEdges(raw);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    const re = new RegExp(`\\b${escapeRegex(cleaned)}\\b`, 'g');
    let replaced = false;
    result = result.replace(re, () => {
      replaced = true;
      return tokenize(cleaned, 'name', salt);
    });
    if (replaced) recordRedaction(state, 'name', fieldPath);
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function shouldScanField(
  fieldName: string | undefined,
  config: PiiConfig
): boolean {
  if (!fieldName) return false;
  if (config.ner.scanFields.includes(fieldName)) return true;
  if (config.ner.scanOdataAnnotations && ODATA_ANNOTATION_RE.test(fieldName))
    return true;
  return false;
}

function walk(
  data: unknown,
  config: PiiConfig,
  salt: Buffer,
  state: MutableState,
  pathPrefix: string,
  fieldName: string | undefined
): unknown {
  if (typeof data === 'string') {
    if (!shouldScanField(fieldName, config)) return data;
    return redactPeopleInString(
      data,
      salt,
      state,
      pathPrefix.replace(/\.$/, '') || (fieldName ?? '<root>')
    );
  }
  if (Array.isArray(data)) {
    return data.map((item, idx) =>
      walk(item, config, salt, state, `${pathPrefix}[${idx}].`, fieldName)
    );
  }
  if (isPlainObject(data)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = walk(v, config, salt, state, `${pathPrefix}${k}.`, k);
    }
    return out;
  }
  return data;
}

export interface Layer4Result<T> {
  transformedData: T;
  report: LayerReport;
}

export function applyLayer4<T>(
  data: T,
  config: PiiConfig,
  salt: Buffer
): Layer4Result<T> {
  const state: MutableState = {
    redactionCounts: {},
    fieldsAffected: new Set<string>(),
  };

  const transformed = walk(data, config, salt, state, '', undefined) as T;

  return {
    transformedData: transformed,
    report: {
      layerId: 'l4',
      redactionCounts: state.redactionCounts,
      fieldsAffected: [...state.fieldsAffected].sort(),
      observeMode: config.observeMode,
    },
  };
}
