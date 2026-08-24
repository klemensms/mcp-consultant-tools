/**
 * Image Sync Orchestration
 *
 * Hooks `image-handler` + `image-manifest` + `WorkItemService.downloadAttachment`
 * into the work-item pull/push pipelines.
 *
 *  - On pull: scan all string fields + comment bodies for ADO attachment <img>
 *    refs, download each binary into `{folder}/{id}/attachments/`, rewrite the
 *    src to the local relative path, and write the manifest.
 *
 *  - On push: read the manifest, scan content for image refs, rewrite local
 *    paths back to original ADO URLs, upload any new local files, append to
 *    the manifest.
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  extractImageRefs,
  rewriteImageSrcs,
  parseAdoAttachmentUrl,
  type AdoAttachmentRef,
} from './image-handler.js';
import {
  readManifest,
  writeManifest,
  upsertEntry,
  findEntryByLocalPath,
  buildLocalAttachmentPath,
  getAttachmentsBinDir,
  getWorkItemAttachmentDir,
  type AttachmentManifest,
  type AttachmentManifestEntry,
} from './image-manifest.js';

/**
 * Append `?fileName=...` (or `&fileName=...`) to an attachment URL only when
 * one isn't already present. ADO's upload response sometimes already includes
 * the param; appending unconditionally produces duplicate `fileName=` entries.
 */
function appendFileNameParam(url: string, fileName: string): string {
  if (/[?&]fileName=/i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}fileName=${encodeURIComponent(fileName)}`;
}

interface ImageDownloadService {
  downloadAttachment(
    project: string,
    attachmentGuid: string,
    urlFileName: string,
    outputDir: string,
    outputFileName?: string,
  ): Promise<{ filePath: string; fileName: string; size: number; guid: string }>;
}

interface ImageUploadService {
  uploadAttachment(
    project: string,
    filePath: string,
    fileName?: string,
  ): Promise<{ id: string; url: string; fileName: string; size: number }>;
}

export interface PullImageResult {
  downloaded: number;
  reused: number;
  failed: Array<{ guid: string; fileName: string; error: string }>;
  manifest: AttachmentManifest;
}

/**
 * Scan an arbitrary HTML/markdown string for ADO attachment refs, download
 * each missing binary, and rewrite the srcs to local relative paths.
 *
 * Returns the rewritten content, plus updates the manifest in-place.
 */
async function processFieldImages(
  content: string,
  fieldName: string,
  project: string,
  workItemId: number,
  syncFolder: string,
  service: ImageDownloadService,
  manifest: AttachmentManifest,
  result: PullImageResult,
): Promise<string> {
  if (!content) return content;

  const refs = extractImageRefs(content);
  const adoRefs = refs.filter(r => r.adoAttachment);
  if (adoRefs.length === 0) return content;

  const binDir = getAttachmentsBinDir(syncFolder, workItemId);

  // Build a URL → localPath map by ensuring each ADO attachment is on disk.
  const urlToLocalPath = new Map<string, string>();

  for (const ref of adoRefs) {
    const ado = ref.adoAttachment!;
    const existing = manifest.attachments.find(a => a.guid === ado.guid);
    const localRelPath = buildLocalAttachmentPath(ado.guid, ado.fileName);
    const localAbsPath = path.join(getWorkItemAttachmentDir(syncFolder, workItemId), localRelPath);

    let onDisk = false;
    try { await fs.access(localAbsPath); onDisk = true; } catch { /* not on disk */ }

    if (existing && onDisk) {
      result.reused++;
      urlToLocalPath.set(ref.originalSrc, `./${localRelPath}`);
      continue;
    }

    try {
      await service.downloadAttachment(
        project,
        ado.guid,
        ado.fileName,
        binDir,
        `${ado.guid}-${ado.fileName}`,
      );
      result.downloaded++;
      const entry: AttachmentManifestEntry = {
        guid: ado.guid,
        fileName: ado.fileName,
        localPath: localRelPath,
        originalUrl: ado.originalUrl,
        source: 'ado-pull',
        field: fieldName,
      };
      upsertEntry(manifest, entry);
      urlToLocalPath.set(ref.originalSrc, `./${localRelPath}`);
    } catch (err: any) {
      result.failed.push({ guid: ado.guid, fileName: ado.fileName, error: err.message });
    }
  }

  // Rewrite srcs in one pass using the map we built.
  return rewriteImageSrcs(content, (src, _ado) => urlToLocalPath.get(src) ?? null);
}

/**
 * Process all string fields on a work item, downloading attachments and
 * rewriting srcs. Mutates `workItem.fields` in place. Persists the manifest.
 */
export async function pullWorkItemImages(
  workItem: any,
  project: string,
  syncFolder: string,
  service: ImageDownloadService,
): Promise<PullImageResult> {
  const workItemId = workItem.id as number;
  const manifest = await readManifest(syncFolder, workItemId);
  const result: PullImageResult = { downloaded: 0, reused: 0, failed: [], manifest };

  const fields = workItem.fields || {};
  for (const [fieldName, value] of Object.entries(fields)) {
    if (typeof value !== 'string') continue;
    const newContent = await processFieldImages(
      value, fieldName, project, workItemId, syncFolder, service, manifest, result,
    );
    if (newContent !== value) {
      fields[fieldName] = newContent;
    }
  }

  if (result.downloaded > 0 || result.reused > 0 || manifest.attachments.length > 0) {
    await writeManifest(syncFolder, manifest);
  }

  return result;
}

/**
 * Process comment bodies for image refs. Mutates `comments[i].text` in place.
 * Uses the same manifest as the parent work item so attachments are tracked
 * together. Returns aggregated counts.
 */
export async function pullCommentImages(
  workItemId: number,
  comments: Array<{ text?: string; content?: string }>,
  project: string,
  syncFolder: string,
  service: ImageDownloadService,
): Promise<PullImageResult> {
  const manifest = await readManifest(syncFolder, workItemId);
  const result: PullImageResult = { downloaded: 0, reused: 0, failed: [], manifest };

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const body = c.text ?? c.content ?? '';
    if (typeof body !== 'string' || !body) continue;

    const newBody = await processFieldImages(
      body, `Comment#${i + 1}`, project, workItemId, syncFolder, service, manifest, result,
    );
    if (newBody !== body) {
      if (c.text !== undefined) c.text = newBody;
      else c.content = newBody;
    }
  }

  if (result.downloaded > 0 || result.reused > 0) {
    await writeManifest(syncFolder, manifest);
  }
  return result;
}

// =============================================================================
// PUSH SIDE
// =============================================================================

export interface PushImageResult {
  uploaded: number;
  reused: number;
  failed: Array<{ src: string; error: string }>;
  manifest: AttachmentManifest;
}

/**
 * Resolve a markdown image src against the work-item attachment folder.
 * Returns an absolute path that may or may not exist.
 *
 * Accepted forms:
 *   - "./attachments/foo.png"
 *   - "attachments/foo.png"
 *   - "{workItemId}/attachments/foo.png"  (relative to the sync folder)
 *   - any absolute path
 */
function resolveLocalImagePath(
  src: string,
  syncFolder: string,
  workItemId: number,
): { absolute: string; relativeToWorkItem: string } | null {
  // Skip remote URLs and data URIs
  if (/^(https?:|data:|file:)/i.test(src)) return null;

  const workItemDir = getWorkItemAttachmentDir(syncFolder, workItemId);

  if (path.isAbsolute(src)) {
    return {
      absolute: src,
      relativeToWorkItem: path.relative(workItemDir, src).replace(/\\/g, '/'),
    };
  }

  // Strip leading ./
  const stripped = src.replace(/^\.\//, '');
  // If src starts with the work item ID, treat as syncFolder-relative
  const idPrefix = `${workItemId}/`;
  const candidate = stripped.startsWith(idPrefix)
    ? path.join(syncFolder, stripped)
    : path.join(workItemDir, stripped);

  return {
    absolute: candidate,
    relativeToWorkItem: path.relative(workItemDir, candidate).replace(/\\/g, '/'),
  };
}

/**
 * Rewrite a content string for push:
 *   - ADO URL → leave alone
 *   - local path matching manifest → swap to original ADO URL
 *   - local path NOT in manifest → upload, add to manifest, swap to new URL
 *   - anything else (relative URL we can't find) → leave alone, log
 */
async function processFieldImagesForPush(
  content: string,
  fieldName: string,
  project: string,
  workItemId: number,
  syncFolder: string,
  service: ImageUploadService,
  manifest: AttachmentManifest,
  result: PushImageResult,
): Promise<string> {
  if (!content) return content;

  const refs = extractImageRefs(content);
  if (refs.length === 0) return content;

  // Resolve each ref upfront (uploads need to happen before we rewrite).
  const srcToFinalUrl = new Map<string, string>();

  for (const ref of refs) {
    const src = ref.originalSrc;

    // Already an ADO URL - keep as-is
    if (parseAdoAttachmentUrl(src)) {
      continue;
    }

    const resolved = resolveLocalImagePath(src, syncFolder, workItemId);
    if (!resolved) continue; // remote/non-local URL we don't manage

    // Manifest hit?
    const entry = findEntryByLocalPath(manifest, resolved.relativeToWorkItem);
    if (entry) {
      srcToFinalUrl.set(src, entry.originalUrl);
      result.reused++;
      continue;
    }

    // Not in manifest - try to upload as new attachment.
    try {
      await fs.access(resolved.absolute);
    } catch {
      result.failed.push({ src, error: `Local file not found: ${resolved.absolute}` });
      continue;
    }

    try {
      const uploaded = await service.uploadAttachment(project, resolved.absolute);
      const finalUrl = appendFileNameParam(uploaded.url, uploaded.fileName);
      const entryFromUpload: AttachmentManifestEntry = {
        guid: uploaded.id,
        fileName: uploaded.fileName,
        localPath: resolved.relativeToWorkItem,
        originalUrl: finalUrl,
        source: 'local-uploaded',
        field: fieldName,
        uploadedAt: new Date().toISOString(),
      };
      upsertEntry(manifest, entryFromUpload);
      srcToFinalUrl.set(src, finalUrl);
      result.uploaded++;
    } catch (err: any) {
      result.failed.push({ src, error: err.message });
    }
  }

  if (srcToFinalUrl.size === 0) return content;

  return rewriteImageSrcs(content, (src, _ado) => srcToFinalUrl.get(src) ?? null);
}

/**
 * Apply image push processing to a parsed work item file's body fields.
 * Iterates every refname in `bodyFieldMap`, so custom body fields (not just
 * the historical Description/ReproSteps/AC/custom-four) get image handling.
 * Mutates the parsed object in-place and persists the manifest.
 */
export async function pushWorkItemImages(
  parsed: {
    bodyFieldMap: Record<string, string>;
    description?: string;
    reproSteps?: string;
    acceptanceCriteria?: string;
    additionalFields?: any;
  },
  workItemId: number,
  project: string,
  syncFolder: string,
  service: ImageUploadService,
): Promise<PushImageResult> {
  const manifest = await readManifest(syncFolder, workItemId);
  const result: PushImageResult = { uploaded: 0, reused: 0, failed: [], manifest };

  for (const [refname, value] of Object.entries(parsed.bodyFieldMap)) {
    if (typeof value !== 'string' || !value) continue;
    parsed.bodyFieldMap[refname] = await processFieldImagesForPush(
      value, refname, project, workItemId, syncFolder, service, manifest, result,
    );
  }

  // Keep the legacy convenience slots in sync with bodyFieldMap so downstream
  // consumers that still read them (logs, diffs) see the updated content.
  if (parsed.description !== undefined) {
    parsed.description = parsed.bodyFieldMap['System.Description'] ?? '';
  }
  if (parsed.reproSteps !== undefined) {
    parsed.reproSteps = parsed.bodyFieldMap['Microsoft.VSTS.TCM.ReproSteps'] ?? '';
  }
  if (parsed.acceptanceCriteria !== undefined) {
    parsed.acceptanceCriteria = parsed.bodyFieldMap['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? '';
  }

  if (result.uploaded > 0 || result.reused > 0 || manifest.attachments.length > 0) {
    await writeManifest(syncFolder, manifest);
  }
  return result;
}

/**
 * Append a manually-uploaded attachment to a work item's manifest.
 * Used by the standalone `upload-work-item-attachment` tool.
 */
export async function recordExternalUpload(
  syncFolder: string,
  workItemId: number,
  uploaded: { id: string; url: string; fileName: string },
  localPath: string,
): Promise<void> {
  const manifest = await readManifest(syncFolder, workItemId);
  const finalUrl = appendFileNameParam(uploaded.url, uploaded.fileName);
  upsertEntry(manifest, {
    guid: uploaded.id,
    fileName: uploaded.fileName,
    localPath,
    originalUrl: finalUrl,
    source: 'local-uploaded',
    uploadedAt: new Date().toISOString(),
  });
  await writeManifest(syncFolder, manifest);
}
