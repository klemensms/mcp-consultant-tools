/**
 * .NET / .NET Framework support data.
 *
 * Sources (verified 2026-07):
 *   https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-and-net-core
 *   https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-framework
 *   https://raw.githubusercontent.com/dotnet/core/main/releases.md
 *
 * The table holds dates only. `isEol` is COMPUTED from `eolDate` versus the current date, so a
 * framework's end-of-life status is never stale — the moment its published EOL date passes, it is
 * reported EOL without anyone editing this file. (The ported source baked `isEol` in as a static
 * boolean and had several dates wrong, so it reported frameworks EOL for years as still supported.)
 *
 * `eolDate` undefined = no fixed end-of-life date. For .NET Framework 4.7.x/4.8/4.8.1 the support
 * lifecycle is tied to the host OS, so there is no framework-level EOL date to compare against.
 */
export interface DotnetVersionInfo {
  moniker: string;
  releaseDate: string;
  /** ISO date (YYYY-MM-DD). Undefined means no fixed EOL (OS-tied or not yet announced). */
  eolDate?: string;
  isLts: boolean;
}

const EOL_DATA: DotnetVersionInfo[] = [
  // Modern .NET
  { moniker: 'net5.0', releaseDate: '2020-11-10', eolDate: '2022-05-10', isLts: false },
  { moniker: 'net6.0', releaseDate: '2021-11-08', eolDate: '2024-11-12', isLts: true },
  { moniker: 'net7.0', releaseDate: '2022-11-08', eolDate: '2024-05-14', isLts: false },
  { moniker: 'net8.0', releaseDate: '2023-11-14', eolDate: '2026-11-10', isLts: true },
  { moniker: 'net9.0', releaseDate: '2024-11-12', eolDate: '2026-11-10', isLts: false },
  { moniker: 'net10.0', releaseDate: '2025-11-11', eolDate: '2028-11-14', isLts: true },
  // .NET Core (legacy)
  { moniker: 'netcoreapp3.1', releaseDate: '2019-12-03', eolDate: '2022-12-13', isLts: true },
  { moniker: 'netcoreapp3.0', releaseDate: '2019-09-23', eolDate: '2020-03-03', isLts: false },
  { moniker: 'netcoreapp2.1', releaseDate: '2018-05-30', eolDate: '2021-08-21', isLts: true },
  // .NET Framework — 4.5.2/4.6/4.6.1 retired 2022-04-26 (SHA-1 deprecation); 4.6.2 supported to 2027-01-12;
  // 4.7.x/4.8/4.8.1 are OS-lifecycle-bound (no fixed framework EOL).
  { moniker: 'net481', releaseDate: '2021-08-09', isLts: false },
  { moniker: 'net48', releaseDate: '2019-04-18', isLts: false },
  { moniker: 'net472', releaseDate: '2018-04-30', isLts: false },
  { moniker: 'net471', releaseDate: '2017-10-17', isLts: false },
  { moniker: 'net47', releaseDate: '2017-04-05', isLts: false },
  { moniker: 'net462', releaseDate: '2016-08-02', eolDate: '2027-01-12', isLts: false },
  { moniker: 'net461', releaseDate: '2016-01-27', eolDate: '2022-04-26', isLts: false },
  { moniker: 'net46', releaseDate: '2015-07-20', eolDate: '2022-04-26', isLts: false },
  { moniker: 'net452', releaseDate: '2014-05-05', eolDate: '2022-04-26', isLts: false },
];

const lookupMap = new Map<string, DotnetVersionInfo>();
for (const info of EOL_DATA) {
  lookupMap.set(info.moniker, info);
}

export function getDotnetVersionInfo(moniker: string): DotnetVersionInfo | undefined {
  // Normalize: strip a leading 'v', lowercase, handle netXX vs netX.X patterns.
  const normalized = moniker.toLowerCase().replace(/^v/, '');
  return lookupMap.get(normalized);
}

/**
 * A framework is end-of-life when it has a published EOL date that is on or before `now`.
 * No fixed EOL date (OS-tied) or an unknown moniker → not flagged.
 */
export function isEolFramework(moniker: string, now: Date = new Date()): boolean {
  const info = getDotnetVersionInfo(moniker);
  if (!info?.eolDate) return false;
  return new Date(`${info.eolDate}T00:00:00Z`).getTime() <= now.getTime();
}

export function getEolDate(moniker: string): string | undefined {
  return getDotnetVersionInfo(moniker)?.eolDate;
}

export function getRecommendedFramework(): string {
  return 'net8.0';
}
