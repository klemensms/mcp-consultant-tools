import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  PiiConfig,
  LayerToggles,
  FieldRules,
  EntityFieldRule,
  RegexConfig,
  NerConfig,
} from './types.js';

const DEFAULT_NONPROD_HINTS: ReadonlyArray<string> = [
  'dev',
  'uat',
  'training',
  'support',
  'migration',
  'sandbox',
  'test',
];

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '') return undefined;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

function readNonprodHints(): ReadonlyArray<string> {
  const raw = process.env.PII_NONPROD_HINTS?.trim();
  if (!raw) return DEFAULT_NONPROD_HINTS;
  const parsed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_NONPROD_HINTS;
}

function defaultLayers(): LayerToggles {
  return { l1: true, l2: true, l3: true, l4: true };
}

function defaultFieldRules(): FieldRules {
  return {
    contact: {
      excludeFromSelect: [],
      redactInResponse: [
        'firstname',
        'lastname',
        'middlename',
        'fullname',
        'yomifirstname',
        'yomimiddlename',
        'yomilastname',
        'yomifullname',
        'emailaddress1',
        'emailaddress2',
        'emailaddress3',
        'mobilephone',
        'telephone1',
        'telephone2',
        'telephone3',
        'birthdate',
        'address1_line1',
        'address1_line2',
        'address1_line3',
        'address1_city',
        'address1_postalcode',
        'address1_country',
        'address1_county',
        'address1_stateorprovince',
        'address1_composite',
        'address2_line1',
        'address2_line2',
        'address2_line3',
        'address2_city',
        'address2_postalcode',
        'address2_country',
        'address2_county',
        'address2_stateorprovince',
        'address2_composite',
      ],
    },
    account: {
      excludeFromSelect: [],
      redactInResponse: [
        'emailaddress1',
        'emailaddress2',
        'emailaddress3',
        'telephone1',
        'telephone2',
        'telephone3',
        'address1_line1',
        'address1_line2',
        'address1_line3',
        'address1_city',
        'address1_postalcode',
        'address1_country',
        'address1_county',
        'address1_stateorprovince',
        'address1_composite',
        'address2_line1',
        'address2_line2',
        'address2_line3',
        'address2_city',
        'address2_postalcode',
        'address2_country',
        'address2_county',
        'address2_stateorprovince',
        'address2_composite',
      ],
    },
    lead: {
      excludeFromSelect: [],
      redactInResponse: [
        'firstname',
        'lastname',
        'middlename',
        'fullname',
        'yomifirstname',
        'yomimiddlename',
        'yomilastname',
        'yomifullname',
        'emailaddress1',
        'emailaddress2',
        'emailaddress3',
        'mobilephone',
        'telephone1',
        'telephone2',
        'telephone3',
        'address1_line1',
        'address1_line2',
        'address1_line3',
        'address1_city',
        'address1_postalcode',
        'address1_country',
        'address1_county',
        'address1_stateorprovince',
        'address1_composite',
      ],
    },
    systemuser: {
      excludeFromSelect: [],
      redactInResponse: [
        'fullname',
        'firstname',
        'lastname',
        'middlename',
        'yomifirstname',
        'yomimiddlename',
        'yomilastname',
        'yomifullname',
        'internalemailaddress',
        'mobilephone',
      ],
    },
    'b2c-user': {
      excludeFromSelect: [],
      redactInResponse: [
        'givenName',
        'surname',
        'displayName',
        'mail',
        'otherMails',
        'mobilePhone',
      ],
    },
  };
}

function defaultRegex(): RegexConfig {
  return {
    email: true,
    phone: true,
    dateOfBirth: true,
    customPatterns: [],
  };
}

function defaultNer(): NerConfig {
  return {
    scanFields: [
      'description',
      'notetext',
      'comments',
      'body',
      'displayName',
      'name',
      'System.Description',
      'System.Title',
      'System.History',
      'Microsoft.VSTS.TCM.ReproSteps',
      'Microsoft.VSTS.TCM.SystemInfo',
      'Microsoft.VSTS.Common.AcceptanceCriteria',
      'text',
    ],
    scanOdataAnnotations: true,
  };
}

function partnerForm(key: string): string {
  if (key.endsWith('s')) return key.slice(0, -1);
  return key + 's';
}

function lowercaseFieldList(fields: string[] | undefined): string[] {
  return (fields ?? []).map((f) => f.toLowerCase());
}

function normaliseRule(rule: EntityFieldRule): EntityFieldRule {
  return {
    excludeFromSelect: lowercaseFieldList(rule.excludeFromSelect),
    redactInResponse: lowercaseFieldList(rule.redactInResponse),
  };
}

function setEquals(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const item of setB) if (!setA.has(item)) return false;
  return true;
}

function symmetricDiff(
  a: string[],
  b: string[]
): { onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: a.filter((x) => !setB.has(x)),
    onlyB: b.filter((x) => !setA.has(x)),
  };
}

function rulesEquivalent(r1: EntityFieldRule, r2: EntityFieldRule): boolean {
  return (
    setEquals(r1.redactInResponse ?? [], r2.redactInResponse ?? []) &&
    setEquals(r1.excludeFromSelect ?? [], r2.excludeFromSelect ?? [])
  );
}

function divergenceMessage(
  keyA: string,
  keyB: string,
  ruleA: EntityFieldRule,
  ruleB: EntityFieldRule
): string {
  const lines: string[] = [
    `PII protection refused to start: fieldRules has both '${keyA}' and '${keyB}' for the same entity, but their lists differ.`,
  ];
  const responseDiff = symmetricDiff(
    ruleA.redactInResponse ?? [],
    ruleB.redactInResponse ?? []
  );
  if (responseDiff.onlyA.length > 0) {
    lines.push(
      `  - Only in '${keyA}'.redactInResponse: ${responseDiff.onlyA.join(', ')}`
    );
  }
  if (responseDiff.onlyB.length > 0) {
    lines.push(
      `  - Only in '${keyB}'.redactInResponse: ${responseDiff.onlyB.join(', ')}`
    );
  }
  const selectDiff = symmetricDiff(
    ruleA.excludeFromSelect ?? [],
    ruleB.excludeFromSelect ?? []
  );
  if (selectDiff.onlyA.length > 0) {
    lines.push(
      `  - Only in '${keyA}'.excludeFromSelect: ${selectDiff.onlyA.join(', ')}`
    );
  }
  if (selectDiff.onlyB.length > 0) {
    lines.push(
      `  - Only in '${keyB}'.excludeFromSelect: ${selectDiff.onlyB.join(', ')}`
    );
  }
  lines.push(
    'Reconcile to a single canonical key (singular logical name preferred).'
  );
  return lines.join('\n');
}

/**
 * Lowercase field names, then expand each entity key to register both K and
 * its `s$ ↔ +s` partner as synonyms. Throws PiiRefuseToStartError if both
 * forms are explicitly present in the input with divergent lists.
 */
function expandFieldRules(input: FieldRules): FieldRules {
  // Step 1: Lowercase field names within each rule (operator may have written
  // mixed case; Dataverse responses always come back lowercase).
  const normalised: FieldRules = {};
  for (const [key, rule] of Object.entries(input)) {
    normalised[key] = normaliseRule(rule);
  }

  // Step 2: Walk keys, expand to register both K and partner. Detect
  // divergent doubles and refuse to start.
  const expanded: FieldRules = {};
  const handled = new Set<string>();

  for (const key of Object.keys(normalised)) {
    if (handled.has(key)) continue;
    const partner = partnerForm(key);
    const ruleK = normalised[key];
    const rulePartner = normalised[partner];

    if (rulePartner !== undefined) {
      // Both forms explicitly present.
      if (!rulesEquivalent(ruleK, rulePartner)) {
        throw new PiiRefuseToStartError(
          divergenceMessage(key, partner, ruleK, rulePartner)
        );
      }
      // Identical (modulo case) → silent dedup.
      expanded[key] = ruleK;
      expanded[partner] = ruleK;
      handled.add(key);
      handled.add(partner);
    } else {
      // Single-key case → register under both forms.
      expanded[key] = ruleK;
      expanded[partner] = ruleK;
      handled.add(key);
    }
  }

  return expanded;
}

function loadConfigFile(path: string): Partial<PiiConfig> {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`PII config at ${path} did not parse to an object`);
  }
  return parsed as Partial<PiiConfig>;
}

export class PiiRefuseToStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiiRefuseToStartError';
  }
}

export interface LoadedPiiContext {
  config: PiiConfig;
  getSalt(): Buffer;
}

export function loadPiiConfig(): LoadedPiiContext {
  const piiProtectionEnv = parseBool(process.env.PII_PROTECTION);
  const observeModeEnv = parseBool(process.env.PII_OBSERVE_MODE) ?? false;
  const configPath = process.env.PII_CONFIG_PATH;

  let fileConfig: Partial<PiiConfig> = {};
  let fileLoadError: Error | undefined;
  if (configPath) {
    try {
      fileConfig = loadConfigFile(configPath);
    } catch (err) {
      fileLoadError = err as Error;
    }
  }

  if (fileLoadError) {
    throw new PiiRefuseToStartError(
      `PII protection refused to start: PII_CONFIG_PATH='${configPath}' failed to load. ${fileLoadError.message}`
    );
  }

  // When nothing is configured, the pipeline is OFF — no startup error.
  // Operators opt in by setting PII_PROTECTION=true or by writing a config
  // file with `"enabled": true`.
  const enabled: boolean = fileConfig.enabled ?? piiProtectionEnv ?? false;

  const config: PiiConfig = {
    enabled,
    observeMode: fileConfig.observeMode ?? observeModeEnv,
    environmentType: 'production',
    layers: { ...defaultLayers(), ...(fileConfig.layers ?? {}) },
    fieldRules: expandFieldRules(fileConfig.fieldRules ?? defaultFieldRules()),
    regex: { ...defaultRegex(), ...(fileConfig.regex ?? {}) },
    ner: { ...defaultNer(), ...(fileConfig.ner ?? {}) },
  };

  const salt = loadSessionSalt();
  return {
    config,
    getSalt: () => salt,
  };
}

function loadSessionSalt(): Buffer {
  const raw = process.env.PII_SESSION_SALT?.trim();
  if (!raw) return randomBytes(32);

  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new PiiRefuseToStartError(
      'PII protection refused to start: PII_SESSION_SALT must be a hex string ' +
        '(only 0-9, a-f, A-F characters). Generate one with: openssl rand -hex 32'
    );
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(raw, 'hex');
  } catch (err) {
    throw new PiiRefuseToStartError(
      `PII protection refused to start: PII_SESSION_SALT failed to hex-decode. ${(err as Error).message}`
    );
  }

  if (buf.length !== 32) {
    throw new PiiRefuseToStartError(
      `PII protection refused to start: PII_SESSION_SALT must decode to exactly 32 bytes (got ${buf.length}). ` +
        'Generate one with: openssl rand -hex 32'
    );
  }

  return buf;
}

/**
 * Heuristic warning for "looks like production but PII protection is off".
 * Returns a stderr-ready warning string when pipelineEnabled is false AND the
 * given identifier contains none of the configured non-prod hints. Returns
 * null otherwise. Pass undefined identifier to skip the check.
 *
 * Hints come from PII_NONPROD_HINTS (comma-separated, case-insensitive
 * substrings) or the built-in defaults: dev, uat, training, support,
 * migration, sandbox, test.
 */
export function checkEnvironmentLooksUnprotected(
  identifier: string | undefined,
  pipelineEnabled: boolean
): string | null {
  if (pipelineEnabled) return null;
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const hints = readNonprodHints();
  const lowered = trimmed.toLowerCase();
  if (hints.some((hint) => lowered.includes(hint))) return null;

  return (
    `[PII WARNING] PII protection is OFF and the configured environment identifier ` +
    `'${trimmed}' does not match any non-prod hint (${hints.join(', ')}). ` +
    `If this is a production environment, raw data will be sent to the LLM. ` +
    `Set PII_PROTECTION=true and MCP_ENVIRONMENT_TYPE=production to enable protection, ` +
    `or extend PII_NONPROD_HINTS if your non-prod environment uses a different naming convention.`
  );
}
