import { readFile } from 'node:fs/promises';
import { FanOutRecorder } from '@mcp-consultant-tools/core';
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
    // One recorder per glob. Each of these was a bare `catch {}`, so an unparseable file was
    // dropped and the report described the remainder as if it were the repository.
    const propsReads = new FanOutRecorder();
    const projectReads = new FanOutRecorder();
    const sourceReads = new FanOutRecorder();

    const globalJson = await this.parseGlobalJson(localPath);
    const directoryBuildProps = await this.parseDirectoryBuildProps(localPath, propsReads);
    const projects = await this.parseProjects(localPath, projectReads, sourceReads);

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
      fanOut: {
        directoryBuildProps: propsReads.result(),
        projects: projectReads.result(),
        sourceFiles: sourceReads.result(),
      },
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

  private async parseDirectoryBuildProps(
    localPath: string,
    reads: FanOutRecorder
  ): Promise<DirectoryBuildPropsInfo[]> {
    const files = await glob('**/Directory.Build.props', { cwd: localPath, nodir: true });
    const results: DirectoryBuildPropsInfo[] = [];
    for (const file of files) {
      const info = await reads.run(file, 'parse Directory.Build.props', async () => {
        const content = await readFile(`${localPath}/${file}`, 'utf-8');
        const data = parseDirectoryBuildProps(content);
        return {
          path: file,
          targetFramework: data.targetFramework,
          targetFrameworks: data.targetFrameworks,
          properties: data.properties,
        };
      });
      if (info !== null) results.push(info);
    }
    return results;
  }

  private async parseProjects(
    localPath: string,
    reads: FanOutRecorder,
    sourceReads: FanOutRecorder
  ): Promise<ProjectFrameworkInfo[]> {
    const csprojFiles = await glob('**/*.csproj', { cwd: localPath, nodir: true });
    const results: ProjectFrameworkInfo[] = [];

    for (const file of csprojFiles) {
      const info = await reads.run(file, 'parse csproj', async () => {
        const content = await readFile(`${localPath}/${file}`, 'utf-8');
        const data = parseCsproj(content);

        const framework = data.targetFramework ?? 'unknown';
        const frameworks = data.targetFrameworks;
        const usesCrmSdk = detectCrmSdkUsage(content);
        const isDataversePlugin = usesCrmSdk
          ? await detectDataversePlugin(localPath, file, sourceReads)
          : false;
        const usesILMerge = detectILMergeUsage(content);

        const allFrameworks = frameworks ?? [framework];
        // isEol is computed from the framework's published EOL date versus today, so a framework
        // never goes stale in this table - it flips to EOL the moment its real date passes.
        const hasEol = allFrameworks.some((f) => isEolFramework(f));
        const eolDate = allFrameworks.map((f) => getEolDate(f)).find(Boolean);

        const project: ProjectFrameworkInfo = {
          path: file,
          targetFramework: framework,
          targetFrameworks: frameworks,
          isEol: hasEol,
          eolDate,
          usesCrmSdk,
          isDataversePlugin,
          usesILMerge,
        };
        return project;
      });

      if (info !== null) results.push(info);
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

/**
 * Tier 2: scan .cs source for Dataverse plugin/workflow base-class indicators (CRM-SDK
 * projects only).
 *
 * Returns null rather than false when nothing matched and at least one file could not be
 * read. A positive hit is definitive whatever else failed, but a negative one over an
 * unreadable tree is not a negative - it is an unanswered question, and it used to be
 * reported as "not a plugin".
 */
async function detectDataversePlugin(
  localPath: string,
  csprojPath: string,
  sourceReads: FanOutRecorder
): Promise<boolean | null> {
  const projectDir = csprojPath.includes('/')
    ? csprojPath.substring(0, csprojPath.lastIndexOf('/'))
    : csprojPath.includes('\\')
      ? csprojPath.substring(0, csprojPath.lastIndexOf('\\'))
      : '';

  const searchDir = projectDir ? `${localPath}/${projectDir}` : localPath;
  const csFiles = await glob('**/*.cs', { cwd: searchDir, nodir: true });
  const pluginIndicators = ['IPlugin', 'CodeActivity', 'PluginBase'];
  const failedBefore = sourceReads.result().failed;

  for (const csFile of csFiles) {
    const hit = await sourceReads.run(`${csprojPath}:${csFile}`, 'scan source', async () => {
      const content = await readFile(`${searchDir}/${csFile}`, 'utf-8');
      return pluginIndicators.some((indicator) => content.includes(indicator));
    });

    if (hit === true) return true;
  }

  return sourceReads.result().failed > failedBefore ? null : false;
}

/** Detect ILMerge/ILRepack usage (deprecated for Dataverse plugins in favour of dependent assembly plugins). */
function detectILMergeUsage(csprojContent: string): boolean {
  const lowerContent = csprojContent.toLowerCase();
  return lowerContent.includes('ilmerge') || lowerContent.includes('ilrepack');
}
