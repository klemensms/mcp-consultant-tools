export const SECURITY_POSTURE_REVIEW_TEMPLATE = `Review the overall security posture of this Azure subscription using Microsoft Defender for Cloud.

Start by:
1. defender-get-secure-score — the current score and percentage
2. defender-list-score-controls — which control areas are strong and which drag the score down
3. defender-list-assessments with statusFilter='Unhealthy' — the failing recommendations

For each weak area, investigate:
- Which specific resources are unhealthy
- What the remediation steps are (defender-list-assessment-metadata carries remediationDescription)
- Priority by severity — note that 'Critical' is a real severity, above 'High'

Two traps to avoid:
- summary.averageScorePercentage from defender-list-score-controls is an unweighted mean across controls. It is NOT the secure score. Quote defender-get-secure-score for the score itself.
- If you pass maxResults and the response comes back with truncated=true, every count in summary is a lower bound. Re-run without maxResults before quoting totals.

Produce:
- Overall score, and what it means
- Top 5 controls needing attention
- Critical and high-severity unhealthy assessments
- A remediation order, cheapest-impactful-first`;

export const COMPLIANCE_AUDIT_TEMPLATE = `Audit this subscription's compliance posture against its regulatory standards.

Start by:
1. defender-list-compliance-standards — every enabled standard with its control counts
2. For standards with failures, defender-list-compliance-controls with stateFilter='Failed'
3. For each critical failing control, defender-list-compliance-assessments to see the affected resources

Focus on:
- Which standards have the lowest compliance percentage
- Controls failing across several standards at once — one fix, several wins
- Resources appearing in multiple failed assessments
- Quick wins: controls one assessment away from passing

Two traps to avoid:
- An empty standards list means no standards are ENABLED in Defender for Cloud, not that the subscription is non-compliant. Say so plainly rather than reporting compliance.
- compliancePercentage is passed / (passed + failed). Skipped and unsupported controls are excluded from the denominator, so it will not equal passedControls / totalControls.

Produce:
- A per-standard compliance table
- The top 10 failing controls with their resource counts
- A remediation priority list`;

export const ATTACK_PATH_ANALYSIS_TEMPLATE = `Investigate the attack paths Microsoft Defender for Cloud has identified in this subscription.

Start by:
1. defender-list-attack-paths with no filters — this also reveals which risk level and risk factor values this subscription uses
2. Triage by summary.byRiskLevel and summary.byRiskFactor
3. For each significant path, defender-get-attack-path for the full chain

For each path, analyse:
- The entry point and the target (entryPoint / target, or the legacy entryPointEntityInternalID / targetEntityInternalID resolved through the assessments map)
- The chain of misconfigurations that connects them, from attackPathSteps where present, otherwise graphComponent.entities and graphComponent.connections
- manualRemediationSteps, and which single fix breaks the most paths

Three traps to avoid:
- An empty result almost certainly means the Defender CSPM plan is not enabled on this subscription. Verify the plan before reporting "no attack paths" — that conclusion is a security claim and it would be wrong.
- Two row shapes exist and this subscription returns one of them: riskLevel / riskFactors / entryPoint / target / attackPathSteps / attackStory (Microsoft Security Exposure Management), or potentialImpact / riskCategories / entryPointEntityInternalID / targetEntityInternalID (legacy Defender CSPM). Read both names for anything you report. graphComponent holds insights/entities/connections, not nodes/edges.
- summary.riskLevelNotReported counts paths whose payload named no risk level under either spelling, and those sit in the 'NotReported' bucket. Report them as unrated, never as low risk, and read summary.note.

Produce:
- Path counts by risk level and by risk factor
- Detailed analysis of the highest-impact paths
- The resources appearing in the most paths
- A remediation plan ordered by how many paths each fix breaks`;
