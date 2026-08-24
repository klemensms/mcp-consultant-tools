import type { FanOutInfo } from '@mcp-consultant-tools/core';

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
  /**
   * Files this scan could not read. Every count above is a floor when any of these is
   * non-zero: the report describes what parsed, and used to describe it as the repository.
   */
  fanOut: {
    /** `Directory.Build.props` files found by the glob. */
    directoryBuildProps: FanOutInfo;
    /** `.csproj` files found by the glob. */
    projects: FanOutInfo;
    /** `.cs` files read while deciding whether a CRM-SDK project is a Dataverse plugin. */
    sourceFiles: FanOutInfo;
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
  /**
   * True when a plugin indicator was found, false when the sources were read and none was,
   * and **null** when no source could be read - "not a plugin" and "could not tell" are
   * different answers, and this flag decides whether the ILMerge recommendation fires.
   */
  isDataversePlugin?: boolean | null;
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
  /**
   * Files this audit could not read. A project that would not parse used to be skipped, so
   * an audit of 8 of 10 projects and an audit of an 8-project repository were the same
   * document.
   */
  fanOut: {
    /** `Directory.Packages.props` files. A miss here silently loses CPM version resolution. */
    centralPackageManagement: FanOutInfo;
    /** `.csproj` files found by the glob. */
    projects: FanOutInfo;
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
  /**
   * `scan-incomplete` is not a finding about the code: it says part of the repository was
   * never read, so every other issue in the list is a floor rather than a total.
   */
  category:
    | 'dotnet-version'
    | 'nuget-vulnerability'
    | 'nuget-outdated'
    | 'complexity'
    | 'ilmerge'
    | 'scan-incomplete';
  message: string;
  filePath?: string;
  recommendation: string;
}
