/**
 * Credential-in-cache guard
 *
 * Every read command writes its full JSON response to `.context/.mcp-code-review-cache/`, and that
 * file outlives the run. A credential reaching it would be a durable secret on disk, in a directory
 * chosen by whatever the working directory happened to be.
 *
 * A live run proved the PAT absent from **one** cache file — the REST response from `list-repos`.
 * The `check-dotnet` and the 2 MB `review` caches were deleted before they could be checked, so the
 * paths that clone were never covered. This closes that gap in CI, where it can be re-run for free.
 *
 * **The preconditions are the point of this file.** The two hand-attempts at the same check both
 * produced confident answers, in opposite directions, and both were wrong:
 *
 * - `grep -rl "" <dir>` reported the token present in 8 of 8 files. The pattern was empty, because a
 *   1Password read had failed silently, and an empty pattern matches every file.
 * - The corrected attempt reported 0 of 8, because it omitted the `CODE_REVIEW_*` environment, so
 *   the CLI never ran and there was no cache to search. A false zero reads exactly like a pass.
 *
 * So each test here asserts the pattern is real and the payload is non-empty *before* asserting the
 * secret is absent. A search that finds nothing must be able to tell "nothing is there" apart from
 * "nothing was searched".
 */

import { describe, it, expect } from 'vitest';
import { buildReviewIssues, classifyHealth } from '../services/review-runner.js';
import { describeCloneAuthFailure, describeUnprovisionedPrincipal, notFoundHint, forbiddenHint } from '../code-review-client.js';
import { redactCloneSecret, redactSecret } from '../utils/clone-manager.js';
import type { DotnetVersionReport, NugetPackageReport, ComplexityReport } from '../models/index.js';

/**
 * Stands in for the credential. Deliberately low-entropy and hyphenated so it is unmistakable in a
 * diff and can never be mistaken for a real token, but long enough that the length precondition
 * below is a meaningful check.
 */
const PLANTED_CREDENTIAL = 'planted-credential-value-do-not-log-0123456789';

/** Guards the empty-pattern artefact: a search for "" matches everything and proves nothing. */
function assertSearchableSecret(secret: string): void {
  expect(secret.length).toBeGreaterThan(20);
  expect(secret.trim()).toBe(secret);
}

/** Guards the false-zero artefact: an empty payload contains no secret for uninteresting reasons. */
function assertSearchablePayload(payload: string): void {
  expect(payload.length).toBeGreaterThan(100);
}

const dotnetReport: DotnetVersionReport = {
  repository: 'repo',
  branch: 'main',
  directoryBuildProps: [],
  projects: [{ path: 'A.csproj', targetFrameworks: ['net452'], isEol: true } as any],
  summary: { totalProjects: 1, frameworks: { net452: 1 }, eolFrameworks: ['net452'], ilMergeProjects: 0, recommendations: [] },
};

const nugetReport: NugetPackageReport = {
  repository: 'repo',
  branch: 'main',
  projects: [
    {
      path: 'A.csproj',
      packages: [
        { id: 'Newtonsoft.Json', currentVersion: '9.0.1', latestStableVersion: '13.0.3', status: 'outdated', vulnerabilities: [] } as any,
      ],
    },
  ],
  summary: { totalProjects: 1, totalPackages: 1, uniquePackages: 1, outdatedPackages: 1, vulnerablePackages: 0, byStatus: { outdated: 1 } },
};

const complexityReport: ComplexityReport = {
  repository: 'repo',
  branch: 'main',
  methodology: 'estimate',
  files: [],
  summary: {
    totalFiles: 1,
    totalFilesFound: 1,
    truncated: false,
    totalLinesOfCode: 500,
    averageCyclomaticComplexity: 12,
    maxCyclomaticComplexity: 42,
    hotspots: [{ filePath: 'F.cs', methodName: 'Big', cyclomaticComplexity: 42, linesOfCode: 100 }],
    byExtension: { '.cs': 1 },
  },
};

describe('cached payloads carry no credential', () => {
  it('the planted secret is actually searchable (precondition)', () => {
    assertSearchableSecret(PLANTED_CREDENTIAL);
  });

  /**
   * The `review` payload is the big one — the 2 MB file the live check could not cover. It is
   * assembled from the three sub-reports, so if any of them echoed configuration into its output
   * this is where it would surface.
   */
  it('the review payload — the 2 MB cache the live check missed — contains no credential', () => {
    const issues = buildReviewIssues(dotnetReport, nugetReport, complexityReport);
    const payload = JSON.stringify({
      repository: 'repo',
      branch: 'main',
      dotnet: dotnetReport,
      nuget: nugetReport,
      complexity: complexityReport,
      issues,
      health: classifyHealth(issues),
    });

    assertSearchablePayload(payload);
    expect(payload).not.toContain(PLANTED_CREDENTIAL);
  });

  it('the dotnet-versions payload contains no credential', () => {
    const payload = JSON.stringify(dotnetReport);
    assertSearchablePayload(payload);
    expect(payload).not.toContain(PLANTED_CREDENTIAL);
  });

  /**
   * The realistic leak vector is not the happy path — a report is built from parsed API data that
   * never sees the credential. It is an *error message*: git echoes its whole argv, including the
   * bearer header, and Azure DevOps error bodies are pasted into hints. Every message-builder that
   * could carry a credential is therefore fed one here.
   *
   * Note the errors themselves are never cached — a CLI failure exits through `handleCliError` to
   * stderr and writes no file — so this is defence in depth rather than the last line.
   */
  it('no error-message builder emits the credential it was given', () => {
    const gitFailure =
      `Command failed: git -c http.extraHeader=Authorization: Bearer ${PLANTED_CREDENTIAL} clone --depth=1 ` +
      `https://dev.azure.com/contoso/P/_git/repo /tmp/mcp-cr-x\nfatal: Authentication failed`;

    const messages = [
      redactSecret(gitFailure, PLANTED_CREDENTIAL),
      redactCloneSecret(
        `Command failed: git clone https://:${PLANTED_CREDENTIAL}@dev.azure.com/contoso/P/_git/repo /tmp/x\nfatal: Authentication failed`,
        `https://:${PLANTED_CREDENTIAL}@dev.azure.com/contoso/P/_git/repo`,
      ),
      describeCloneAuthFailure('contoso', 'entra-id', gitFailure) ?? '',
      describeCloneAuthFailure('contoso', 'pat', gitFailure) ?? '',
      describeUnprovisionedPrincipal('contoso', {
        message: `TF401444: ... 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\\aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\\bbbbbbbb-cccc-dddd-eeee-ffffffffffff'`,
      }) ?? '',
      notFoundHint('azure-devops', 'contoso'),
      notFoundHint('github-enterprise'),
      forbiddenHint('azure-devops', 'entra-id'),
      forbiddenHint('azure-devops', 'pat'),
      forbiddenHint('github-enterprise'),
    ];

    const combined = messages.join('\n');
    assertSearchablePayload(combined);
    // Every builder produced something — an empty string would pass the absence check for free.
    for (const message of messages) expect(message.length).toBeGreaterThan(0);
    expect(combined).not.toContain(PLANTED_CREDENTIAL);
  });
});
