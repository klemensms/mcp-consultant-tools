/**
 * Guard for attaching a local file to a draft.
 *
 * An email the agent reads can carry an instruction to attach a key file and
 * send it somewhere. So the real path (symlinks followed) must sit inside the
 * user's home folder, no segment of it below home may start with "." (which
 * covers ~/.ssh, ~/.aws, ~/.config and every dotfile), and credential-shaped
 * names are refused wherever they are.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CREDENTIAL_NAME = /^(\.env.*|id_.*|.*\.(pem|key|p12|pfx))$/i;

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
  if (CREDENTIAL_NAME.test(segments[segments.length - 1])) {
    throw new Error(`Refused: ${filePath} looks like a credential file (.env, id_*, .pem, .key, .p12, .pfx).`);
  }

  if (!fs.statSync(real).isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  return real;
}
