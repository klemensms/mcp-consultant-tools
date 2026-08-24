import { describe, it, expect } from 'vitest';
import { buildReviewIssues, classifyHealth } from '../review-runner.js';
import type { DotnetVersionReport, NugetPackageReport, ComplexityReport } from '../../models/index.js';

/** A fan-out where everything was read, so these fixtures exercise the findings only. */
const allRead = { attempted: 1, succeeded: 1, failed: 0, failures: [] };

const dotnet = (over: Partial<DotnetVersionReport['summary']> & { projects?: any[] } = {}): DotnetVersionReport => ({
  repository: 'r',
  branch: 'main',
  directoryBuildProps: [],
  projects: over.projects ?? [],
  fanOut: { directoryBuildProps: allRead, projects: allRead, sourceFiles: allRead },
  summary: {
    totalProjects: 0,
    frameworks: {},
    eolFrameworks: over.eolFrameworks ?? [],
    ilMergeProjects: 0,
    recommendations: [],
  },
});

const nuget = (packages: any[] = []): NugetPackageReport => ({
  repository: 'r',
  branch: 'main',
  projects: [{ path: 'A.csproj', packages }],
  fanOut: { centralPackageManagement: allRead, projects: allRead },
  summary: { totalProjects: 1, totalPackages: packages.length, uniquePackages: packages.length, outdatedPackages: 0, vulnerablePackages: 0, byStatus: {} },
});

const complexity = (maxComplexity: number): ComplexityReport => ({
  repository: 'r',
  branch: 'main',
  methodology: 'estimate',
  files: [],
  summary: {
    totalFiles: 0,
    totalFilesFound: 0,
    truncated: false,
    totalLinesOfCode: 0,
    averageCyclomaticComplexity: 0,
    maxCyclomaticComplexity: maxComplexity,
    hotspots: [{ filePath: 'F.cs', methodName: 'Big', cyclomaticComplexity: maxComplexity, linesOfCode: 100 }],
    byExtension: {},
  },
});

describe('buildReviewIssues', () => {
  it('raises a critical issue for each EOL framework', () => {
    const issues = buildReviewIssues(dotnet({ eolFrameworks: ['net452'] }), nuget(), undefined);
    expect(issues.some((i) => i.category === 'dotnet-version' && i.severity === 'critical')).toBe(true);
  });

  it('raises a critical issue for a vulnerable package', () => {
    const issues = buildReviewIssues(
      dotnet(),
      nuget([{ id: 'X', currentVersion: '1.0.0', status: 'vulnerable' }]),
      undefined,
    );
    expect(issues.some((i) => i.category === 'nuget-vulnerability' && i.severity === 'critical')).toBe(true);
  });

  it('raises a warning for a high-complexity hotspot (>20)', () => {
    const issues = buildReviewIssues(dotnet(), nuget(), complexity(25));
    expect(issues.some((i) => i.category === 'complexity' && i.severity === 'warning')).toBe(true);
  });

  it('does not flag a hotspot at or below the threshold', () => {
    const issues = buildReviewIssues(dotnet(), nuget(), complexity(20));
    expect(issues.some((i) => i.category === 'complexity')).toBe(false);
  });
});

describe('classifyHealth', () => {
  it('is critical when any critical issue exists', () => {
    expect(classifyHealth([{ severity: 'critical', category: 'complexity', message: '', recommendation: '' }])).toBe('critical');
  });
  it('is warnings when only warnings exist', () => {
    expect(classifyHealth([{ severity: 'warning', category: 'complexity', message: '', recommendation: '' }])).toBe('warnings');
  });
  it('is healthy when there are no issues', () => {
    expect(classifyHealth([])).toBe('healthy');
  });
});
