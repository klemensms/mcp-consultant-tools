/**
 * Synthetic 6-scenario audit demo descriptors.
 *
 * This module is documentation-as-data, NOT a runner. It enumerates the
 * scenarios that exercise the Phase A PII audit logging subsystem
 * end-to-end against `mcptests.crm4.dynamics.com`. A future operator (or
 * future automated runner) drives these via `mcp-local-tester` /
 * `/test-mcp-local` against `tests/audit-demo/.mcp.json`, captures stdout
 * + the resulting `audit-out/` JSONL, and writes a `output/demo.md`
 * summary.
 *
 * See `README.md` for manual run instructions, prerequisites, and the
 * exact verification commands.
 */

export const scenarios = [
  {
    name: '1-refuse-to-start-matrix',
    description:
      'Five subprocess invocations of the powerplatform-data server with deliberately-bad config. Each must exit 1 with a clear refuse-to-start error on stderr.',
    steps: [
      {
        id: '1a',
        label: 'Production env, MCP_AUDIT_LEVEL unset',
        env: {
          MCP_ENVIRONMENT_TYPE: 'production',
          POWERPLATFORM_URL: '<from 1Password>',
          POWERPLATFORM_CLIENT_ID: '<from 1Password>',
          POWERPLATFORM_CLIENT_SECRET: '<from 1Password>',
          POWERPLATFORM_TENANT_ID: '<from 1Password>',
        },
        expect: 'exit 1; stderr contains "MCP_AUDIT_LEVEL must be set explicitly"',
      },
      {
        id: '1b',
        label: 'Production env, MCP_AUDIT_LEVEL=off',
        env: {
          MCP_ENVIRONMENT_TYPE: 'production',
          MCP_AUDIT_LEVEL: 'off',
          POWERPLATFORM_URL: '<from 1Password>',
          POWERPLATFORM_CLIENT_ID: '<from 1Password>',
          POWERPLATFORM_CLIENT_SECRET: '<from 1Password>',
          POWERPLATFORM_TENANT_ID: '<from 1Password>',
        },
        expect: 'exit 1; stderr contains "production rejects MCP_AUDIT_LEVEL=off"',
      },
      {
        id: '1c',
        label: 'MCP_AUDIT_LEVEL=lean, MCP_AUDIT_CLIENT unset',
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          MCP_AUDIT_LEVEL: 'lean',
          POWERPLATFORM_URL: '<from 1Password>',
          POWERPLATFORM_CLIENT_ID: '<from 1Password>',
          POWERPLATFORM_CLIENT_SECRET: '<from 1Password>',
          POWERPLATFORM_TENANT_ID: '<from 1Password>',
        },
        expect: 'exit 1; stderr names MCP_AUDIT_CLIENT as the missing var',
      },
      {
        id: '1d',
        label: 'MCP_AUDIT_LEVEL=lean, audit base directory unwritable',
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          MCP_AUDIT_LEVEL: 'lean',
          MCP_AUDIT_CLIENT: 'MCPTest',
          // Pick any path the current user cannot create:
          // - Linux: /proc/audit-demo
          // - macOS: /System/audit-demo (SIP-protected)
          MCP_AUDIT_PATH: '/proc/audit-demo',
          POWERPLATFORM_URL: '<from 1Password>',
          POWERPLATFORM_CLIENT_ID: '<from 1Password>',
          POWERPLATFORM_CLIENT_SECRET: '<from 1Password>',
          POWERPLATFORM_TENANT_ID: '<from 1Password>',
        },
        expect: 'exit 1; stderr names the unwritable audit path',
      },
      {
        id: '1e',
        label: 'MCP_AUDIT_LEVEL=lean, corrupted .chain-state',
        preStage: [
          'mkdir -p ./audit-out/MCPTest',
          'printf "this is not valid json" > ./audit-out/MCPTest/.chain-state',
        ],
        env: {
          MCP_ENVIRONMENT_TYPE: 'uat',
          MCP_AUDIT_LEVEL: 'lean',
          MCP_AUDIT_CLIENT: 'MCPTest',
          MCP_AUDIT_PATH: './audit-out',
          POWERPLATFORM_URL: '<from 1Password>',
          POWERPLATFORM_CLIENT_ID: '<from 1Password>',
          POWERPLATFORM_CLIENT_SECRET: '<from 1Password>',
          POWERPLATFORM_TENANT_ID: '<from 1Password>',
        },
        expect:
          'exit 1; stderr references mcp-audit-cli quarantine as the recovery path',
      },
    ],
    expectedOutcome:
      'All five subprocesses exit non-zero; capture stderr verbatim into output/scenario-1-refuse-to-start.txt for the demo summary.',
  },
  {
    name: '2-refuse-to-execute-no-engagement',
    description:
      'Spawn the server with valid lean config but do NOT call set-audit-engagement. Any audit-emitting tool call must reject.',
    steps: [
      {
        id: '2.1',
        label: 'Spawn server',
        action: 'use .mcp.json with MCP_AUDIT_LEVEL=lean and MCP_AUDIT_CLIENT=MCPTest',
      },
      {
        id: '2.2',
        label: 'Call query-records WITHOUT set-audit-engagement first',
        toolCall: {
          tool: 'query-records',
          args: { entityNamePlural: 'contacts', filterExpression: "firstname eq 'Maria'", topCount: 5 },
        },
        expect:
          'tool returns AuditEngagementUnsetError with message "Audit engagement not set. Call set-audit-engagement(workItemIds, reason) first ..."',
      },
    ],
    expectedOutcome: 'AuditEngagementUnsetError surfaces; nothing written to ./audit-out/.',
  },
  {
    name: '3-happy-path-lean',
    description:
      'Lean-level happy path: set engagement, fire 5 read tools, verify the chain, search for the records.',
    steps: [
      {
        id: '3.1',
        toolCall: {
          tool: 'set-audit-engagement',
          args: { workItemIds: ['MCPTEST-001'], reason: 'audit demo lean happy path' },
        },
      },
      { id: '3.2', toolCall: { tool: 'query-records', args: { entityNamePlural: 'contacts', filterExpression: "firstname eq 'Maria'", topCount: 5 } } },
      { id: '3.3', toolCall: { tool: 'get-record', args: { entityNamePlural: 'contacts', recordId: '<contact GUID returned by 3.2>' } } },
      { id: '3.4', toolCall: { tool: 'count-records', args: { entityNamePlural: 'contacts' } } },
      { id: '3.5', toolCall: { tool: 'get-entity-metadata', args: { entityName: 'contact' } } },
      { id: '3.6', toolCall: { tool: 'get-lookup-target', args: { entityName: 'contact', lookupAttributeName: 'parentcustomerid' } } },
    ],
    verify: [
      'mcp-audit-cli verify ./audit-out/MCPTest --quiet',
      'mcp-audit-cli search --base ./audit-out --client MCPTest --tool query-records --format table',
    ],
    expectedOutcome:
      '6 records emitted (1 set-audit-engagement + 5 reads). verify reports OK across the file. search returns the matching query-records row.',
  },
  {
    name: '4-happy-path-full',
    description:
      'Same as scenario 3 but at MCP_AUDIT_LEVEL=full. Each record must carry payload.input + payload.output (subject to PII redaction).',
    steps: [
      {
        id: '4.0',
        label: 'Stop the lean-mode server, restart with MCP_AUDIT_LEVEL=full (edit .mcp.json)',
      },
      {
        id: '4.1',
        toolCall: {
          tool: 'set-audit-engagement',
          args: { workItemIds: ['MCPTEST-001'], reason: 'audit demo full happy path' },
        },
      },
      { id: '4.2', toolCall: { tool: 'query-records', args: { entityNamePlural: 'contacts', filterExpression: "firstname eq 'Maria'", topCount: 5 } } },
      { id: '4.3', toolCall: { tool: 'get-record', args: { entityNamePlural: 'contacts', recordId: '<contact GUID>' } } },
      { id: '4.4', toolCall: { tool: 'count-records', args: { entityNamePlural: 'contacts' } } },
      { id: '4.5', toolCall: { tool: 'get-entity-metadata', args: { entityName: 'contact' } } },
      { id: '4.6', toolCall: { tool: 'get-lookup-target', args: { entityName: 'contact', lookupAttributeName: 'parentcustomerid' } } },
    ],
    verify: [
      'mcp-audit-cli verify ./audit-out/MCPTest --quiet',
      // Confirm payload populated (lean mode would have payload absent).
      "jq -c 'select(.tool.name==\"query-records\") | {seq, has_input: (.payload.input != null), has_output: (.payload.output != null)}' ./audit-out/MCPTest/$(date +%Y-%m).jsonl",
    ],
    expectedOutcome:
      'All 6 records have payload.input populated (PII-redacted). Read-tool records also have payload.output populated. verify reports OK.',
  },
  {
    name: '5-context-switch',
    description:
      'Two engagements in one session. set-audit-engagement records must carry contextChange.from/to; subsequent records anchor to the active engagement.',
    steps: [
      { id: '5.1', toolCall: { tool: 'set-audit-engagement', args: { workItemIds: ['MCPTEST-001'], reason: 'context switch — engagement A' } } },
      { id: '5.2', toolCall: { tool: 'query-records', args: { entityNamePlural: 'contacts', topCount: 1 } } },
      { id: '5.3', toolCall: { tool: 'count-records', args: { entityNamePlural: 'accounts' } } },
      { id: '5.4', toolCall: { tool: 'set-audit-engagement', args: { workItemIds: ['MCPTEST-002'], reason: 'context switch — engagement B' } } },
      { id: '5.5', toolCall: { tool: 'query-records', args: { entityNamePlural: 'accounts', topCount: 1 } } },
      { id: '5.6', toolCall: { tool: 'count-records', args: { entityNamePlural: 'contacts' } } },
    ],
    verify: [
      // Engagement-A records (3.x) must have engagement.workItemIds = ['MCPTEST-001'];
      // engagement-B records (5.x) must have engagement.workItemIds = ['MCPTEST-002'].
      "jq -c '{seq, tool: .tool.name, wi: .engagement.workItemIds, ctx: (.tool.contextChange // null | (.from // null | .workItemIds // null)) }' ./audit-out/MCPTest/$(date +%Y-%m).jsonl",
      'mcp-audit-cli verify ./audit-out/MCPTest --quiet',
    ],
    expectedOutcome:
      "Records 1-3 anchor to ['MCPTEST-001']. Record 4 (set-audit-engagement B) carries contextChange.from.workItemIds=['MCPTEST-001'] and contextChange.to.workItemIds=['MCPTEST-002']. Records 5-6 anchor to ['MCPTEST-002']. Chain verifies OK.",
  },
  {
    name: '6-quarantine-recovery',
    description:
      'Manually corrupt one record byte; verify reports BROKEN at the expected seq; quarantine writes a sentinel; verify reports OK on the new chain; the server restarts cleanly and continues writing.',
    steps: [
      {
        id: '6.1',
        label: 'Corrupt one byte in the JSONL file (e.g. flip a hex char in the prevHash of the third record)',
        action:
          'Use sed/awk/python to mutate exactly one character in line 3 of ./audit-out/MCPTest/$(date +%Y-%m).jsonl. Snapshot the file beforehand so the diff is reviewable.',
      },
      {
        id: '6.2',
        verify: 'mcp-audit-cli verify ./audit-out/MCPTest/$(date +%Y-%m).jsonl',
        expect:
          'exit 2; stderr "BROKEN  YYYY-MM.jsonl  prevHash mismatch (expected ..., got ...)  at line 3 (seq 3)"',
      },
      {
        id: '6.3',
        action:
          'mcp-audit-cli quarantine ./audit-out/MCPTest/$(date +%Y-%m).jsonl --reason "demo corruption — synthetic byte flip on line 3"',
        expect:
          'stdout reports the original file renamed to <name>.broken-<ts> and a fresh chain started with seq=1 sentinel.',
      },
      {
        id: '6.4',
        verify: 'mcp-audit-cli verify ./audit-out/MCPTest/$(date +%Y-%m).jsonl',
        expect: 'exit 0; reports OK with records=1 (the sentinel).',
      },
      {
        id: '6.5',
        label: 'Restart server and emit one fresh tool call to confirm the chain extends cleanly',
        toolCall: { tool: 'set-audit-engagement', args: { workItemIds: ['MCPTEST-001'], reason: 'post-quarantine smoke' } },
      },
      {
        id: '6.6',
        verify: 'mcp-audit-cli verify ./audit-out/MCPTest/$(date +%Y-%m).jsonl',
        expect: 'exit 0; reports OK with records=2 (sentinel + fresh set-audit-engagement).',
      },
    ],
    expectedOutcome:
      'Verify cleanly catches the corruption, quarantine renames the file + writes the sentinel, the new chain extends without complaint, and the .broken-<ts> file remains alongside for forensic review.',
  },
];
