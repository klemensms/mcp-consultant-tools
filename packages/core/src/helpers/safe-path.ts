/**
 * Safe filesystem-path helpers.
 *
 * MCP tools that take a caller-supplied path can be steered - e.g. via prompt
 * injection through untrusted content - into reading or writing outside the
 * intended location. These helpers give every package one shared, complete
 * implementation of path confinement instead of ad-hoc per-tool checks.
 *
 * Two tiers:
 *  - {@link resolveSafePath} - for WRITES. Confines the resolved path to a
 *    permitted root (default: MCP_FILE_ROOT or the process working directory).
 *    Absolute paths that escape the root are rejected too.
 *  - {@link assertNoTraversal} - for READS. Rejects parent-directory traversal
 *    ("..") but allows absolute paths, so legitimate "read a file from
 *    anywhere I point you" workflows keep working while injected `../` escapes
 *    are blocked.
 *  - {@link safeBasename} - collapses an untrusted filename component (e.g. a
 *    downloaded attachment's own name) to its basename, neutralising embedded
 *    path separators and traversal.
 */

import path from 'path';

/**
 * Resolve the permitted root for write confinement.
 * Order: explicit `root` arg → MCP_FILE_ROOT env → process working directory.
 */
export function getFileRoot(root?: string): string {
  return path.resolve(root ?? process.env.MCP_FILE_ROOT ?? process.cwd());
}

function rejectMalformed(userPath: string): void {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new Error('A file path is required.');
  }
  if (userPath.includes('\0')) {
    throw new Error('File path contains a null byte.');
  }
}

/**
 * Resolve a caller-supplied path and confine it to a permitted root.
 *
 * Use for WRITE destinations. The path (relative OR absolute) must resolve
 * inside the root, otherwise it is rejected - this blocks both `../` traversal
 * and absolute paths pointing elsewhere on the filesystem.
 *
 * @returns the absolute, confined path
 * @throws if the path is malformed or escapes the root
 */
export function resolveSafePath(
  userPath: string,
  opts: { root?: string } = {}
): string {
  rejectMalformed(userPath);
  const root = getFileRoot(opts.root);
  const normalized = userPath.replace(/\\/g, '/');
  const resolved = path.resolve(root, normalized);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(
      `Refusing to access "${userPath}": path escapes the permitted root (${root}). ` +
        `Use a path inside it, or set the MCP_FILE_ROOT environment variable to widen the permitted root.`
    );
  }
  return resolved;
}

/**
 * Reject parent-directory traversal in a caller-supplied path, then return its
 * resolved absolute form.
 *
 * Use for READ sources where confining to a root would break legitimate
 * "read from any location" use, but an injected `../` escape should still be
 * blocked. Absolute paths are permitted.
 *
 * @returns the absolute resolved path
 * @throws if the path is malformed or contains a ".." segment
 */
export function assertNoTraversal(userPath: string): string {
  rejectMalformed(userPath);
  const segments = userPath.replace(/\\/g, '/').split('/');
  if (segments.includes('..')) {
    throw new Error(
      `Refusing to access "${userPath}": parent-directory traversal ("..") is not allowed.`
    );
  }
  return path.resolve(userPath.replace(/\\/g, '/'));
}

/**
 * Collapse an untrusted filename component to a safe basename.
 *
 * Strips any directory portion (so `../../../etc/passwd` becomes `passwd`),
 * neutralising path separators and traversal embedded in a name that came from
 * untrusted content (e.g. a downloaded attachment's filename).
 *
 * @throws if the result is empty, "." or ".."
 */
export function safeBasename(name: string): string {
  rejectMalformed(name);
  const base = path.basename(name.replace(/\\/g, '/'));
  if (!base || base === '.' || base === '..') {
    throw new Error(`Unsafe file name: "${name}".`);
  }
  return base;
}
