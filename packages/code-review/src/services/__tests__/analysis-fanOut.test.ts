/**
 * The five files `DotnetVersionService` and `NugetPackageService` skipped without recording.
 *
 * Both services glob a cloned repository and parse what they find. Every parse was wrapped
 * in a bare `catch {}`, so a file that would not parse was dropped and the report described
 * the remainder as if it were the repository. A NuGet audit that read 8 of 10 projects and
 * a NuGet audit of an 8-project repository were the same document.
 *
 * `detectDataversePlugin` is the sharpest case: it returns a boolean, and an unreadable
 * source tree returned `false` - so "not a plugin" and "could not tell" were the same
 * answer, on a flag that decides whether the ILMerge recommendation fires.
 *
 * Each test is a PAIR at the same project count.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DotnetVersionService } from '../dotnet-version-service.js';
import { NugetPackageService } from '../nuget-package-service.js';
import { buildReviewIssues, classifyHealth } from '../review-runner.js';
import type { DotnetVersionReport, NugetPackageReport } from '../../models/index.js';

const csproj = (framework: string, extra = '') => `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>${framework}</TargetFramework>
  </PropertyGroup>
${extra}
</Project>
`;

const packageRefs = `  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>`;

/** Well-formed XML that the parsers reject: a root element they do not understand. */
const UNPARSEABLE = '<<< this is not xml at all';

describe('DotnetVersionService.analyze', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'code-review-dotnet-'));
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('a report short by an unparseable project and a genuinely smaller repo are not equal', async () => {
    await writeFile(join(repo, 'Alpha.csproj'), csproj('net8.0'));
    await writeFile(join(repo, 'Beta.csproj'), csproj('net8.0'));
    const complete = await new DotnetVersionService().analyze(repo, 'Contoso.Repo', 'main');

    await writeFile(join(repo, 'Gamma.csproj'), UNPARSEABLE);
    const withDrop = await new DotnetVersionService().analyze(repo, 'Contoso.Repo', 'main');

    // Two projects described in both. The old report said nothing either way.
    expect(complete.summary.totalProjects).toBe(2);
    expect(withDrop.summary.totalProjects).toBe(2);

    expect(withDrop.fanOut.projects).not.toEqual(complete.fanOut.projects);
    expect(withDrop.fanOut.projects.attempted).toBe(3);
    expect(withDrop.fanOut.projects.failed).toBe(1);
    expect(withDrop.fanOut.projects.failures[0].item).toContain('Gamma.csproj');
    expect(complete.fanOut.projects.failed).toBe(0);
  });

  it('records an unparseable Directory.Build.props rather than ignoring it', async () => {
    await writeFile(join(repo, 'Alpha.csproj'), csproj('net8.0'));
    await writeFile(join(repo, 'Directory.Build.props'), UNPARSEABLE);

    const report = await new DotnetVersionService().analyze(repo, 'Contoso.Repo', 'main');

    expect(report.directoryBuildProps).toHaveLength(0);
    expect(report.fanOut.directoryBuildProps.attempted).toBe(1);
    expect(report.fanOut.directoryBuildProps.failed).toBe(1);
  });

  it('reports "could not tell" rather than "not a plugin" when no source could be read', async () => {
    const crmSdk = `  <ItemGroup>
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.51" />
  </ItemGroup>`;

    // A CRM-SDK project whose only .cs file is a broken symlink: the glob matches it
    // (it is not a directory) and the read then throws, which is what a permissions
    // failure or a missing LFS object looks like from here.
    await mkdir(join(repo, 'Plugin'), { recursive: true });
    await writeFile(join(repo, 'Plugin', 'Plugin.csproj'), csproj('net462', crmSdk));
    await symlink(join(repo, 'Plugin', 'nowhere.txt'), join(repo, 'Plugin', 'Handler.cs'));
    const unreadable = await new DotnetVersionService().analyze(repo, 'Contoso.Repo', 'main');

    await rm(join(repo, 'Plugin', 'Handler.cs'), { force: true });
    await writeFile(join(repo, 'Plugin', 'Handler.cs'), 'public class Handler { }');
    const readable = await new DotnetVersionService().analyze(repo, 'Contoso.Repo', 'main');

    // Neither project is a plugin as far as the indicators go. Only one of them was read.
    expect(readable.projects[0].isDataversePlugin).toBe(false);
    expect(unreadable.projects[0].isDataversePlugin).toBeNull();
    expect(unreadable.projects).not.toEqual(readable.projects);
    expect(unreadable.fanOut.sourceFiles.failed).toBeGreaterThan(0);
    expect(readable.fanOut.sourceFiles.failed).toBe(0);
  });
});

describe('NugetPackageService.analyze', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'code-review-nuget-'));
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  const analyze = (path: string) =>
    // `checkVulnerabilities: false` keeps the NuGet registry out of a unit test.
    new NugetPackageService().analyze(path, 'Contoso.Repo', 'main', false);

  it('an audit short by an unparseable project and a genuinely smaller repo are not equal', async () => {
    await writeFile(join(repo, 'Alpha.csproj'), csproj('net8.0', packageRefs));
    await writeFile(join(repo, 'Beta.csproj'), csproj('net8.0', packageRefs));
    const complete = await analyze(repo);

    await writeFile(join(repo, 'Gamma.csproj'), UNPARSEABLE);
    const withDrop = await analyze(repo);

    expect(complete.summary.totalProjects).toBe(2);
    expect(withDrop.summary.totalProjects).toBe(2);

    expect(withDrop.fanOut.projects).not.toEqual(complete.fanOut.projects);
    expect(withDrop.fanOut.projects.attempted).toBe(3);
    expect(withDrop.fanOut.projects.failed).toBe(1);
    expect(withDrop.fanOut.projects.failures[0].item).toContain('Gamma.csproj');
    expect(complete.fanOut.projects.failed).toBe(0);
  });

  it('records an unparseable central-package-management file rather than ignoring it', async () => {
    await writeFile(join(repo, 'Alpha.csproj'), csproj('net8.0', packageRefs));
    await writeFile(join(repo, 'Directory.Packages.props'), UNPARSEABLE);

    const report = await analyze(repo);

    expect(report.fanOut.centralPackageManagement.attempted).toBe(1);
    expect(report.fanOut.centralPackageManagement.failed).toBe(1);
    expect(report.fanOut.centralPackageManagement.failures[0].item).toContain(
      'Directory.Packages.props'
    );
  });
});

describe('cr-review health verdict', () => {
  const noFailures = { attempted: 2, succeeded: 2, failed: 0, failures: [] };
  const oneFailure = {
    attempted: 3,
    succeeded: 2,
    failed: 1,
    failures: [
      {
        item: 'Gamma.csproj',
        operation: 'parse csproj',
        reason: 'Failed to parse project file',
        statusCode: null,
      },
    ],
  };

  const dotnet = (projects: typeof noFailures): DotnetVersionReport => ({
    repository: 'Contoso.Repo',
    branch: 'main',
    directoryBuildProps: [],
    projects: [],
    fanOut: { directoryBuildProps: noFailures, projects, sourceFiles: noFailures },
    summary: {
      totalProjects: 2,
      frameworks: { 'net8.0': 2 },
      eolFrameworks: [],
      ilMergeProjects: 0,
      recommendations: [],
    },
  });

  const nuget: NugetPackageReport = {
    repository: 'Contoso.Repo',
    branch: 'main',
    projects: [],
    fanOut: { centralPackageManagement: noFailures, projects: noFailures },
    summary: {
      totalProjects: 2,
      totalPackages: 0,
      uniquePackages: 0,
      outdatedPackages: 0,
      vulnerablePackages: 0,
      byStatus: {},
    },
  };

  it('does not call a repository healthy when part of it could not be read', () => {
    const clean = buildReviewIssues(dotnet(noFailures), nuget, undefined);
    const incomplete = buildReviewIssues(dotnet(oneFailure), nuget, undefined);

    // No EOL frameworks, no vulnerable packages, no hotspots in either.
    expect(classifyHealth(clean)).toBe('healthy');
    expect(classifyHealth(incomplete)).toBe('warnings');

    expect(incomplete).not.toEqual(clean);
    const flagged = incomplete.find((i) => i.category === 'scan-incomplete');
    expect(flagged?.message).toContain('Gamma.csproj');
  });
});
