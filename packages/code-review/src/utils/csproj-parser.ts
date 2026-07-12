import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) =>
    name === 'PackageReference' ||
    name === 'PackageVersion' ||
    name === 'GlobalPackageReference' ||
    name === 'PropertyGroup' ||
    name === 'ItemGroup' ||
    name === 'package',
});

export interface CsprojData {
  targetFramework?: string;
  targetFrameworks?: string[];
  packageReferences: PackageReference[];
  properties: Record<string, string>;
}

export interface PackageReference {
  id: string;
  /** Inline version. Empty string when the project relies on Central Package Management. */
  version: string;
}

export function parseCsproj(xml: string): CsprojData {
  const result = parser.parse(xml);
  const project = result.Project ?? result.project ?? {};

  const propertyGroups: Record<string, unknown>[] = project.PropertyGroup ?? [];
  const itemGroups: Record<string, unknown>[] = project.ItemGroup ?? [];

  // Extract properties
  const properties: Record<string, string> = {};
  for (const pg of propertyGroups) {
    for (const [key, value] of Object.entries(pg)) {
      if (typeof value === 'string' || typeof value === 'number') {
        properties[key] = String(value);
      }
    }
  }

  // Extract target framework (SDK-style or legacy TargetFrameworkVersion)
  const targetFramework = properties.TargetFramework ?? normalizeFrameworkVersion(properties.TargetFrameworkVersion);
  let targetFrameworks: string[] | undefined;
  if (properties.TargetFrameworks) {
    targetFrameworks = properties.TargetFrameworks.split(';').map((f) => f.trim()).filter(Boolean);
  }

  // Extract package references. Refs without a Version are kept with version=''
  // so callers can resolve them via Central Package Management
  // (Directory.Packages.props) — see parseDirectoryPackagesProps.
  const packageReferences: PackageReference[] = [];
  for (const ig of itemGroups) {
    const refs = ig.PackageReference as Array<Record<string, unknown>> | undefined;
    if (!refs) continue;
    for (const ref of refs) {
      const id = (ref['@_Include'] ?? ref['@_Update'] ?? '') as string;
      const version = (ref['@_Version'] ?? ref.Version ?? '') as string;
      if (id) {
        packageReferences.push({ id: String(id), version: String(version) });
      }
    }
  }

  return { targetFramework, targetFrameworks, packageReferences, properties };
}

export interface DirectoryPackagesPropsData {
  /** True when ManagePackageVersionsCentrally evaluates to true. */
  centrallyManaged: boolean;
  /** Map of package id (case-insensitive — keys are lowercased) to pinned version. */
  packageVersions: Map<string, string>;
}

/**
 * Parse a Directory.Packages.props file (NuGet Central Package Management).
 *
 * Reads `<PackageVersion Include="X" Version="Y" />` and `<GlobalPackageReference>`
 * items, plus the `ManagePackageVersionsCentrally` property.
 */
export function parseDirectoryPackagesProps(xml: string): DirectoryPackagesPropsData {
  const result = parser.parse(xml);
  const project = result.Project ?? result.project ?? {};

  const propertyGroups: Record<string, unknown>[] = project.PropertyGroup ?? [];
  const itemGroups: Record<string, unknown>[] = project.ItemGroup ?? [];

  let centrallyManaged = false;
  for (const pg of propertyGroups) {
    const flag = pg.ManagePackageVersionsCentrally;
    if (flag !== undefined && String(flag).toLowerCase() === 'true') {
      centrallyManaged = true;
    }
  }

  const packageVersions = new Map<string, string>();
  for (const ig of itemGroups) {
    const groups = [
      ig.PackageVersion as Array<Record<string, unknown>> | undefined,
      ig.GlobalPackageReference as Array<Record<string, unknown>> | undefined,
    ];
    for (const refs of groups) {
      if (!refs) continue;
      for (const ref of refs) {
        const id = (ref['@_Include'] ?? ref['@_Update'] ?? '') as string;
        const version = (ref['@_Version'] ?? ref.Version ?? '') as string;
        if (id && version) {
          packageVersions.set(String(id).toLowerCase(), String(version));
        }
      }
    }
  }

  return { centrallyManaged, packageVersions };
}

export interface GlobalJsonData {
  sdkVersion: string;
  rollForward?: string;
}

export function parseGlobalJson(content: string): GlobalJsonData {
  const data = JSON.parse(content);
  return {
    sdkVersion: data.sdk?.version ?? '',
    rollForward: data.sdk?.rollForward,
  };
}

export interface DirectoryBuildPropsData {
  targetFramework?: string;
  targetFrameworks?: string;
  properties: Record<string, string>;
}

export function parseDirectoryBuildProps(xml: string): DirectoryBuildPropsData {
  const csprojData = parseCsproj(xml);
  return {
    targetFramework: csprojData.targetFramework,
    targetFrameworks: csprojData.properties.TargetFrameworks,
    properties: csprojData.properties,
  };
}

/**
 * Normalize legacy .NET Framework TargetFrameworkVersion (e.g., "v4.6.2")
 * to modern TFM moniker (e.g., "net462").
 */
export function normalizeFrameworkVersion(version: string | undefined): string | undefined {
  if (!version) return undefined;

  const cleaned = version.replace(/^v/i, '');
  const parts = cleaned.split('.');
  if (parts.length < 2) return undefined;

  const major = parts[0];
  const minor = parts[1];
  const patch = parts[2];

  let moniker = `net${major}${minor}`;
  if (patch && patch !== '0') {
    moniker += patch;
  }

  return moniker;
}

export interface PackagesConfigEntry {
  id: string;
  version: string;
  targetFramework?: string;
}

/**
 * Parse a packages.config XML file (legacy NuGet package format).
 */
export function parsePackagesConfig(xml: string): PackagesConfigEntry[] {
  const result = parser.parse(xml);
  const packages = result.packages?.package;

  if (!packages) return [];

  const entries = Array.isArray(packages) ? packages : [packages];

  return entries
    .map((pkg: Record<string, unknown>) => ({
      id: (pkg['@_id'] ?? '') as string,
      version: (pkg['@_version'] ?? '') as string,
      targetFramework: (pkg['@_targetFramework'] as string) || undefined,
    }))
    .filter((e: PackagesConfigEntry) => e.id && e.version);
}
