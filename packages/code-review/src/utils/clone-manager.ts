import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CloneResult {
  localPath: string;
  cleanup: () => Promise<void>;
}

export interface CloneOptions {
  branch?: string;
  timeoutMs?: number;
}

/**
 * Strip the credential embedded in a clone URL out of any string (an error message, a logged
 * command). A failed `git clone` throws an Error whose message echoes the full command line —
 * including the `https://<token>@host/...` URL — so without this the PAT/installation token would
 * leak into tool output, transcripts, and `.context` caches. The credential is the userinfo
 * segment between `://` and the first `@`.
 */
export function redactCloneSecret(message: string, cloneUrl: string): string {
  const schemeEnd = cloneUrl.indexOf('://');
  const at = cloneUrl.indexOf('@');
  if (schemeEnd === -1 || at === -1 || at < schemeEnd) return message;

  const userinfo = cloneUrl.substring(schemeEnd + 3, at); // e.g. "token" or "x-access-token:token"
  if (!userinfo) return message;

  let redacted = message.split(userinfo).join('***');
  // When userinfo is "x-access-token:<value>", also redact the bare value on its own, in case a
  // downstream formatter prints just that trailing segment.
  const colon = userinfo.indexOf(':');
  if (colon !== -1) {
    const token = userinfo.substring(colon + 1);
    if (token) redacted = redacted.split(token).join('***');
  }
  return redacted;
}

export class CloneManager {
  private static readonly DEFAULT_TIMEOUT_MS = 120_000;

  async clone(cloneUrl: string, options?: CloneOptions): Promise<CloneResult> {
    const localPath = await mkdtemp(join(tmpdir(), 'mcp-cr-'));

    const args = ['clone', '--depth=1'];
    if (options?.branch) {
      args.push('--branch', options.branch);
    }
    args.push(cloneUrl, localPath);

    try {
      await execFileAsync('git', args, {
        timeout: options?.timeoutMs ?? CloneManager.DEFAULT_TIMEOUT_MS,
      });
    } catch (error) {
      // Guaranteed cleanup of the temp dir even when the clone throws.
      await rm(localPath, { recursive: true, force: true }).catch(() => {});
      const raw = error instanceof Error ? error.message : String(error);
      // Never let the embedded credential survive into the thrown message.
      throw new Error(`Git clone failed: ${redactCloneSecret(raw, cloneUrl)}`);
    }

    return {
      localPath,
      cleanup: async () => {
        await rm(localPath, { recursive: true, force: true });
      },
    };
  }

  buildAzdoCloneUrl(organization: string, project: string, repo: string, pat: string): string {
    return `https://${pat}@dev.azure.com/${organization}/${project}/_git/${repo}`;
  }

  buildGheCloneUrl(gheBaseUrl: string, owner: string, repo: string, token: string): string {
    const url = new URL(gheBaseUrl);
    return `https://${token}@${url.host}/${owner}/${repo}.git`;
  }

  buildGheAppCloneUrl(gheBaseUrl: string, owner: string, repo: string, token: string): string {
    const url = new URL(gheBaseUrl);
    return `https://x-access-token:${token}@${url.host}/${owner}/${repo}.git`;
  }
}
