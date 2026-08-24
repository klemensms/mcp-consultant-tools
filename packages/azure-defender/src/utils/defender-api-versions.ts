/**
 * Pinned ARM api-versions for the Defender for Cloud surfaces this package reads.
 *
 * Verified against Microsoft Learn / azure-rest-api-specs on 2026-07-10. Every call
 * site passes one of these explicitly - there is no resolve-by-path fallback, because
 * a path like `/subscriptions/x/providers/Microsoft.Compute/.../providers/Microsoft.Security/assessments/y`
 * contains two providers and any regex picks the wrong one.
 *
 * Re-check before a release: a stale api-version does not fail loudly. It either
 * 400s or, worse, returns an older schema that silently omits fields.
 */
export const DEFENDER_API_VERSIONS = {
  /** Only version ever shipped for this surface (2020-01-01-preview → 2020-01-01 GA). */
  secureScores: '2020-01-01',
  secureScoreControls: '2020-01-01',

  /**
   * `2020-01-01` is two GA generations behind and cannot represent a `Critical`
   * severity at all - its enum is High/Medium/Low. `2025-05-04` adds `Critical`
   * plus the `risk` object. `status.code` and `resourceDetails` are unchanged.
   */
  assessments: '2025-05-04',
  assessmentMetadata: '2025-05-04',

  /**
   * Not a stale pin: `2019-01-01-preview` is the ONLY version this surface has
   * ever had. No GA exists, seven years on. Do not "upgrade" it.
   */
  regulatoryCompliance: '2019-01-01-preview',

  /**
   * Newest stable this surface has: `alerts.json` stops at `2022-01-01` in
   * `Azure/azure-rest-api-specs` and the TypeSpec-migrated `AlertsAPI/` folder still
   * emits the same version. Not a stale pin - there is nothing newer to move to.
   */
  alerts: '2022-01-01',

  /** Newest stable for `pricings.json`. `2025-10-01-preview` exists; preview is not pinned. */
  pricings: '2024-01-01',

  /** Resource Graph query POST. Current GA; `2021-03-01` differs only by an additive option field. */
  resourceGraph: '2024-04-01',
} as const;

/**
 * Api-versions used ONLY by the metadata-field diagnostic, never by a read command.
 *
 * `defender-diagnose-metadata-fields` calls one surface at two versions to find out
 * which of them populates a field. That is a deliberate, contained comparison with
 * both answers in the same payload. It is deliberately NOT a general
 * `--api-version` override: letting a caller choose the version on a read command is
 * how a request comes back on an older schema with fields quietly missing, which is
 * exactly what the header above warns about.
 */
export const DEFENDER_DIAGNOSTIC_API_VERSIONS = {
  /**
   * The GA generation before `2025-05-04`. Its published examples for
   * `assessmentMetadata` carry `implementationEffort` and `userImpact`, while the
   * `2025-05-04` examples omit them - but both versions mark the two fields
   * optional, so the examples are not evidence of a version difference. That is
   * what the diagnostic exists to settle.
   */
  assessmentMetadataLegacy: '2020-01-01',
} as const;
