import { describe, it, expect } from 'vitest';
import { CloneManager, redactCloneSecret } from '../clone-manager.js';

// Distinctive low-entropy placeholders (readable, hyphenated) so the redaction assertions have
// something unmistakable to look for without embedding a credential-shaped string in the repo.
const PLANTED_SECRET = 'planted-ghe-value-do-not-log';
const AZDO_PAT = 'planted-azdo-value-do-not-log';

describe('clone URL builders', () => {
  const cm = new CloneManager();

  it('builds an Azure DevOps clone URL with the PAT as userinfo', () => {
    expect(cm.buildAzdoCloneUrl('contoso', 'MyProject', 'repo', AZDO_PAT)).toBe(
      `https://${AZDO_PAT}@dev.azure.com/contoso/MyProject/_git/repo`,
    );
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

describe('redactCloneSecret — the embedded credential must never survive into an error', () => {
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
