import { tokenize } from './field-redaction.js';
import type { LayerReport, PiiConfig, RegexPattern } from './types.js';

const TOKEN_RE = /\[REDACTED:[a-z]+:[0-9a-f]{6}\]/g;

const BUILT_IN_PATTERNS: Record<'email' | 'phone' | 'dob', { pattern: RegExp; tokenType: string }> = {
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g,
    tokenType: 'email',
  },
  phone: {
    pattern: /\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){1,4}[\s.-]?\d{2,9}/g,
    tokenType: 'phone',
  },
  dob: {
    pattern: /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
    tokenType: 'dob',
  },
};

interface CompiledPattern {
  pattern: RegExp;
  tokenType: string;
  name: string;
}

function compileCustomPattern(p: RegexPattern): CompiledPattern | null {
  try {
    const re = new RegExp(p.pattern, 'g');
    return { pattern: re, tokenType: p.tokenType, name: p.name };
  } catch {
    return null;
  }
}

interface MutableState {
  redactionCounts: Record<string, number>;
  fieldsAffected: Set<string>;
}

function recordRedaction(state: MutableState, type: string, fieldPath: string) {
  state.redactionCounts[type] = (state.redactionCounts[type] ?? 0) + 1;
  state.fieldsAffected.add(fieldPath);
}

function redactString(
  value: string,
  patterns: CompiledPattern[],
  salt: Buffer,
  state: MutableState,
  fieldPath: string
): string {
  // Skip if the string is entirely a token already (don't re-tokenize)
  // but still scan strings that contain a mix of tokens + raw text.
  let result = value;
  for (const { pattern, tokenType } of patterns) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      // Don't tokenize substrings that are already tokens
      if (TOKEN_RE.test(match)) {
        TOKEN_RE.lastIndex = 0;
        return match;
      }
      recordRedaction(state, tokenType, fieldPath);
      return tokenize(match, tokenType, salt);
    });
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walk(
  data: unknown,
  patterns: CompiledPattern[],
  salt: Buffer,
  state: MutableState,
  pathPrefix: string
): unknown {
  if (typeof data === 'string') {
    return redactString(data, patterns, salt, state, pathPrefix.replace(/\.$/, '') || '<root>');
  }
  if (Array.isArray(data)) {
    return data.map((item, idx) => walk(item, patterns, salt, state, `${pathPrefix}[${idx}].`));
  }
  if (isPlainObject(data)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = walk(v, patterns, salt, state, `${pathPrefix}${k}.`);
    }
    return out;
  }
  return data;
}

export interface Layer3Result<T> {
  transformedData: T;
  report: LayerReport;
}

export function applyLayer3<T>(
  data: T,
  config: PiiConfig,
  salt: Buffer
): Layer3Result<T> {
  const patterns: CompiledPattern[] = [];
  if (config.regex.email) patterns.push({ ...BUILT_IN_PATTERNS.email, name: 'email' });
  if (config.regex.phone) patterns.push({ ...BUILT_IN_PATTERNS.phone, name: 'phone' });
  if (config.regex.dateOfBirth) patterns.push({ ...BUILT_IN_PATTERNS.dob, name: 'dob' });
  for (const custom of config.regex.customPatterns) {
    const compiled = compileCustomPattern(custom);
    if (compiled) patterns.push(compiled);
  }

  const state: MutableState = {
    redactionCounts: {},
    fieldsAffected: new Set<string>(),
  };

  if (patterns.length === 0) {
    return {
      transformedData: data,
      report: {
        layerId: 'l3',
        redactionCounts: {},
        fieldsAffected: [],
        observeMode: config.observeMode,
      },
    };
  }

  const transformed = walk(data, patterns, salt, state, '') as T;

  return {
    transformedData: transformed,
    report: {
      layerId: 'l3',
      redactionCounts: state.redactionCounts,
      fieldsAffected: [...state.fieldsAffected].sort(),
      observeMode: config.observeMode,
    },
  };
}
