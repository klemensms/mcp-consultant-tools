/**
 * Form File Workflow Tools - 3 tools for download/deploy/diff of form XML via local files.
 *
 * Mirrors the deploy-web-resource-file pattern so form edits can live in source control,
 * be diffable, and deploy deterministically across environments.
 *
 * Tools: download-form-to-file, deploy-form-file, diff-form-file
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, FORM_FILE_PATH_EXAMPLES, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerFormFileTools(server: any, ctx: ServiceContext): void {

server.tool(
  "download-form-to-file",
  "Download a form's XML to a local file for source-controlled editing. Writes the formxml verbatim (no re-serialisation — whitespace preserved), plus a sidecar <filePath>.meta.json with formId/versionNumber/etc., plus a timestamped snapshot under <filePath>.history/. " +
  "Resolve the form by `formId`, or by `entityLogicalName` + `formName` (+ optional `formType`), or by `entityLogicalName` + `formType` when exactly one form of that type exists. " +
  "Overwrites the target file — Dataverse is the source of truth. Pair with `deploy-form-file` to upload changes.",
  {
    filePath: z.string().describe(
      descWithExamples("Local file path to write the form XML to. Parent directories are created as needed.", FORM_FILE_PATH_EXAMPLES)
    ),
    formId: z.string().optional().describe("Form ID (GUID). If provided, overrides entity/name/type lookup."),
    entityLogicalName: z.string().optional().describe(
      descWithExamples("Entity logical name (required when formId not provided)", ENTITY_NAME_EXAMPLES)
    ),
    formName: z.string().optional().describe("Form display name (e.g., 'Contact', 'Information'). Combined with entityLogicalName and optional formType."),
    formType: z.enum(["Main", "QuickCreate", "QuickView", "Card"]).optional().describe("Form type filter. Useful when the same name exists across types, or to pick the only form of a given type on the entity."),
  },
  async ({ filePath, formId, entityLogicalName, formName, formType }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.downloadFormToFile(filePath, {
        formId, entityLogicalName, formName, formType,
      });
      return {
        content: [{
          type: "text",
          text: `Downloaded form '${result.name}' (${result.formType}) from entity '${result.entityLogicalName}'.\n` +
                `File: ${result.filePath}\n` +
                `Sidecar: ${result.metaPath}\n` +
                `History: ${result.historyPath}\n` +
                `Form ID: ${result.formId}\n` +
                `Version: ${result.versionNumber}\n` +
                `Size: ${result.byteCount} bytes`,
        }],
      };
    } catch (error: any) {
      console.error("Error downloading form to file:", error);
      return { content: [{ type: "text", text: `Failed to download form: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deploy-form-file",
  "Deploy a local form XML file to Dataverse — PATCH the systemform's formxml with the file's bytes verbatim. " +
  "Reads the target formId from the sidecar <filePath>.meta.json unless overridden. " +
  "Use `expectedVersionNumber` for optimistic concurrency (rejects if the remote has changed since download). " +
  "Writes a timestamped snapshot under <filePath>.history/ so every upload is audit-loggable. " +
  "Requires publish-customizations afterwards.",
  {
    filePath: z.string().describe(
      descWithExamples("Local file path of the form XML to deploy.", FORM_FILE_PATH_EXAMPLES)
    ),
    formId: z.string().optional().describe("Override the target form ID (defaults to the value in the sidecar .meta.json)."),
    expectedVersionNumber: z.string().optional().describe("Optimistic concurrency check — reject if remote's versionnumber doesn't match. Pass the value from the sidecar .meta.json."),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add the form to (MSCRM.SolutionUniqueName header).", SOLUTION_NAME_EXAMPLES)
    ),
  },
  async ({ filePath, formId, expectedVersionNumber, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;
      const result = await service.deployFormFromFile(filePath, {
        formId, expectedVersionNumber, solutionUniqueName: solution,
      });
      return {
        content: [{
          type: "text",
          text: `Deployed form file '${result.filePath}'.\n` +
                `Form ID: ${result.formId}\n` +
                `Previous version: ${result.previousVersionNumber}\n` +
                `New version: ${result.newVersionNumber}\n` +
                `Size: ${result.byteCount} bytes\n` +
                `History snapshot: ${result.historyPath}\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`,
        }],
      };
    } catch (error: any) {
      console.error("Error deploying form file:", error);
      return { content: [{ type: "text", text: `Failed to deploy form file: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "diff-form-file",
  "Compare a local form XML file to the current remote form — does NOT modify anything. " +
  "Use before `deploy-form-file` to sanity-check scope of change, or to detect that the remote has drifted since download. " +
  "Returns whether files are byte-identical and both sizes/versions.",
  {
    filePath: z.string().describe(
      descWithExamples("Local file path of the form XML to compare.", FORM_FILE_PATH_EXAMPLES)
    ),
    formId: z.string().optional().describe("Override the target form ID (defaults to the value in the sidecar .meta.json)."),
  },
  async ({ filePath, formId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.diffFormWithFile(filePath, { formId });
      const verdict = result.identical ? 'IDENTICAL' : 'DIFFERENT';
      const versionNote = result.localVersion && result.localVersion !== result.remoteVersion
        ? ` — WARNING: remote version (${result.remoteVersion}) moved since download (${result.localVersion})`
        : '';
      return {
        content: [{
          type: "text",
          text: `Diff verdict: ${verdict}${versionNote}\n` +
                `Form ID: ${result.formId}\n` +
                `Local size: ${result.localSize} bytes\n` +
                `Remote size: ${result.remoteSize} bytes\n` +
                `Local version: ${result.localVersion ?? 'n/a'}\n` +
                `Remote version: ${result.remoteVersion}`,
        }],
      };
    } catch (error: any) {
      console.error("Error diffing form file:", error);
      return { content: [{ type: "text", text: `Failed to diff form file: ${error.message}` }], isError: true };
    }
  }
);

}
