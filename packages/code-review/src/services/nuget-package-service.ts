import { FanOutRecorder } from '@mcp-consultant-tools/core';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import * as semver from 'semver';
import {
  parseCsproj,
  parseDirectoryPackagesProps,
  parsePackagesConfig,
} from '../utils/csproj-parser.js';
import {
  isPrerelease,
  leavesFromPage,
  pickLatest,
  type NugetLeaf,
} from '../utils/nuget-registration.js';
import type {
  NugetPackageReport,
  ProjectPackageInfo,
  PackageInfo,
  PackageStatus,
  VulnerabilityInfo,
} from '../models/index.js';

/** Fetch a JSON document. Injected so registration parsing is testable without a live NuGet feed. */
export type FetchJson = (url: string) => Promise<any>;

const NUGET_SERVICE_INDEX = 'https://api.nuget.org/v3/index.json';
const MAX_CONCURRENT = 5;

export interface NugetVersionData {
  latestVersion: string;
  latestStableVersion: string;
  vulnerabilities: VulnerabilityInfo[];
}

/**
 * Decide a package's status. Exported for direct testing — it is where "vulnerable" must win over
 * freshness and where a non-comparable version must fall back to "unknown" rather than lie.
 */
export function determinePackageStatus(pkg: PackageInfo): PackageStatus {
  if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
    return 'vulnerable';
  }
  if (!pkg.latestStableVersion || !pkg.currentVersion) {
    return 'unknown';
  }

  const current = semver.coerce(pkg.currentVersion);
  const latest = semver.coerce(pkg.latestStableVersion);
  if (!current || !latest) {
    return 'unknown';
  }
  if (semver.gte(current, latest)) {
    return 'up-to-date';
  }

  const majorDiff = semver.major(latest) - semver.major(current);
  pkg.versionsBehind = majorDiff;
  return majorDiff >= 1 ? 'major-update' : 'minor-update';
}

export class NugetPackageService {
  private registrationBase: string | null = null;

  constructor(private readonly fetchJson: FetchJson) {}

  /**
   * Resolve the registration base URL from the NuGet service index — the docs are explicit that
   * this must be discovered, not hardcoded, because the base can change. Prefer the gzip + SemVer2
   * variant (3.6.0), falling back to older variants. Cached for the life of the service.
   */
  async getRegistrationBase(): Promise<string> {
    if (this.registrationBase) return this.registrationBase;

    const index = await this.fetchJson(NUGET_SERVICE_INDEX);
    const resources: Array<{ '@id'?: string; '@type'?: string }> = index?.resources ?? [];
    const byType = (t: string) => resources.find((r) => r['@type'] === t)?.['@id'];
    const base =
      byType('RegistrationsBaseUrl/3.6.0') ||
      byType('RegistrationsBaseUrl/3.4.0') ||
      byType('RegistrationsBaseUrl');
    if (!base) {
      throw new Error('NuGet service index did not advertise a RegistrationsBaseUrl resource');
    }
    this.registrationBase = base.replace(/\/$/, '');
    return this.registrationBase;
  }

  /**
   * Fetch latest/stable versions and any vulnerabilities affecting `currentVersion` for one package.
   * Latest/stable come from the last registration page; when that page is non-inlined (128+ total
   * versions, i.e. every popular package) its `@id` is followed so the data is not silently blank.
   */
  async fetchPackageData(packageId: string, currentVersion?: string): Promise<NugetVersionData> {
    const empty: NugetVersionData = { latestVersion: '', latestStableVersion: '', vulnerabilities: [] };

    const base = await this.getRegistrationBase();
    const indexUrl = `${base}/${packageId.toLowerCase()}/index.json`;

    let regIndex: any;
    try {
      regIndex = await this.fetchJson(indexUrl);
    } catch {
      // 404 = package is not on nuget.org (private/internal feed). Not an error for the caller.
      return empty;
    }

    const pages: any[] = regIndex?.items ?? [];
    if (pages.length === 0) return empty;

    // Latest/stable from the last (highest) page — inlined or fetched by @id.
    const lastLeaves = await this.leavesOf(pages[pages.length - 1]);
    const { latestVersion, latestStableVersion } = pickLatest(lastLeaves.map((l) => l.version));

    let vulnerabilities: VulnerabilityInfo[] = [];
    if (currentVersion) {
      const leaf = await this.findVersionLeaf(pages, currentVersion);
      vulnerabilities = leaf?.vulnerabilities ?? [];
    }

    return { latestVersion, latestStableVersion, vulnerabilities };
  }

  /** Leaves of a registration page — following the page `@id` when the page is not inlined. */
  private async leavesOf(page: any): Promise<NugetLeaf[]> {
    const inline = leavesFromPage(page);
    if (inline.length > 0) return inline;
    const pageId: string | undefined = page?.['@id'];
    if (!pageId) return [];
    try {
      return leavesFromPage(await this.fetchJson(pageId));
    } catch {
      return [];
    }
  }

  /** Find the registration leaf for a specific version, scanning only pages whose bounds contain it. */
  private async findVersionLeaf(pages: any[], version: string): Promise<NugetLeaf | undefined> {
    for (const page of pages) {
      if (!versionInPageRange(version, page)) continue;
      const leaves = await this.leavesOf(page);
      const leaf = leaves.find((l) => versionsEqual(l.version, version));
      if (leaf) return leaf;
    }
    return undefined;
  }

  async analyze(
    localPath: string,
    repository: string,
    branch: string,
    checkVulnerabilities: boolean = true,
  ): Promise<NugetPackageReport> {
    const csprojFiles = await glob('**/*.csproj', { cwd: localPath, nodir: true });
    const projects: ProjectPackageInfo[] = [];
    const allPackageIds = new Set<string>();

    // Both globs used to swallow a parse failure, so an audit of 8 of 10 projects and an
    // audit of an 8-project repository were the same document.
    const cpmReads = new FanOutRecorder();
    const projectReads = new FanOutRecorder();

    // Central Package Management: each Directory.Packages.props applies to every csproj at or below
    // its directory, so resolve by walking up the project's directory tree (MSBuild import semantics).
    const cpmFiles = await glob('**/Directory.Packages.props', {
      cwd: localPath,
      nodir: true,
      nocase: true,
    });
    const cpmByDir = new Map<string, Map<string, string>>();
    for (const cpmFile of cpmFiles) {
      await cpmReads.run(cpmFile, 'parse Directory.Packages.props', async () => {
        const content = await readFile(`${localPath}/${cpmFile}`, 'utf-8');
        const data = parseDirectoryPackagesProps(content);
        if (data.packageVersions.size === 0) return null;
        const dir = cpmFile.includes('/') ? cpmFile.substring(0, cpmFile.lastIndexOf('/')) : '';
        cpmByDir.set(dir, data.packageVersions);
        return dir;
      });
    }

    const resolveCpmVersion = (csprojPath: string, packageId: string): string | undefined => {
      if (cpmByDir.size === 0) return undefined;
      const id = packageId.toLowerCase();
      let dir = csprojPath.includes('/') ? csprojPath.substring(0, csprojPath.lastIndexOf('/')) : '';
      while (true) {
        const versions = cpmByDir.get(dir);
        if (versions) {
          const version = versions.get(id);
          if (version) return version;
        }
        if (dir === '') break;
        const slash = dir.lastIndexOf('/');
        dir = slash === -1 ? '' : dir.substring(0, slash);
      }
      return undefined;
    };

    for (const file of csprojFiles) {
      await projectReads.run(file, 'parse csproj', async () => {
        const content = await readFile(`${localPath}/${file}`, 'utf-8');
        const csproj = parseCsproj(content);

        let packages: PackageInfo[];
        if (csproj.packageReferences.length > 0) {
          packages = csproj.packageReferences.map((ref) => {
            allPackageIds.add(ref.id.toLowerCase());
            const resolved = ref.version || resolveCpmVersion(file, ref.id) || '';
            return { id: ref.id, currentVersion: resolved, status: 'unknown' as PackageStatus };
          });
        } else {
          const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : '';
          const configPath = dir ? `${dir}/packages.config` : 'packages.config';
          try {
            const configContent = await readFile(`${localPath}/${configPath}`, 'utf-8');
            const entries = parsePackagesConfig(configContent);
            packages = entries.map((entry) => {
              allPackageIds.add(entry.id.toLowerCase());
              return { id: entry.id, currentVersion: entry.version, status: 'unknown' as PackageStatus };
            });
          } catch {
            packages = [];
          }
        }

        if (packages.length === 0) return null;
        projects.push({ path: file, packages });
        return file;
      });
    }

    if (checkVulnerabilities) {
      // Fetch per (id, currentVersion) so vulnerabilities are matched to the referenced version.
      const allPackages = projects.flatMap((p) => p.packages);
      for (let i = 0; i < allPackages.length; i += MAX_CONCURRENT) {
        const batch = allPackages.slice(i, i + MAX_CONCURRENT);
        await Promise.all(
          batch.map(async (pkg) => {
            try {
              const data = await this.fetchPackageData(pkg.id, pkg.currentVersion || undefined);
              pkg.latestVersion = data.latestVersion;
              pkg.latestStableVersion = data.latestStableVersion;
              pkg.vulnerabilities = data.vulnerabilities;
              pkg.status = determinePackageStatus(pkg);
            } catch {
              // Leave status 'unknown' if the lookup fails.
            }
          }),
        );
      }
    }

    const allPackages = projects.flatMap((p) => p.packages);
    const statusCounts: Record<string, number> = {};
    for (const pkg of allPackages) {
      statusCounts[pkg.status] = (statusCounts[pkg.status] ?? 0) + 1;
    }

    return {
      repository,
      branch,
      projects,
      fanOut: {
        centralPackageManagement: cpmReads.result(),
        projects: projectReads.result(),
      },
      summary: {
        totalProjects: projects.length,
        totalPackages: allPackages.length,
        uniquePackages: allPackageIds.size,
        outdatedPackages: allPackages.filter((p) => p.status === 'major-update' || p.status === 'minor-update').length,
        vulnerablePackages: allPackages.filter((p) => p.status === 'vulnerable').length,
        byStatus: statusCounts,
      },
    };
  }

  async getPackageInfo(packageId: string, currentVersion?: string): Promise<PackageInfo> {
    const data = await this.fetchPackageData(packageId, currentVersion);
    const pkg: PackageInfo = {
      id: packageId,
      currentVersion: currentVersion ?? '',
      latestVersion: data.latestVersion,
      latestStableVersion: data.latestStableVersion,
      vulnerabilities: data.vulnerabilities,
      status: 'unknown',
    };
    if (currentVersion) {
      pkg.status = determinePackageStatus(pkg);
    }
    return pkg;
  }
}

/** True when `version` falls within a registration page's [lower, upper] bounds (coerced compare). */
function versionInPageRange(version: string, page: any): boolean {
  const lower = page?.lower;
  const upper = page?.upper;
  if (!lower || !upper) return true; // no bounds → cannot exclude, scan it
  const v = semver.coerce(version);
  const lo = semver.coerce(lower);
  const hi = semver.coerce(upper);
  if (!v || !lo || !hi) return true;
  return semver.gte(v, lo) && semver.lte(v, hi);
}

/** Version equality tolerant of casing and non-normalized forms (e.g. 1.0 vs 1.0.0). */
function versionsEqual(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  if (isPrerelease(a) || isPrerelease(b)) return false;
  const ca = semver.coerce(a);
  const cb = semver.coerce(b);
  return !!ca && !!cb && semver.eq(ca, cb);
}
