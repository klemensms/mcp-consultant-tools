/**
 * Response shapes for the Microsoft Defender for Cloud ARM APIs.
 *
 * These mirror the `Microsoft.Security` provider payloads. Every list endpoint
 * wraps its rows in `{ value, nextLink }` - see `AzureListResponse` in defender-client.ts.
 */

// ─── Secure Score ───

export interface SecureScore {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName: string;
    /** `percentage` is a fraction in [0, 1] - not an already-scaled percent. */
    score: {
      max: number;
      current: number;
      percentage: number;
    };
    weight: number;
  };
}

export interface SecureScoreControl {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName: string;
    /** `percentage` is a fraction in [0, 1]. */
    score: {
      max: number;
      current: number;
      percentage: number;
    };
    healthyResourceCount: number;
    unhealthyResourceCount: number;
    notApplicableResourceCount: number;
    weight: number;
    definition?: {
      id: string;
      name: string;
    };
  };
}

export interface SecureScoreControlDefinition {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName: string;
    description: string;
    maxScore: number;
    source: {
      sourceType: string;
    };
    assessmentDefinitions: Array<{
      id: string;
    }>;
  };
}

// ─── Assessment ───

export type AssessmentStatusCode = 'Healthy' | 'Unhealthy' | 'NotApplicable';

/** Present from api-version 2025-05-04 onwards; absent on older versions. */
export interface AssessmentRisk {
  level?: 'Critical' | 'High' | 'Medium' | 'Low' | 'None';
  riskFactors?: string[];
  isContextualRisk?: boolean;
  attackPathsReferences?: string[];
  paths?: Array<{
    id?: string;
    nodes?: Array<{ id?: string; nodePropertiesLabel?: string[] }>;
    edges?: Array<{ id: string; sourceId: string; targetId: string }>;
  }>;
}

export interface SecurityAssessment {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName?: string;
    status: {
      code: AssessmentStatusCode;
      cause?: string;
      description?: string;
    };
    /** Discriminated on `source` ('Azure' | 'OnPremiseSql'); `id` only appears on read responses. */
    resourceDetails: {
      source: string;
      id?: string;
    };
    risk?: AssessmentRisk;
    additionalData?: Record<string, unknown>;
    metadata?: AssessmentMetadata['properties'];
    links?: {
      azurePortalUri?: string;
    };
    /**
     * Set only on a row recovered from Resource Graph, and only for `properties` keys
     * the mapper does not name. An allowlist built from Microsoft's documentation is
     * what hid the entire risk payload of every attack path on a live tenant, so
     * anything unrecognised rides along here instead of being discarded.
     */
    unmappedProperties?: Record<string, unknown>;
  };
}

/** `Critical` exists only from api-version 2025-05-04 onwards. */
export type AssessmentSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface AssessmentMetadata {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName: string;
    description?: string;
    remediationDescription?: string;
    categories?: string[];
    severity: AssessmentSeverity;
    userImpact?: 'High' | 'Moderate' | 'Low';
    implementationEffort?: 'High' | 'Moderate' | 'Low';
    threats?: string[];
    preview?: boolean;
    assessmentType: string;
    policyDefinitionId?: string;
    tactics?: string[];
    techniques?: string[];
  };
}

// ─── Regulatory Compliance ───

export type ComplianceState = 'Passed' | 'Failed' | 'Skipped' | 'Unsupported';

export interface RegulatoryComplianceStandard {
  id: string;
  name: string;
  type: string;
  properties: {
    state: ComplianceState;
    passedControls: number;
    failedControls: number;
    skippedControls: number;
    unsupportedControls: number;
  };
}

export interface RegulatoryComplianceControl {
  id: string;
  name: string;
  type: string;
  properties: {
    description?: string;
    state: ComplianceState;
    passedAssessments: number;
    failedAssessments: number;
    skippedAssessments: number;
  };
}

export interface RegulatoryComplianceAssessment {
  id: string;
  name: string;
  type: string;
  properties: {
    description?: string;
    assessmentType?: string;
    assessmentDetailsLink?: string;
    state: ComplianceState;
    passedResources: number;
    failedResources: number;
    skippedResources: number;
    unsupportedResources?: number;
  };
}

// ─── Attack Path ───

/**
 * Attack paths are not a first-class ARM resource - there is no
 * `Microsoft.Security/attackPaths` endpoint. They are read from the Azure Resource
 * Graph `securityresources` table where `type == 'microsoft.security/attackpaths'`,
 * so every `properties` field arrives as an untyped `dynamic` column and is mapped
 * defensively.
 *
 * **Two shapes reach this type, and a row carries one or the other.** Microsoft's
 * published field table (learn.microsoft.com/azure/defender-for-cloud/attack-path-api,
 * still unchanged as of 2026-08-19) describes only the legacy Defender CSPM shape:
 * `potentialImpact`, `riskCategories`, `entryPointEntityInternalID`,
 * `targetEntityInternalID`. Live rows on a tenant whose attack paths come from
 * Microsoft Security Exposure Management instead carry `riskLevel`, `riskFactors`,
 * `entryPoint`, `target`, `attackPathSteps`, `mITRETacticsAndTechniques`,
 * `attackStory` and `isPartialAttackPath` - measured on a real estate, where a path
 * of `riskLevel: High` printed as impact `Unknown` with no risk categories because
 * only the documented names were mapped.
 *
 * Both name sets are therefore mapped, `unmappedProperties` carries anything neither
 * set names, and `effectiveRiskLevel` / `effectiveRiskFactors` in
 * `services/attack-path-service.ts` read whichever shape arrived. Never key a filter,
 * a count or a display line on one spelling alone.
 *
 * `graphComponent` holds insights/entities/connections, not nodes/edges. `riskLevel`
 * and `riskFactors` also exist, differently, on the `risk` object of
 * `Microsoft.Security/assessments@2025-05-04` - see `AssessmentRisk` above; they are
 * separate fields that happen to share a name.
 */
export interface AttackPath {
  id: string;
  name: string;
  type: string;
  tenantId?: string;
  location?: string;
  subscriptionId?: string;
  properties: {
    displayName: string;
    description?: string;
    attackPathType?: string;
    manualRemediationSteps?: string[];
    refreshInterval?: string;
    /** Impact of this path being breached. Values are not enumerated by Microsoft. */
    potentialImpact?: string;
    /** Risk categories attached to the path. Values are not enumerated by Microsoft. */
    riskCategories?: string[];
    entryPointEntityInternalID?: string;
    targetEntityInternalID?: string;

    // --- Exposure Management shape. Undocumented in the attack-path field table,
    // --- measured on live rows. Absent on a legacy Defender CSPM row.
    /** Risk level of the path, e.g. `High`. The Exposure Management name for `potentialImpact`. */
    riskLevel?: string;
    /**
     * Risk factors driving the level, e.g. `Internet exposure`. Measured as strings;
     * typed loosely because a factor object would otherwise be coerced to
     * `[object Object]` in any breakdown keyed on it.
     */
    riskFactors?: unknown[];
    /** Entry-point entity. Replaces the legacy internal-ID reference with the entity itself. */
    entryPoint?: unknown;
    /** Target entity. Replaces the legacy internal-ID reference with the entity itself. */
    target?: unknown;
    /** Ordered steps from entry point to target. */
    attackPathSteps?: unknown[];
    /** MITRE tactics and techniques attributed to the path. Casing is Microsoft's. */
    mITRETacticsAndTechniques?: unknown[];
    /** Narrative description of the path. */
    attackStory?: string;
    /** True when the path is known to be incomplete, so its steps are a lower bound. */
    isPartialAttackPath?: boolean;
    /** Map of entity internal ID → the security assessments on that entity. */
    assessments?: Record<string, unknown>;
    graphComponent?: {
      insights?: unknown[];
      entities?: unknown[];
      connections?: unknown[];
    };
    AttackPathID?: string;

    /**
     * Every `properties` key neither shape above names, carried verbatim. A named
     * allowlist that dropped the rest is what hid the whole Exposure Management risk
     * payload, so an unrecognised field now arrives visibly instead of vanishing.
     * Absent when there was nothing left over.
     */
    unmappedProperties?: Record<string, unknown>;
  };
}

// ============================================================
// Security alerts (Microsoft.Security/alerts)
// ============================================================

export type AlertSeverity = 'Informational' | 'Low' | 'Medium' | 'High';
export type AlertStatus = 'Active' | 'InProgress' | 'Resolved' | 'Dismissed';

/**
 * A Defender for Cloud security alert.
 *
 * `properties` is deliberately open (`[key: string]: unknown`) rather than a closed set.
 * Twice in this package a mapper built from Microsoft's published field table dropped
 * live payload it had not been told to expect - the whole Exposure Management risk block
 * on attack paths, then whatever the assessment table omitted. Alerts carry a
 * `extendedProperties` bag whose contents are detection-specific and undocumented by
 * design, so a closed type here would be the same defect a third time.
 */
export interface SecurityAlert {
  id: string;
  name: string;
  type: string;
  properties: {
    alertDisplayName?: string;
    description?: string;
    severity?: AlertSeverity;
    status?: AlertStatus;
    /** Detection logic identifier - the same value for every instance of one detection. */
    alertType?: string;
    /** Kill-chain intent, e.g. `LateralMovement`. Microsoft's enum is long and grows. */
    intent?: string;
    startTimeUtc?: string;
    endTimeUtc?: string;
    timeGeneratedUtc?: string;
    processingEndTimeUtc?: string;
    /** Display name of the resource most related to the alert. */
    compromisedEntity?: string;
    /** Product that raised it, e.g. Microsoft Defender for Servers or Microsoft Sentinel. */
    productName?: string;
    vendorName?: string;
    /** True when the alert is a compound grouping of several alerts. */
    isIncident?: boolean;
    /** Deep link to the alert in the Azure portal. */
    alertUri?: string;
    remediationSteps?: string[];
    resourceIdentifiers?: unknown[];
    entities?: unknown[];
    techniques?: string[];
    subTechniques?: string[];
    extendedProperties?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

// ============================================================
// Defender plans (Microsoft.Security/pricings)
// ============================================================

export type PricingTier = 'Free' | 'Standard';
export type ResourcesCoverageStatus = 'FullyCovered' | 'PartiallyCovered' | 'NotCovered';

/** One Defender plan's configuration on a scope. */
export interface SecurityPricing {
  id: string;
  name: string;
  type: string;
  properties: {
    /** `Standard` is the paid tier; `Free` means the plan is off. */
    pricingTier?: PricingTier;
    /** Which sub-plan of a Standard configuration, where a plan offers more than one. */
    subPlan?: string;
    /** ISO 8601 duration left on a free trial, when one is running. */
    freeTrialRemainingTime?: string;
    /** When `pricingTier` was last set to Standard. */
    enablementTime?: string;
    /** Subscription-level only. Whether the resources under the scope are actually covered. */
    resourcesCoverageStatus?: ResourcesCoverageStatus;
    /** `"True"` when the configuration comes from a parent scope. Microsoft uses strings here. */
    inherited?: string;
    inheritedFrom?: string;
    /** Per-plan extensions, e.g. agentless scanning. */
    extensions?: Array<{ name?: string; isEnabled?: string; [key: string]: unknown }>;
    deprecated?: boolean;
    replacedBy?: string[];
    [key: string]: unknown;
  };
}
