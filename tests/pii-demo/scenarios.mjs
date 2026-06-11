// Scenario matrix for the PII protection demo.
//
// Each scenario is one MCP-server-process configuration. The runner spins up
// a fresh server per (scenario × server) pair and runs every query that
// targets that server inside the same process — so cross-call correlation
// (Q1) is observable within a scenario.
//
// `env` values are merged on top of process.env when the server is spawned.
// `PII_CONFIG_PATH` values are resolved relative to this directory.

export const scenarios = [
  {
    id: 'no-protection',
    label: 'No protection (baseline)',
    description:
      'Pipeline disabled. This is what the LLM would see without the redaction layer — included as the control.',
    env: {
      MCP_ENVIRONMENT_TYPE: 'dev',
      PII_PROTECTION: 'false',
    },
  },
  {
    id: 'l1-exclusion',
    label: 'L1 — query-time field exclusion',
    description:
      'Configured PII fields are stripped from the OData $select before the request leaves. The data is never collected from Dataverse in the first place.',
    env: {
      MCP_ENVIRONMENT_TYPE: 'production',
      PII_CONFIG_PATH: './configs/l1-exclusion.json',
    },
  },
  {
    id: 'l2-only',
    label: 'L2 — configured-field redaction',
    description:
      'Known PII fields are replaced with synthetic tokens in the response. Free-text fields (description, notetext) pass through untouched.',
    env: {
      MCP_ENVIRONMENT_TYPE: 'production',
      PII_CONFIG_PATH: './configs/l2-only.json',
    },
  },
  {
    id: 'l2-l3',
    label: 'L2 + L3 — field rules + regex on free text',
    description:
      'Adds regex pattern matching on every string in the response. Catches emails, phones, and DOB-shaped dates that L2 misses inside free-text fields.',
    env: {
      MCP_ENVIRONMENT_TYPE: 'production',
      PII_CONFIG_PATH: './configs/l2-l3.json',
    },
  },
  {
    id: 'full-l1-l4',
    label: 'Full v1 — L1 + L2 + L3 + L4',
    description:
      'All four v1 layers active using the built-in defaults. Layer 4 (NER) catches person names in free text and OData FormattedValue annotations.',
    env: {
      MCP_ENVIRONMENT_TYPE: 'production',
      PII_PROTECTION: 'true',
    },
  },
  {
    id: 'observe-mode',
    label: 'Observe mode (full pipeline, data unchanged)',
    description:
      'Pipeline runs and reports what it WOULD have redacted via the per-call footer, but returns the original data unchanged. Used to validate recall before flipping redaction on.',
    env: {
      MCP_ENVIRONMENT_TYPE: 'production',
      PII_PROTECTION: 'true',
      PII_OBSERVE_MODE: 'true',
    },
  },
];
