/**
 * Image Attachment Manifest
 *
 * Per-work-item record of attachment files synced between local disk and ADO.
 * Stored at `{syncFolder}/{workItemId}/.attachments.json`.
 *
 * The manifest is the source of truth for "is this image already on ADO?":
 *   - On pull: each downloaded ADO attachment is recorded with `source: "ado-pull"`.
 *   - On push: when a local image src matches a manifest entry, the original
 *     ADO URL is reused (no re-upload). When it doesn't match, the file is
 *     uploaded as a new attachment and added with `source: "local-uploaded"`.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type AttachmentSource = 'ado-pull' | 'local-uploaded';

export interface AttachmentManifestEntry {
  /** ADO attachment GUID */
  guid: string;
  /** Original filename as stored in ADO */
  fileName: string;
  /** Path relative to the work item folder (e.g. "attachments/{guid}-image.png") */
  localPath: string;
  /** Original ADO attachment URL (used to re-reference on push) */
  originalUrl: string;
  /** Where the entry came from */
  source: AttachmentSource;
  /** ADO field reference name where the image was first seen (informational) */
  field?: string;
  /** ISO timestamp of upload (for local-uploaded entries) */
  uploadedAt?: string;
}

export interface AttachmentManifest {
  workItemId: number;
  lastSyncedAt: string;
  attachments: AttachmentManifestEntry[];
}

const MANIFEST_FILENAME = '.attachments.json';
const ATTACHMENTS_SUBDIR = 'attachments';

/** Folder for a work item's attachments + manifest. */
export function getWorkItemAttachmentDir(syncFolder: string, workItemId: number): string {
  return path.join(syncFolder, String(workItemId));
}

/** Folder where the binary attachment files live. */
export function getAttachmentsBinDir(syncFolder: string, workItemId: number): string {
  return path.join(getWorkItemAttachmentDir(syncFolder, workItemId), ATTACHMENTS_SUBDIR);
}

/** Path to the manifest JSON file. */
export function getManifestPath(syncFolder: string, workItemId: number): string {
  return path.join(getWorkItemAttachmentDir(syncFolder, workItemId), MANIFEST_FILENAME);
}

/**
 * Build the local relative path for a downloaded attachment.
 * Example: `attachments/5e5c125f-...-image.png`.
 *
 * The GUID prefix keeps filenames unique even when ADO returns generic names
 * like "image.png" for many different attachments.
 */
export function buildLocalAttachmentPath(guid: string, fileName: string): string {
  return path.posix.join(ATTACHMENTS_SUBDIR, `${guid}-${fileName}`);
}

/** Read manifest from disk. Returns an empty manifest if the file is missing. */
export async function readManifest(syncFolder: string, workItemId: number): Promise<AttachmentManifest> {
  const manifestPath = getManifestPath(syncFolder, workItemId);
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.attachments)) {
      throw new Error('Malformed manifest');
    }
    return parsed as AttachmentManifest;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { workItemId, lastSyncedAt: new Date().toISOString(), attachments: [] };
    }
    // Corrupted manifest — start fresh rather than failing the sync.
    console.error(`Warning: could not parse ${manifestPath}: ${err.message}. Starting fresh.`);
    return { workItemId, lastSyncedAt: new Date().toISOString(), attachments: [] };
  }
}

/** Write manifest to disk, creating the parent directory if needed. */
export async function writeManifest(syncFolder: string, manifest: AttachmentManifest): Promise<void> {
  const dir = getWorkItemAttachmentDir(syncFolder, manifest.workItemId);
  await fs.mkdir(dir, { recursive: true });
  const manifestPath = getManifestPath(syncFolder, manifest.workItemId);
  manifest.lastSyncedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Add (or replace) an entry in the manifest. Lookup is by `guid` — the same
 * attachment is never recorded twice. Returns the manifest unchanged when an
 * existing entry has the same guid AND localPath, otherwise replaces it.
 */
export function upsertEntry(manifest: AttachmentManifest, entry: AttachmentManifestEntry): AttachmentManifest {
  const existing = manifest.attachments.findIndex(a => a.guid === entry.guid);
  if (existing >= 0) {
    manifest.attachments[existing] = { ...manifest.attachments[existing], ...entry };
  } else {
    manifest.attachments.push(entry);
  }
  return manifest;
}

/**
 * Look up a manifest entry by its local path (relative to the work item folder).
 * Used on push to recognise images that came from ADO and avoid re-uploading.
 */
export function findEntryByLocalPath(manifest: AttachmentManifest, localPath: string): AttachmentManifestEntry | undefined {
  // Normalise both sides: strip leading `./` and convert backslashes.
  const normalise = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
  const target = normalise(localPath);
  return manifest.attachments.find(a => normalise(a.localPath) === target);
}

/** Look up an entry by its original ADO URL. */
export function findEntryByAdoUrl(manifest: AttachmentManifest, url: string): AttachmentManifestEntry | undefined {
  return manifest.attachments.find(a => a.originalUrl === url);
}
