/**
 * Credential expiry classification.
 *
 * Pure and clock-injected: `now` is always a parameter. The source this was ported
 * from called `new Date()` inside the mapper, once per credential, so a long list
 * could straddle a day boundary mid-scan and the tests could not pin a boundary.
 */

export const MS_PER_DAY = 86_400_000;

export type CredentialStatus = 'expired' | 'expiring' | 'active' | 'unknown';

export interface CredentialClassification {
  status: CredentialStatus;
  /** Whole days remaining; negative once expired. `null` when the expiry is unknown. */
  daysUntilExpiry: number | null;
}

/**
 * Classify one credential's `endDateTime` against a threshold.
 *
 * The threshold comparison is done in milliseconds, never in rounded days: rounding
 * first would pull a credential expiring in 30 days + 1 hour into a 30-day window.
 *
 * @param endDateTime ISO 8601 timestamp from Graph, or null/undefined if not selected.
 * @param now The reference instant. Inject it; never default it here.
 * @param thresholdDays Days ahead that counts as "expiring". 0 means only already-expired.
 */
export function classifyCredential(
  endDateTime: string | null | undefined,
  now: Date,
  thresholdDays: number
): CredentialClassification {
  if (!endDateTime) {
    return { status: 'unknown', daysUntilExpiry: null };
  }

  const expiry = Date.parse(endDateTime);
  if (Number.isNaN(expiry)) {
    return { status: 'unknown', daysUntilExpiry: null };
  }

  const msRemaining = expiry - now.getTime();
  const daysUntilExpiry = Math.floor(msRemaining / MS_PER_DAY);

  // A credential is invalid AT endDateTime, so <= 0 is expired rather than "0 days left".
  if (msRemaining <= 0) {
    return { status: 'expired', daysUntilExpiry };
  }

  if (msRemaining <= thresholdDays * MS_PER_DAY) {
    return { status: 'expiring', daysUntilExpiry };
  }

  return { status: 'active', daysUntilExpiry };
}
