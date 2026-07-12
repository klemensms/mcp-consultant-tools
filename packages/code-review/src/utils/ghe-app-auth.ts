import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import axios from 'axios';

interface GheAppAuthOptions {
  appId: string;
  privateKey: string;
  installationId: string;
  gheApiBaseUrl: string;
}

export class GheAppAuth {
  private readonly appId: string;
  private readonly privateKey: string;
  private readonly installationId: string;
  private readonly gheApiBaseUrl: string;
  private installationToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(options: GheAppAuthOptions) {
    this.appId = options.appId;
    this.privateKey = options.privateKey;
    this.installationId = options.installationId;
    this.gheApiBaseUrl = options.gheApiBaseUrl;
  }

  async getToken(): Promise<string> {
    const currentTime = Date.now();
    if (this.installationToken && this.tokenExpirationTime > currentTime) {
      return this.installationToken;
    }

    const jwt = this.generateJwt();
    const response = await axios.post(
      `${this.gheApiBaseUrl}/app/installations/${this.installationId}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    this.installationToken = response.data.token as string;
    // Set expiration time (subtract 5 minutes to refresh early)
    const expiresAt = new Date(response.data.expires_at as string).getTime();
    this.tokenExpirationTime = expiresAt - 5 * 60 * 1000;

    return this.installationToken;
  }

  private generateJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iat: now - 60, // 60s clock skew allowance
      exp: now + 10 * 60, // 10-minute expiry
      iss: this.appId,
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const sign = createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(this.privateKey, 'base64url');

    return `${signingInput}.${signature}`;
  }
}

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function resolvePrivateKey(keyPath?: string, keyInline?: string): Promise<string> {
  if (keyPath) {
    return (await readFile(keyPath, 'utf-8')).trim();
  }
  if (keyInline) {
    return keyInline.replace(/\\n/g, '\n');
  }
  throw new Error(
    'GitHub App private key is required. Set GHE_PRIVATE_KEY_PATH or GHE_PRIVATE_KEY.',
  );
}
