import { createHmac } from 'node:crypto';
import type { LayerReport, PiiConfig } from './types.js';

const FORMATTED_VALUE_SUFFIX = '@OData.Community.Display.V1.FormattedValue';

/**
 * Default-on keyword list used to flag lookup `*FormattedValue` annotations
 * as PII-bearing when the base lookup field name contains any of these
 * substrings (case-insensitive). This is the Gap 3 hybrid heuristic
 * (Option C): regardless of `redactInResponse` config, a FormattedValue
 * sibling of a lookup whose base name suggests PII (e.g.
 * `_new_primaryaddressid_value`) gets routed through the L2 redaction
 * pipeline. Operators can still opt additional lookup names in via
 * `fieldRules.<entity>.redactInResponse` (Option A).
 */
export const LOOKUP_FORMATTED_VALUE_PII_KEYWORDS: ReadonlyArray<string> = [
  'address',
  'email',
  'phone',
  'customer',
  'contact',
  'person',
  'name',
  'mobile',
];

/**
 * Default-on keyword list used to flag PLAIN FIELD NAMES as PII-bearing
 * when the field name contains any of these substrings (case-insensitive).
 * Distinct from the FormattedValue-annotation list above — these match on
 * the field key itself, e.g. `salutation`, `new_salutation`, `new_member_salutation`
 * all redact via the keyword `salutation`.
 *
 * Vendor-prefix-neutral by design: defaults must work across clients
 * regardless of publisher prefix (`new_*`, `acme_*`, `contoso_*`,
 * etc.). Per-client custom fields without a semantic keyword
 * stay opt-in via `fieldRules.<entity>.redactInResponse`.
 */
export const DEFAULT_FIELD_NAME_PII_KEYWORDS: ReadonlyArray<string> = [
  'salutation',
];

export function tokenize(value: string, type: string, salt: Buffer): string {
  const hex = createHmac('sha256', salt).update(value).digest('hex').slice(0, 6);
  return `[REDACTED:${type}:${hex}]`;
}

export function inferTokenType(fieldName: string): string {
  const f = fieldName.toLowerCase();
  if (f.includes('email')) return 'email';
  if (f.includes('phone') || f.includes('mobile') || f.includes('telephone'))
    return 'phone';
  if (f === 'birthdate' || f.includes('dob') || f.includes('dateofbirth'))
    return 'dob';
  if (
    f.includes('firstname') ||
    f.includes('lastname') ||
    f.includes('fullname') ||
    f.includes('middlename') ||
    f.includes('yomifirstname') ||
    f.includes('yomilastname') ||
    f.includes('yomifullname')
  )
    return 'name';
  return 'text';
}

function baseNameMatchesLookupKeyword(baseField: string): boolean {
  const lower = baseField.toLowerCase();
  for (const kw of LOOKUP_FORMATTED_VALUE_PII_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function plainFieldNameMatchesKeyword(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  for (const kw of DEFAULT_FIELD_NAME_PII_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

export interface Layer2Result<T> {
  transformedData: T;
  report: LayerReport;
}

interface MutableLayerState {
  redactionCounts: Record<string, number>;
  fieldsAffected: Set<string>;
}

function recordRedaction(state: MutableLayerState, type: string, fieldPath: string) {
  state.redactionCounts[type] = (state.redactionCounts[type] ?? 0) + 1;
  state.fieldsAffected.add(fieldPath);
}

function redactRecord(
  record: Record<string, unknown>,
  redactSet: Set<string>,
  salt: Buffer,
  state: MutableLayerState,
  pathPrefix: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const annotationIdx = key.indexOf('@');
    const baseField = annotationIdx >= 0 ? key.slice(0, annotationIdx) : key;
    const isFormattedValueAnnotation = key.endsWith(FORMATTED_VALUE_SUFFIX);
    const isPlainField = annotationIdx < 0;

    // Option A: base field is in the configured redactInResponse list →
    // redact the plain field AND its FormattedValue sibling.
    const matchesConfig =
      (isPlainField || isFormattedValueAnnotation) && redactSet.has(baseField);

    // Option C: any FormattedValue annotation whose base lookup name contains
    // a known-PII keyword (case-insensitive substring) is redacted through
    // the same L2 pipeline. Default-on protection for custom lookups whose
    // base name is not in the configured rules.
    const matchesKeyword =
      isFormattedValueAnnotation && baseNameMatchesLookupKeyword(baseField);

    // Default-on plain-field keyword match: any PLAIN field whose name contains
    // a DEFAULT_FIELD_NAME_PII_KEYWORDS substring is redacted regardless of
    // configured rules. Vendor-prefix-neutral (catches `salutation`,
    // `new_salutation`, `new_*_salutation`, etc.).
    const matchesPlainFieldKeyword =
      isPlainField && plainFieldNameMatchesKeyword(baseField);

    if (
      (matchesConfig || matchesKeyword || matchesPlainFieldKeyword) &&
      value !== null &&
      value !== undefined
    ) {
      const stringValue = String(value);
      const type = inferTokenType(baseField);
      out[key] = tokenize(stringValue, type, salt);
      recordRedaction(state, type, pathPrefix + key);
      continue;
    }

    out[key] = value;
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walk(
  data: unknown,
  redactSet: Set<string>,
  salt: Buffer,
  state: MutableLayerState,
  pathPrefix: string
): unknown {
  if (Array.isArray(data)) {
    return data.map((item, idx) =>
      walk(item, redactSet, salt, state, `${pathPrefix}[${idx}].`)
    );
  }
  if (isPlainObject(data)) {
    if (Array.isArray((data as Record<string, unknown>).value)) {
      const wrapper = data as Record<string, unknown>;
      return {
        ...wrapper,
        value: walk(wrapper.value, redactSet, salt, state, pathPrefix),
      };
    }
    return redactRecord(data, redactSet, salt, state, pathPrefix);
  }
  return data;
}

export function applyLayer2<T>(
  entityName: string,
  data: T,
  config: PiiConfig,
  salt: Buffer
): Layer2Result<T> {
  const state: MutableLayerState = {
    redactionCounts: {},
    fieldsAffected: new Set<string>(),
  };
  const fields = config.fieldRules[entityName]?.redactInResponse ?? [];
  const redactSet = new Set(fields);

  // Note: we no longer early-exit when redactSet is empty. The Gap 3
  // keyword-based default-on protection (LOOKUP_FORMATTED_VALUE_PII_KEYWORDS)
  // runs regardless of configured field rules, so the walker still has work
  // to do even for entities without an explicit redactInResponse list.
  const transformed = walk(data, redactSet, salt, state, '') as T;

  return {
    transformedData: transformed,
    report: {
      layerId: 'l2',
      redactionCounts: state.redactionCounts,
      fieldsAffected: [...state.fieldsAffected].sort(),
      observeMode: config.observeMode,
    },
  };
}
