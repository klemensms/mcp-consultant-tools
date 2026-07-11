import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { parseCsproj, parseGlobalJson, parseDirectoryBuildProps } from '../utils/csproj-parser.js';
import { isEolFramework, getEolDate, getRecommendedFramework } from '../utils/dotnet-eol-data.js';
import type {
  DotnetVersionReport,
  GlobalJsonInfo,
  DirectoryBuildPropsInfo,
  ProjectFrameworkInfo,
} from '../models/index.js';

export class DotnetVersionService {
  async analyze(localPath: string, repository: string, branch: string): Promise<DotnetVersionReport> {
    const globalJson = await this.parseGlobalJson(localPath);
    const directoryBuildProps = await this.parseDirectoryBuildProps(localPath);
    const projects = await this.parseProjects(localPath);

    const frameworkCounts: Record<string, number> = {};
    const eolFrameworks = new Set<string>();

    for (const project of projects) {
      const frameworks = project.targetFrameworks ?? [project.targetFramework];
      for (const fw of frameworks) {
        frameworkCounts[fw] = (frameworkCounts[fw] ?? 0) + 1;
        if (project.isEol) {
          eolFrameworks.add(fw);
        }
      }
    }

    const ilMergeProjects = projects.filter((p) => p.usesILMerge).length;

    const recommendations: string[] = [];
    if (eolFrameworks.size > 0) {
      recommendations.push(
        `Upgrade ${eolFrameworks.size} EOL framework(s) to ${getRecommendedFramework()}: ${[...eolFrameworks].join(', ')}`,
      );
    }
    if (globalJson && !globalJson.sdkVersion.startsWith('8.')) {
      recommendations.push(
        `Consider updating global.json SDK version from ${globalJson.sdkVersion} to the latest supported .NET LTS SDK`,
      );
    }
    if (ilMergeProjects > 0) {
      const ilMergePluginCount = projects.filter((p) => p.usesILMerge && p.isDataversePlugin).length;
      const ilMergeNonPluginCount = ilMergeProjects - ilMergePluginCount;
      if (ilMergePluginCount > 0) {
        recommendations.push(
          `${ilMergePluginCount} Dataverse plugin project(s) use ILMerge/ILRepack — migrate to dependent assembly plugins (NuGet package format)`,
        );
      }
      if (ilMergeNonPluginCount > 0) {
        recommendations.push(
          `${ilMergeNonPluginCount} non-plugin project(s) use ILMerge/ILRepack — use standard project references or NuGet packages instead`,
        );
      }
    }

    return {
      repository,
      branch,
      globalJson: globalJson ?? undefined,
      directoryBuildProps,
      projects,
      summary: {
        totalProjects: projects.length,
        frameworks: frameworkCounts,
        eolFrameworks: [...eolFrameworks],
        ilMergeProjects,
        recommendations,
      },
    };
  }

  private async parseGlobalJson(localPath: string): Promise<GlobalJsonInfo | null> {
    try {
      const content = await readFile(`${localPath}/global.json`, 'utf-8');
      const data = parseGlobalJson(content);
      return { path: 'global.json', sdkVersion: data.sdkVersion, rollForward: data.rollForward };
    } catch {
      return null;
    }
  }

  private async parseDirectoryBuildProps(localPath: string): Promise<DirectoryBuildPropsInfo[]> {
    const files = await glob('**/Directory.Build.props', { cwd: localPath, nodir: true });
    const results: DirectoryBuildPropsInfo[] = [];
    for (const file of files) {
      try {
        const content = await readFile(`${localPath}/${file}`, 'utf-8');
        const data = parseDirectoryBuildProps(content);
        results.push({
          path: file,
          targetFramework: data.targetFramework,
          targetFrameworks: data.targetFrameworks,
          properties: data.properties,
        });
      } catch {
        // Skip unparseable files
      }
    }
    return results;
  }

  private async parseProjects(localPath: string): Promise<ProjectFrameworkInfo[]> {
    const csprojFiles = await glob('**/*.csproj', { cwd: localPath, nodir: true });
    const results: ProjectFrameworkInfo[] = [];

    for (const file of csprojFiles) {
      try {
        const content = await readFile(`${localPath}/${file}`, 'utf-8');
        const data = parseCsproj(content);

        const framework = data.targetFramework ?? 'unknown';
        const frameworks = data.targetFrameworks;
        const usesCrmSdk = detectCrmSdkUsage(content);
        const isDataversePlugin = usesCrmSdk ? await detectDataversePlugin(localPath, file) : false;
        const usesILMerge = detectILMergeUsage(content);

        const allFrameworks = frameworks ?? [framework];
        // isEol is computed from the framework's published EOL date versus today, so a framework
        // never goes stale in this table — it flips to EOL the moment its real date passes.
        const hasEol = allFrameworks.some((f) => isEolFramework(f));
        const eolDate = allFrameworks.map((f) => getEolDate(f)).find(Boolean);

        results.push({
          path: file,
          targetFramework: framework,
          targetFrameworks: frameworks,
          isEol: hasEol,
          eolDate,
          usesCrmSdk,
          isDataversePlugin,
          usesILMerge,
        });
      } catch {
        // Skip unparseable files
      }
    }

    return results;
  }
}

/** Tier 1: does the .csproj reference any CRM/Dataverse SDK library? */
function detectCrmSdkUsage(csprojContent: string): boolean {
  const crmSdkIndicators = [
    'Microsoft.CrmSdk.CoreAssemblies',
    'Microsoft.CrmSdk.Workflow',
    'Microsoft.CrmSdk.XrmTooling',
    'Microsoft.PowerApps.MSBuild.Plugin',
    'Microsoft.Xrm.Sdk.dll',
    'Microsoft.Xrm.Sdk.Workflow.dll',
    'Microsoft.Xrm.Sdk',
    'Microsoft.PowerPlatform.Dataverse.Client',
  ];
  return crmSdkIndicators.some((indicator) => csprojContent.includes(indicator));
}

/** Tier 2: scan .cs source for Dataverse plugin/workflow base-class indicators (CRM-SDK projects only). */
async function detectDataversePlugin(localPath: string, csprojPath: string): Promise<boolean> {
  const projectDir = csprojPath.includes('/')
    ? csprojPath.substring(0, csprojPath.lastIndexOf('/'))
    : csprojPath.includes('\\')
      ? csprojPath.substring(0, csprojPath.lastIndexOf('\\'))
      : '';

  const searchDir = projectDir ? `${localPath}/${projectDir}` : localPath;
  const csFiles = await glob('**/*.cs', { cwd: searchDir, nodir: true });
  const pluginIndicators = ['IPlugin', 'CodeActivity', 'PluginBase'];

  for (const csFile of csFiles) {
    try {
      const content = await readFile(`${searchDir}/${csFile}`, 'utf-8');
      if (pluginIndicators.some((indicator) => content.includes(indicator))) {
        return true;
      }
    } catch {
      // Skip unreadable files
    }
  }
  return false;
}

/** Detect ILMerge/ILRepack usage (deprecated for Dataverse plugins in favour of dependent assembly plugins). */
function detectILMergeUsage(csprojContent: string): boolean {
  const lowerContent = csprojContent.toLowerCase();
  return lowerContent.includes('ilmerge') || lowerContent.includes('ilrepack');
}
