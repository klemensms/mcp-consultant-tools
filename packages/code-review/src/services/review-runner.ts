import { glob } from 'glob';
import type { ServiceContext } from '../types.js';
import type {
  DotnetVersionReport,
  NugetPackageReport,
  ComplexityReport,
  FullReviewReport,
  ReviewIssue,
} from '../models/index.js';

const HIGH_COMPLEXITY_THRESHOLD = 20;

/** Build the consolidated issue list from the three analyzer reports. Pure — directly testable. */
export function buildReviewIssues(
  dotnet: DotnetVersionReport,
  nuget: NugetPackageReport,
  complexity: ComplexityReport | undefined,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  for (const fw of dotnet.summary.eolFrameworks) {
    issues.push({
      severity: 'critical',
      category: 'dotnet-version',
      message: `End-of-life .NET framework: ${fw}`,
      recommendation: dotnet.summary.recommendations[0] ?? 'Upgrade to a supported .NET LTS',
    });
  }

  for (const proj of dotnet.projects.filter((p) => p.usesILMerge)) {
    issues.push({
      severity: 'warning',
      category: 'ilmerge',
      message: `ILMerge/ILRepack detected in ${proj.path}`,
      filePath: proj.path,
      recommendation: proj.isDataversePlugin
        ? 'Migrate from ILMerge to dependent assembly plugins (NuGet package format)'
        : 'Remove ILMerge/ILRepack and use standard project references or NuGet packages instead',
    });
  }

  for (const project of nuget.projects) {
    for (const pkg of project.packages) {
      if (pkg.status === 'vulnerable') {
        issues.push({
          severity: 'critical',
          category: 'nuget-vulnerability',
          message: `Vulnerable package: ${pkg.id} ${pkg.currentVersion}`,
          filePath: project.path,
          recommendation: `Update ${pkg.id} to ${pkg.latestStableVersion ?? 'latest'}`,
        });
      } else if (pkg.status === 'major-update') {
        issues.push({
          severity: 'warning',
          category: 'nuget-outdated',
          message: `Outdated package: ${pkg.id} ${pkg.currentVersion} (latest: ${pkg.latestStableVersion})`,
          filePath: project.path,
          recommendation: `Update ${pkg.id} to ${pkg.latestStableVersion ?? 'latest'}`,
        });
      }
    }
  }

  if (complexity) {
    for (const h of complexity.summary.hotspots) {
      if (h.cyclomaticComplexity > HIGH_COMPLEXITY_THRESHOLD) {
        issues.push({
          severity: 'warning',
          category: 'complexity',
          message: `High complexity method (estimated): ${h.methodName} (${h.cyclomaticComplexity})`,
          filePath: h.filePath,
          recommendation: `Consider refactoring to reduce cyclomatic complexity below ${HIGH_COMPLEXITY_THRESHOLD}`,
        });
      }
    }
  }

  return issues;
}

export function classifyHealth(issues: ReviewIssue[]): 'healthy' | 'warnings' | 'critical' {
  if (issues.some((i) => i.severity === 'critical')) return 'critical';
  if (issues.some((i) => i.severity === 'warning')) return 'warnings';
  return 'healthy';
}

/**
 * Clone once and run every analyzer over the same working tree, returning a consolidated report.
 * Shared by the cr-review MCP tool and the CLI `review` command so the logic lives in one place.
 */
export async function runFullReview(
  ctx: ServiceContext,
  project: string,
  repository: string,
  branch: string | undefined,
  opts?: { includeComplexity?: boolean; maxFiles?: number; includeTree?: boolean },
): Promise<FullReviewReport> {
  const includeComplexity = opts?.includeComplexity ?? true;
  const branchLabel = branch ?? 'default';

  return ctx.repositories.cloneAndAnalyze(project, repository, branch, async (localPath) => {
    const [dotnetVersions, nugetPackages, complexity, fileTree] = await Promise.all([
      ctx.dotnetVersions.analyze(localPath, repository, branchLabel),
      ctx.nugetPackages.analyze(localPath, repository, branchLabel),
      includeComplexity
        ? ctx.complexity.analyze(localPath, repository, branchLabel, { maxFiles: opts?.maxFiles })
        : Promise.resolve(undefined),
      opts?.includeTree
        ? glob('**/*', { cwd: localPath, nodir: true, dot: true, ignore: ['.git/**'] }).then((f) => f.sort())
        : Promise.resolve(undefined),
    ]);

    const issues = buildReviewIssues(dotnetVersions, nugetPackages, complexity);

    return {
      repository,
      branch: branchLabel,
      reviewDate: new Date().toISOString(),
      fileTree,
      totalFiles: fileTree?.length,
      dotnetVersions,
      nugetPackages,
      complexity,
      overallHealth: classifyHealth(issues),
      issues,
    };
  });
}
