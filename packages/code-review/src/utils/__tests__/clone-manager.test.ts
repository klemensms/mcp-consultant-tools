import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  CloneManager,
  NON_INTERACTIVE_GIT_ENV,
  buildCloneArgs,
  isTimeoutKill,
  redactCloneSecret,
  redactSecret,
} from '../clone-manager.js';
import { describeCloneAuthFailure } from '../../code-review-client.js';

// Distinctive low-entropy placeholders (readable, hyphenated) so the redaction assertions have
// something unmistakable to look for without embedding a credential-shaped string in the repo.
const PLANTED_SECRET = 'planted-ghe-value-do-not-log';
const AZDO_PAT = 'planted-azdo-value-do-not-log';

describe('clone URL builders', () => {
  const cm = new CloneManager();

  it('builds an Azure DevOps clone URL with the PAT as the PASSWORD, not the username', () => {
    const url = cm.buildAzdoCloneUrl('contoso', 'MyProject', 'repo', AZDO_PAT);
    expect(url).toBe(`https://:${AZDO_PAT}@dev.azure.com/contoso/MyProject/_git/repo`);
    // PAT-as-username leaves git with no password: it prompts, then dies with
    // "could not read Password" before reaching Azure DevOps, valid PAT or not.
    expect(url).not.toBe(`https://${AZDO_PAT}@dev.azure.com/contoso/MyProject/_git/repo`);
  });

  it('builds a credential-free Azure DevOps clone URL for the Entra bearer path', () => {
    const url = cm.buildAzdoBearerCloneUrl('contoso', 'MyProject', 'repo');
    expect(url).toBe('https://dev.azure.com/contoso/MyProject/_git/repo');
    expect(url).not.toContain('@');
  });

  it('builds a GHE PAT clone URL', () => {
    expect(cm.buildGheCloneUrl('https://ghe.example.com', 'contoso', 'repo', PLANTED_SECRET)).toBe(
      `https://${PLANTED_SECRET}@ghe.example.com/contoso/repo.git`,
    );
  });

  it('builds a GHE App clone URL with the x-access-token username', () => {
    expect(cm.buildGheAppCloneUrl('https://ghe.example.com', 'contoso', 'repo', PLANTED_SECRET)).toBe(
      `https://x-access-token:${PLANTED_SECRET}@ghe.example.com/contoso/repo.git`,
    );
  });
});

describe('redactCloneSecret - the embedded credential must never survive into an error', () => {
  it('removes a GHE PAT that git echoed back in a failed-clone message', () => {
    const cloneUrl = `https://${PLANTED_SECRET}@ghe.example.com/contoso/repo.git`;
    const gitError = `Command failed: git clone --depth=1 ${cloneUrl} /tmp/mcp-cr-abc\nfatal: repository not found`;

    const redacted = redactCloneSecret(gitError, cloneUrl);

    expect(redacted).not.toContain(PLANTED_SECRET);
    expect(redacted).toContain('***');
    expect(redacted).toContain('fatal: repository not found');
  });

  it('removes a GHE App x-access-token secret from a message', () => {
    const cloneUrl = `https://x-access-token:${PLANTED_SECRET}@ghe.example.com/contoso/repo.git`;
    const gitError = `Command failed: git clone --depth=1 ${cloneUrl} /tmp/x\nfatal: Authentication failed`;

    const redacted = redactCloneSecret(gitError, cloneUrl);

    expect(redacted).not.toContain(PLANTED_SECRET);
    expect(redacted).toContain('fatal: Authentication failed');
  });

  it('removes an Azure DevOps PAT from a message', () => {
    const cloneUrl = `https://${AZDO_PAT}@dev.azure.com/contoso/MyProject/_git/repo`;
    const gitError = `Command failed: git clone --depth=1 ${cloneUrl} /tmp/x`;

    expect(redactCloneSecret(gitError, cloneUrl)).not.toContain(AZDO_PAT);
  });

  it('leaves a message with no credential untouched', () => {
    const msg = 'Command failed: git clone --depth=1 https://ghe.example.com/contoso/repo.git /tmp/x';
    expect(redactCloneSecret(msg, 'https://ghe.example.com/contoso/repo.git')).toBe(msg);
  });
});

describe('redactSecret', () => {
  it('replaces every occurrence', () => {
    expect(redactSecret(`a ${AZDO_PAT} b ${AZDO_PAT}`, AZDO_PAT)).toBe('a *** b ***');
  });

  it('is a no-op for an empty secret', () => {
    expect(redactSecret('unchanged', '')).toBe('unchanged');
  });
});

describe('bearer-token clone - the token is an argument git echoes back, so it must be redacted too', () => {
  const BEARER = 'planted-entra-value-do-not-log';

  it('strips the bearer token from a failed clone, and never embeds it in the URL', async () => {
    const cm = new CloneManager();
    // A local path that cannot exist: git fails immediately, offline, echoing its full argv.
    const cloneUrl = '/nonexistent-repo-for-redaction-test.git';

    const error = await cm.clone(cloneUrl, { bearerToken: BEARER }).then(
      () => null,
      (e: Error) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain('Git clone failed');
    expect(error!.message).not.toContain(BEARER);
  });
});

describe('isTimeoutKill', () => {
  it('recognises the shape execFile reports when its timeout fires', () => {
    expect(isTimeoutKill(Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' }))).toBe(true);
  });

  it('does not claim a timeout for a process that exited on its own', () => {
    expect(isTimeoutKill(Object.assign(new Error('Command failed'), { killed: false, signal: null, code: 128 }))).toBe(false);
    expect(isTimeoutKill(new Error('plain'))).toBe(false);
    expect(isTimeoutKill(null)).toBe(false);
  });
});

/**
 * The defect these cover: a rejected credential left git free to fall back to an interactive
 * prompt. On a machine with a controlling terminal it blocked until the 120s timeout killed it,
 * and a killed git has printed only "Cloning into '<dir>'..." - so the authentication text
 * disappeared from the error, `describeCloneAuthFailure` had nothing to match, and the membership
 * hint silently stopped appearing. Reported from a live tenant as "the hint never shows and the
 * error says less than it used to".
 *
 * **A test process cannot prove the prompt is suppressed.** A vitest worker has no controlling
 * terminal, so git declines to prompt there whether or not the fix is present - a test driving a
 * real clone passes identically with the fix removed, which was verified rather than assumed. The
 * configuration assertions below are therefore the ones that invert; the live-git test that
 * follows covers the other half, the join between git's wording and the matcher.
 */
describe('clone subprocess is configured to run unattended', () => {
  it('refuses the interactive credential prompt and both askpass escapes', () => {
    expect(NON_INTERACTIVE_GIT_ENV.GIT_TERMINAL_PROMPT).toBe('0');
    expect(NON_INTERACTIVE_GIT_ENV.GIT_ASKPASS).toBe('');
    expect(NON_INTERACTIVE_GIT_ENV.SSH_ASKPASS).toBe('');
  });

  it('disables the machine credential helper, before the subcommand where -c is read', () => {
    const args = buildCloneArgs('https://dev.azure.com/contoso/P/_git/repo', '/tmp/x');
    const helperAt = args.indexOf('credential.helper=');
    expect(helperAt).toBeGreaterThan(0);
    expect(args[helperAt - 1]).toBe('-c');
    // `git -c ... clone`, never `git clone -c ...` - git reads -c only before the subcommand.
    expect(helperAt).toBeLessThan(args.indexOf('clone'));
  });

  it('still puts the bearer header before the subcommand, alongside the helper override', () => {
    const args = buildCloneArgs('https://dev.azure.com/contoso/P/_git/repo', '/tmp/x', { bearerToken: 'tok' });
    const headerAt = args.findIndex((a) => a.startsWith('http.extraHeader='));
    expect(headerAt).toBeGreaterThan(0);
    expect(args[headerAt - 1]).toBe('-c');
    expect(headerAt).toBeLessThan(args.indexOf('clone'));
  });
});

describe('a credential challenge produces a message the auth hint recognises', () => {
  /** Answers every request with the 401 challenge Azure DevOps presents once it rejects a token. */
  async function challengeServer(): Promise<{ port: number; close: () => Promise<void> }> {
    const server = createServer((_req, res) => {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return {
      port: (server.address() as AddressInfo).port,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  it('feeds git\'s own 401 wording to the real matcher, so the two halves cannot drift apart', async () => {
    const server = await challengeServer();
    try {
      const cm = new CloneManager();
      // Far below the 120s default: if the prompt were still reachable this would time out here,
      // and the assertion on the message would fail rather than the test hanging indefinitely.
      const error = await cm
        .clone(`http://127.0.0.1:${server.port}/contoso/repo.git`, { timeoutMs: 20_000 })
        .then(
          () => null,
          (e: Error) => e,
        );

      expect(error).toBeInstanceOf(Error);
      // git got as far as the credential challenge and refused to prompt for it.
      expect(error!.message).toMatch(/could not read Username|Authentication failed|terminal prompts disabled/i);
      // It exited on its own rather than being killed - no timeout note is attached.
      expect(error!.message).not.toContain('was terminated after');
      // The join: the message git actually produced must satisfy the matcher the hint keys on.
      expect(describeCloneAuthFailure('contoso', 'entra-id', error!.message)).toContain('not a member of organization');
    } finally {
      await server.close();
    }
  }, 40_000);
});
