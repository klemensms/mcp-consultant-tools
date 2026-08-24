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
 * command). A failed `git clone` throws an Error whose message echoes the full command line -
 * including the `https://<token>@host/...` URL - so without this the PAT/installation token would
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

/**
 * True when the child was killed rather than exiting on its own - the shape `execFile` reports for
 * its `timeout` option firing. Node sets `killed` and a `signal`; there is no dedicated error code.
 */
export function isTimeoutKill(error: unknown): boolean {
  const e = error as { killed?: unknown; signal?: unknown } | null;
  return Boolean(e && e.killed === true && typeof e.signal === 'string');
}

/**
 * Environment overrides that force `git` to run unattended.
 *
 * A clone here has no user in front of it. Left alone, git answers a rejected credential by falling
 * back to an interactive prompt, and on a machine with a controlling terminal it then blocks until
 * the timeout kills it. A killed git has printed only `Cloning into '<dir>'...` - so the caller gets
 * a truncated error carrying none of the authentication text needed to explain the failure, and
 * which message it gets depends on whether a credential happened to be cached. Refusing the prompt
 * makes git fail immediately and identically every time, with
 * `fatal: could not read Username for '<url>': terminal prompts disabled`.
 *
 * `GIT_ASKPASS`/`SSH_ASKPASS` would route the prompt to a GUI helper instead, re-opening the hole
 * `GIT_TERMINAL_PROMPT` closes; an empty value disables them.
 *
 * Exported because this is the whole fix, and it cannot be proven from a test process - a test
 * runner's worker has no controlling terminal, so git declines to prompt there whatever this says.
 * Asserting the configuration is the only check that actually inverts.
 */
export const NON_INTERACTIVE_GIT_ENV: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
};

/**
 * Build git's argv for a clone. Exported for the same reason as the env above: the `-c` flags are
 * the behaviour, and asserting them is the only test that fails when they are removed.
 */
export function buildCloneArgs(cloneUrl: string, localPath: string, options?: CloneOptions): string[] {
  const args: string[] = [];
  if (options?.bearerToken) {
    // `-c` must precede the subcommand. Entra access tokens authenticate Git over HTTPS through
    // the Authorization header, not through URL userinfo - the form Microsoft documents for
    // Azure DevOps - which also keeps the token out of the clone URL entirely.
    args.push('-c', `http.extraHeader=Authorization: Bearer ${options.bearerToken}`);
  }
  // Neutralise any credential helper configured on the machine (osxkeychain is the macOS default).
  // Every path here supplies its own credential explicitly - in the URL or in the header - so a
  // helper can only do two things, both bad: answer with a *stale cached* credential, making the
  // outcome depend on machine state rather than on the configured identity, or answer with a
  // *different person's* credential, which would have the run silently review a repository as
  // somebody else.
  args.push('-c', 'credential.helper=');
  args.push('clone', '--depth=1');
  if (options?.branch) {
    args.push('--branch', options.branch);
  }
  args.push(cloneUrl, localPath);
  return args;
}

export class CloneManager {
  private static readonly DEFAULT_TIMEOUT_MS = 120_000;

  async clone(cloneUrl: string, options?: CloneOptions): Promise<CloneResult> {
    const localPath = await mkdtemp(join(tmpdir(), 'mcp-cr-'));
    const args = buildCloneArgs(cloneUrl, localPath, options);

    try {
      await execFileAsync('git', args, {
        timeout: options?.timeoutMs ?? CloneManager.DEFAULT_TIMEOUT_MS,
        env: { ...process.env, ...NON_INTERACTIVE_GIT_ENV },
      });
    } catch (error) {
      // Guaranteed cleanup of the temp dir even when the clone throws.
      await rm(localPath, { recursive: true, force: true }).catch(() => {});
      const raw = error instanceof Error ? error.message : String(error);
      // Never let a credential survive into the thrown message - the URL userinfo, and the bearer
      // token which git echoes back as part of the `-c http.extraHeader=...` argument.
      let message = redactCloneSecret(raw, cloneUrl);
      if (options?.bearerToken) message = redactSecret(message, options.bearerToken);
      // A killed process reports whatever git managed to print before the signal, which reads as
      // a bare, inexplicable failure. Name the timeout so it is not mistaken for one.
      if (isTimeoutKill(error)) {
        const seconds = Math.round((options?.timeoutMs ?? CloneManager.DEFAULT_TIMEOUT_MS) / 1000);
        message += `\n\n(git was terminated after ${seconds}s without completing. The output above is only what it had printed by then.)`;
      }
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
   * The PAT is the *password*, with an empty username - matching the basic-auth header the REST
   * path builds (`Buffer.from(':' + pat)`) and the form Microsoft documents. Putting the PAT in the
   * username position instead leaves git with no password at all, so it prompts for one and dies
   * with `could not read Password` before ever reaching Azure DevOps - regardless of whether the
   * PAT is valid. Verified 2026-08-13.
   */
  buildAzdoCloneUrl(organization: string, project: string, repo: string, pat: string): string {
    return `https://:${pat}@dev.azure.com/${organization}/${project}/_git/${repo}`;
  }

  /** Credential-free Azure DevOps clone URL - the Entra token travels in `http.extraHeader`. */
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
