/**
 * Guard for attaching a local file to a Teams message (copied from the Outlook package).
 *
 * A message the agent reads can carry an instruction to attach a key file and
 * send it somewhere. So the real path (symlinks followed) must sit inside the
 * user's home folder, no segment of it below home may start with "." (which
 * covers ~/.ssh, ~/.aws, ~/.config and every dotfile), ~/Library and ~/AppData are refused, and credential-shaped
 * names are refused wherever they are. A file with more than one hard link is
 * refused too, because a hard link in home can point at a key file elsewhere
 * and realpath cannot see through it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CREDENTIAL_NAME = /^(\.env.*|id_.*|.*\.(pem|key|p12|pfx|ppk|kdbx))$/i;
/** Top-level home folders that hold keychains, browser cookies and app tokens without a leading dot. */
const SETTINGS_FOLDER = /^(library|appdata)$/i;

export function assertSafeLocalFile(filePath: string, homeDir: string = os.homedir()): string {
  const home = fs.realpathSync(homeDir);
  const expanded = filePath === '~' || filePath.startsWith('~/') ? path.join(home, filePath.slice(1)) : filePath;

  let real: string;
  try {
    real = fs.realpathSync(path.resolve(expanded));
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  const relative = path.relative(home, real);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refused: ${filePath} is outside your home folder. Only files inside it can be attached.`);
  }

  const segments = relative.split(path.sep);
  if (segments.some((segment) => segment.startsWith('.'))) {
    throw new Error(`Refused: ${filePath} is inside a hidden folder or is a hidden file, where keys and settings live.`);
  }
  if (SETTINGS_FOLDER.test(segments[0])) {
    throw new Error(`Refused: ${filePath} is inside ${segments[0]}, where keychains, cookies and app settings live.`);
  }
  if (CREDENTIAL_NAME.test(segments[segments.length - 1])) {
    throw new Error(`Refused: ${filePath} looks like a credential file (.env, id_*, .pem, .key, .p12, .pfx, .ppk, .kdbx).`);
  }

  const stat = fs.statSync(real);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  if (stat.nlink > 1) {
    throw new Error(`Refused: ${filePath} has more than one hard link, so it may be another file under a different name.`);
  }
  return real;
}
