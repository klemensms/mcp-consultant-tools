/**
 * Saving downloaded files (SharePoint documents, mail attachments) to one fixed
 * folder per server. Names come from remote content, so they are sanitised: a
 * hostile name cannot write outside the folder or hide as a dotfile, and an
 * existing file is never overwritten.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_NAME_LENGTH = 200;

export function sanitizeFileName(name: string): string {
  const segments = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .split(/[\\/]+/)
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..');

  let safe = segments
    .join('_')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '');

  if (!safe) {
    return 'download';
  }

  if (safe.length > MAX_NAME_LENGTH) {
    const ext = path.extname(safe).slice(0, 20);
    safe = safe.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  return safe;
}

/**
 * Write data into dir under a sanitised name, creating dir if needed. Returns
 * the absolute path. Never overwrites: "name (1).ext", "name (2).ext", ...
 */
export function saveToDownloadDir(dir: string, fileName: string, data: Buffer): string {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  const safe = sanitizeFileName(fileName);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);

  for (let n = 0; ; n++) {
    const candidate = path.join(root, n === 0 ? safe : `${stem} (${n})${ext}`);
    if (path.dirname(candidate) !== root) {
      throw new Error(`Refusing to write outside the download folder: ${fileName}`);
    }
    try {
      // 'wx' fails if the file exists, so a concurrent writer cannot be overwritten either.
      fs.writeFileSync(candidate, data, { flag: 'wx', mode: 0o600 });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

/** The configured download folder, or ~/Downloads/<defaultName>. Expands a leading ~. */
export function resolveDownloadDir(configured: string | undefined, defaultName: string): string {
  if (!configured) {
    return path.join(os.homedir(), 'Downloads', defaultName);
  }
  if (configured === '~' || configured.startsWith('~/')) {
    return path.join(os.homedir(), configured.slice(1));
  }
  return path.resolve(configured);
}
