/**
 * Response shapes for the Microsoft Defender for Cloud ARM APIs.
 *
 * These mirror the `Microsoft.Security` provider payloads. Every list endpoint
 * wraps its rows in `{ value, nextLink }` — see `AzureListResponse` in defender-client.ts.
 */

// ─── Secure Score ───

export interface SecureScore {
  id: string;
  name: string;
  type: string;
  properties: {
    displayName: string;
    /** `percentage` is a fraction in [0, 1] — not an already-scaled percent. */
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
 * Attack paths are not a first-class ARM resource — there is no
 * `Microsoft.Security/attackPaths` endpoint. They are read from the Azure Resource
 * Graph `securityresources` table where `type == 'microsoft.security/attackpaths'`,
 * so every `properties` field arrives as an untyped `dynamic` column and is mapped
 * defensively.
 *
 * Field names below are taken verbatim from Microsoft's documented response schema
 * (learn.microsoft.com/azure/defender-for-cloud/attack-path-api, checked 2026-07-10).
 * Note what is NOT here: there is no `riskLevel`, no `riskFactors`, and no
 * `target`/`entryPoint` object, and `graphComponent` holds insights/entities/connections
 * rather than nodes/edges. Those names belong to the unrelated `risk` object on
 * `Microsoft.Security/assessments@2025-05-04` — see `AssessmentRisk` above. Conflating
 * the two yields filters that silently match nothing.
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
    /** Map of entity internal ID → the security assessments on that entity. */
    assessments?: Record<string, unknown>;
    graphComponent?: {
      insights?: unknown[];
      entities?: unknown[];
      connections?: unknown[];
    };
    AttackPathID?: string;
  };
}
