import { describe, it, expect } from 'vitest';
import {
  parseCsproj,
  parseDirectoryPackagesProps,
  parseGlobalJson,
  parsePackagesConfig,
  normalizeFrameworkVersion,
} from '../csproj-parser.js';

describe('parseCsproj', () => {
  it('reads an SDK-style TargetFramework and inline PackageReferences', () => {
    const xml = `<Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
      <ItemGroup>
        <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
        <PackageReference Include="Serilog" Version="4.0.0" />
      </ItemGroup>
    </Project>`;
    const data = parseCsproj(xml);
    expect(data.targetFramework).toBe('net8.0');
    expect(data.packageReferences).toEqual([
      { id: 'Newtonsoft.Json', version: '13.0.3' },
      { id: 'Serilog', version: '4.0.0' },
    ]);
  });

  it('splits multi-target TargetFrameworks', () => {
    const xml = `<Project><PropertyGroup><TargetFrameworks>net8.0;net48</TargetFrameworks></PropertyGroup></Project>`;
    expect(parseCsproj(xml).targetFrameworks).toEqual(['net8.0', 'net48']);
  });

  it('keeps a Central-Package-Management reference (no inline Version) with an empty version', () => {
    const xml = `<Project><ItemGroup><PackageReference Include="Polly" /></ItemGroup></Project>`;
    expect(parseCsproj(xml).packageReferences).toEqual([{ id: 'Polly', version: '' }]);
  });

  it('normalizes a legacy TargetFrameworkVersion to a moniker', () => {
    const xml = `<Project><PropertyGroup><TargetFrameworkVersion>v4.6.2</TargetFrameworkVersion></PropertyGroup></Project>`;
    expect(parseCsproj(xml).targetFramework).toBe('net462');
  });
});

describe('normalizeFrameworkVersion', () => {
  it('maps v4.8 -> net48 and v4.6.2 -> net462', () => {
    expect(normalizeFrameworkVersion('v4.8')).toBe('net48');
    expect(normalizeFrameworkVersion('v4.6.2')).toBe('net462');
  });
  it('returns undefined for junk', () => {
    expect(normalizeFrameworkVersion(undefined)).toBeUndefined();
    expect(normalizeFrameworkVersion('4')).toBeUndefined();
  });
});

describe('parseDirectoryPackagesProps (Central Package Management)', () => {
  it('reads PackageVersion pins with lowercased keys', () => {
    const xml = `<Project>
      <PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup>
      <ItemGroup><PackageVersion Include="Newtonsoft.Json" Version="13.0.3" /></ItemGroup>
    </Project>`;
    const data = parseDirectoryPackagesProps(xml);
    expect(data.centrallyManaged).toBe(true);
    expect(data.packageVersions.get('newtonsoft.json')).toBe('13.0.3');
  });
});

describe('parsePackagesConfig (legacy)', () => {
  it('reads id + version pairs', () => {
    const xml = `<packages><package id="Newtonsoft.Json" version="12.0.3" targetFramework="net472" /></packages>`;
    expect(parsePackagesConfig(xml)).toEqual([
      { id: 'Newtonsoft.Json', version: '12.0.3', targetFramework: 'net472' },
    ]);
  });
});

describe('parseGlobalJson', () => {
  it('reads the SDK version and rollForward', () => {
    const data = parseGlobalJson('{"sdk":{"version":"8.0.100","rollForward":"latestMinor"}}');
    expect(data.sdkVersion).toBe('8.0.100');
    expect(data.rollForward).toBe('latestMinor');
  });
});
