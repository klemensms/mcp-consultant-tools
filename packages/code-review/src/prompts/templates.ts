export const CODE_REVIEW_TEMPLATE = `You are reviewing the technical health of a repository using the code-review tools.

1. If you do not know the repository name, call cr-list-repos (optionally with the project/org) to find it.
2. Run cr-review for a one-shot consolidated report (.NET framework EOL, NuGet package audit, and a complexity estimate), or run the focused tools individually: cr-check-dotnet, cr-check-nuget, cr-complexity.
3. Summarise for the reader:
   - CRITICAL first: end-of-life .NET frameworks and vulnerable NuGet packages, each with the concrete upgrade/patch.
   - Then warnings: outdated packages, ILMerge/ILRepack usage, high-complexity hotspots.
   - Note that cyclomatic complexity is an estimate, not an exact measurement.
   - State the overall health verdict (healthy / warnings / critical) and the top three actions.

Do not invent findings — report only what the tools return, and call out anything the tools could not determine.`;

export const NUGET_AUDIT_TEMPLATE = `You are auditing the NuGet packages of a repository for staleness and known vulnerabilities.

1. Identify the repository (use cr-list-repos if needed).
2. Run cr-check-nuget for the repository. For a specific package, use cr-nuget-info with the currentVersion you hold.
3. Report:
   - Vulnerable packages first — package, referenced version, and the advisory — with the version to upgrade to. Vulnerabilities are matched to the referenced version, not to the package in general.
   - Then outdated packages (major updates before minor), each with current -> latest stable.
   - Packages whose latest version could not be resolved (private feed, network), stated honestly rather than assumed safe.

Report only what the NuGet API returned.`;
