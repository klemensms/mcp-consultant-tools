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
  /**
   * Bearer token sent via `git -c http.extraHeader`, for credentials that authenticate by header
   * rather than by URL userinfo (an Entra access token against Azure DevOps). Mutually exclusive
   * in practice with a credential embedded in `cloneUrl`.
   */
  bearerToken?: string;
}

/** Replace every occurrence of `secret` with `***`. No-op for an empty secret. */
export function redactSecret(message: string, secret: string): string {
  return secret ? message.split(secret).join('***') : message;
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

  let redacted = redactSecret(message, userinfo);
  // When userinfo is "x-access-token:<value>", also redact the bare value on its own, in case a
  // downstream formatter prints just that trailing segment.
  const colon = userinfo.indexOf(':');
  if (colon !== -1) {
    redacted = redactSecret(redacted, userinfo.substring(colon + 1));
  }
  return redacted;
}

export class CloneManager {
  private static readonly DEFAULT_TIMEOUT_MS = 120_000;

  async clone(cloneUrl: string, options?: CloneOptions): Promise<CloneResult> {
    const localPath = await mkdtemp(join(tmpdir(), 'mcp-cr-'));

    const args: string[] = [];
    if (options?.bearerToken) {
      // `-c` must precede the subcommand. Entra access tokens authenticate Git over HTTPS through
      // the Authorization header, not through URL userinfo — the form Microsoft documents for
      // Azure DevOps — which also keeps the token out of the clone URL entirely.
      args.push('-c', `http.extraHeader=Authorization: Bearer ${options.bearerToken}`);
    }
    args.push('clone', '--depth=1');
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
      // Never let a credential survive into the thrown message — the URL userinfo, and the bearer
      // token which git echoes back as part of the `-c http.extraHeader=...` argument.
      let message = redactCloneSecret(raw, cloneUrl);
      if (options?.bearerToken) message = redactSecret(message, options.bearerToken);
      throw new Error(`Git clone failed: ${message}`);
    }

    return {
      localPath,
      cleanup: async () => {
        await rm(localPath, { recursive: true, force: true });
      },
    };
  }

  /**
   * The PAT is the *password*, with an empty username — matching the basic-auth header the REST
   * path builds (`Buffer.from(':' + pat)`) and the form Microsoft documents. Putting the PAT in the
   * username position instead leaves git with no password at all, so it prompts for one and dies
   * with `could not read Password` before ever reaching Azure DevOps — regardless of whether the
   * PAT is valid. Verified 2026-08-13.
   */
  buildAzdoCloneUrl(organization: string, project: string, repo: string, pat: string): string {
    return `https://:${pat}@dev.azure.com/${organization}/${project}/_git/${repo}`;
  }

  /** Credential-free Azure DevOps clone URL — the Entra token travels in `http.extraHeader`. */
  buildAzdoBearerCloneUrl(organization: string, project: string, repo: string): string {
    return `https://dev.azure.com/${organization}/${project}/_git/${repo}`;
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
