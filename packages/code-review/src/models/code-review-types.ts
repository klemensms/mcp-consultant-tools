// ===== .NET Version types =====

export interface DotnetVersionReport {
  repository: string;
  branch: string;
  globalJson?: GlobalJsonInfo;
  directoryBuildProps: DirectoryBuildPropsInfo[];
  projects: ProjectFrameworkInfo[];
  summary: {
    totalProjects: number;
    frameworks: Record<string, number>;
    eolFrameworks: string[];
    ilMergeProjects: number;
    recommendations: string[];
  };
}

export interface GlobalJsonInfo {
  path: string;
  sdkVersion: string;
  rollForward?: string;
}

export interface DirectoryBuildPropsInfo {
  path: string;
  targetFramework?: string;
  targetFrameworks?: string;
  properties: Record<string, string>;
}

export interface ProjectFrameworkInfo {
  path: string;
  targetFramework: string;
  targetFrameworks?: string[];
  isEol: boolean;
  eolDate?: string;
  usesCrmSdk?: boolean;
  isDataversePlugin?: boolean;
  usesILMerge?: boolean;
}

// ===== NuGet Package types =====

export interface NugetPackageReport {
  repository: string;
  branch: string;
  projects: ProjectPackageInfo[];
  summary: {
    totalProjects: number;
    totalPackages: number;
    uniquePackages: number;
    outdatedPackages: number;
    vulnerablePackages: number;
    byStatus: Record<string, number>;
  };
}

export interface ProjectPackageInfo {
  path: string;
  packages: PackageInfo[];
}

export interface PackageInfo {
  id: string;
  currentVersion: string;
  latestVersion?: string;
  latestStableVersion?: string;
  status: PackageStatus;
  versionsBehind?: number;
  vulnerabilities?: VulnerabilityInfo[];
  deprecation?: DeprecationInfo;
}

export type PackageStatus =
  | 'up-to-date'
  | 'minor-update'
  | 'major-update'
  | 'vulnerable'
  | 'deprecated'
  | 'unknown';

/**
 * A NuGet vulnerability advisory as exposed on the registration `catalogEntry.vulnerabilities`
 * array. The registration schema carries only `advisoryUrl` and `severity` (0-3) — the version
 * `range` field belongs to the separate bulk VulnerabilityInfo resource, not this one, so it is
 * deliberately absent (the ported source read a non-existent `range` field that was always empty).
 */
export interface VulnerabilityInfo {
  advisoryUrl: string;
  severity: string;
}

export interface DeprecationInfo {
  message: string;
  alternatePackageId?: string;
}

// ===== Complexity types =====

export interface ComplexityReport {
  repository: string;
  branch: string;
  /** Cyclomatic complexity here is a regex-based estimate, not an AST measurement — see note. */
  methodology: string;
  files: FileComplexityInfo[];
  summary: {
    totalFiles: number;
    totalFilesFound: number;
    truncated: boolean;
    totalLinesOfCode: number;
    averageCyclomaticComplexity: number;
    maxCyclomaticComplexity: number;
    hotspots: ComplexityHotspot[];
    byExtension: Record<string, { files: number; loc: number }>;
  };
}

export interface FileComplexityInfo {
  path: string;
  extension: string;
  linesOfCode: number;
  blankLines: number;
  commentLines: number;
  methods: MethodComplexityInfo[];
  averageMethodComplexity: number;
  maxMethodComplexity: number;
}

export interface MethodComplexityInfo {
  name: string;
  startLine: number;
  linesOfCode: number;
  cyclomaticComplexity: number;
  parameters: number;
}

export interface ComplexityHotspot {
  filePath: string;
  methodName: string;
  cyclomaticComplexity: number;
  linesOfCode: number;
}

// ===== Full Review types =====

export interface FullReviewReport {
  repository: string;
  branch: string;
  reviewDate: string;
  fileTree?: string[];
  totalFiles?: number;
  dotnetVersions?: DotnetVersionReport;
  nugetPackages?: NugetPackageReport;
  complexity?: ComplexityReport;
  overallHealth: 'healthy' | 'warnings' | 'critical';
  issues: ReviewIssue[];
}

export interface ReviewIssue {
  severity: 'info' | 'warning' | 'critical';
  category: 'dotnet-version' | 'nuget-vulnerability' | 'nuget-outdated' | 'complexity' | 'ilmerge';
  message: string;
  filePath?: string;
  recommendation: string;
}
