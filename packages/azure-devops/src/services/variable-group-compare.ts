/**
 * Pure comparison/summary helpers for Azure DevOps variable groups.
 *
 * Kept free of any HTTP client so the secret-handling rules can be tested
 * exhaustively without a live organisation.
 *
 * Secret rule (load-bearing): Azure DevOps returns a secret as
 * `{ isSecret: true, value: null }` and OMITS `isSecret` entirely for a normal
 * variable. We branch on `isSecret` and never read `.value` for a secret - so
 * even if the API one day returned a real value, it could not reach the output.
 */

export interface RawVariable {
  value?: string | null;
  isSecret?: boolean;
  isReadOnly?: boolean;
}

export interface RawVariableGroup {
  id: number;
  name: string;
  type?: string;
  description?: string;
  isShared?: boolean;
  modifiedOn?: string;
  variables?: Record<string, RawVariable>;
}

/**
 * Suffixes recognised when grouping `<base>-<env>` variable groups.
 *
 * Callers may override these. The si source hardcoded exactly this list, so a
 * team using `-prd` or `_dev` got an empty result forever, with no error.
 */
export const DEFAULT_ENVIRONMENT_SUFFIXES = [
  '-dev',
  '-development',
  '-qa',
  '-uat',
  '-staging',
  '-stage',
  '-test',
  '-prod',
  '-production',
] as const;

export function isSecret(variable: RawVariable): boolean {
  return variable.isSecret === true;
}

export interface VariableSummary {
  variableCount: number;
  secretCount: number;
}

/** Count variables and secrets. Never touches a secret's value. */
export function summariseVariables(variables: Record<string, RawVariable> | undefined): VariableSummary {
  const entries = Object.values(variables ?? {});
  return {
    variableCount: entries.length,
    secretCount: entries.filter(isSecret).length,
  };
}

export interface ValueDifference {
  name: string;
  valueInA: string | null | undefined;
  valueInB: string | null | undefined;
}

export interface SecretPresenceDifference {
  name: string;
  isSecretInA: boolean;
  isSecretInB: boolean;
}

export interface VariableGroupComparison {
  groupA: { id: number; name: string };
  groupB: { id: number; name: string };
  onlyInA: string[];
  onlyInB: string[];
  inBothCount: number;
  valueDifferences: ValueDifference[];
  /** Names present in both where at least one side is a secret. Values never compared. */
  secretsSkipped: string[];
  /** A variable that is a secret on one side and plaintext on the other - a real drift finding. */
  secretPresenceDifferences: SecretPresenceDifference[];
}

export function compareVariables(a: RawVariableGroup, b: RawVariableGroup): VariableGroupComparison {
  const varsA = a.variables ?? {};
  const varsB = b.variables ?? {};
  const namesA = Object.keys(varsA);
  const namesB = Object.keys(varsB);

  const onlyInA = namesA.filter((name) => !(name in varsB)).sort();
  const onlyInB = namesB.filter((name) => !(name in varsA)).sort();
  const inBoth = namesA.filter((name) => name in varsB).sort();

  const valueDifferences: ValueDifference[] = [];
  const secretsSkipped: string[] = [];
  const secretPresenceDifferences: SecretPresenceDifference[] = [];

  for (const name of inBoth) {
    const varA = varsA[name];
    const varB = varsB[name];
    const secretA = isSecret(varA);
    const secretB = isSecret(varB);

    if (secretA !== secretB) {
      secretPresenceDifferences.push({ name, isSecretInA: secretA, isSecretInB: secretB });
    }

    // Either side secret => never read either value.
    if (secretA || secretB) {
      secretsSkipped.push(name);
      continue;
    }

    if (varA.value !== varB.value) {
      valueDifferences.push({ name, valueInA: varA.value, valueInB: varB.value });
    }
  }

  return {
    groupA: { id: a.id, name: a.name },
    groupB: { id: b.id, name: b.name },
    onlyInA,
    onlyInB,
    inBothCount: inBoth.length,
    valueDifferences,
    secretsSkipped,
    secretPresenceDifferences,
  };
}

export interface ParsedEnvironment {
  baseName: string;
  environment: string;
}

/**
 * Split `billing-uat` into `{ baseName: 'billing', environment: 'uat' }`.
 *
 * Matches the LONGEST suffix so `-production` is not mistaken for `-prod`,
 * and refuses a name that is nothing but a suffix.
 */
export function parseEnvironment(
  groupName: string,
  suffixes: readonly string[],
): ParsedEnvironment | null {
  const lower = groupName.toLowerCase();

  const matches = suffixes
    .filter((suffix) => lower.endsWith(suffix.toLowerCase()))
    .sort((x, y) => y.length - x.length);

  for (const suffix of matches) {
    const baseName = groupName.slice(0, groupName.length - suffix.length);
    if (baseName.length === 0) continue;
    return {
      baseName,
      environment: suffix.replace(/^[-_]/, '').toLowerCase(),
    };
  }

  return null;
}
