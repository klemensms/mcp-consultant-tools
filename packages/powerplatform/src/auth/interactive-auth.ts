/**
 * Interactive Authentication Provider
 *
 * Uses PublicClientApplication (authorization code flow with PKCE)
 * for browser-based SSO authentication.
 *
 * Flow:
 * 1. Try silent auth using cached tokens
 * 2. If no cached token or token expired, open browser for login
 * 3. User authenticates via Microsoft Entra ID (SSO if already signed in)
 * 4. Receive authorization code via localhost redirect
 * 5. Exchange code for tokens
 * 6. Cache tokens for future use
 */

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-node';
import http from 'node:http';
import open from 'open';
import type { AuthProvider } from './index.js';
import { TokenCache } from './token-cache.js';

export interface InteractiveAuthConfig {
  organizationUrl: string;
  clientId: string;
  tenantId: string;
}

export class InteractiveAuth implements AuthProvider {
  private config: InteractiveAuthConfig;
  private pca: PublicClientApplication;
  private tokenCache: TokenCache;
  private cachedAccount: AccountInfo | null = null;

  constructor(config: InteractiveAuthConfig) {
    this.config = config;
    this.tokenCache = new TokenCache(config.clientId);

    this.pca = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
      cache: {
        cachePlugin: this.tokenCache.createPlugin(),
      },
    });
  }

  getAuthMode(): 'service-principal' | 'interactive' {
    return 'interactive';
  }

  async getAccessToken(resource: string): Promise<string> {
    // Try silent auth first (uses cached tokens)
    const accounts = await this.pca.getTokenCache().getAllAccounts();

    if (accounts.length > 0) {
      try {
        const result = await this.pca.acquireTokenSilent({
          account: accounts[0],
          scopes: [`${resource}/.default`],
        });
        this.cachedAccount = accounts[0];
        return result.accessToken;
      } catch (error) {
        if (!(error instanceof InteractionRequiredAuthError)) {
          throw error;
        }
        // Token expired or revoked, need interactive auth
        console.error('Cached token expired, re-authenticating...');
      }
    }

    // Interactive auth required
    return this.acquireTokenInteractive(resource);
  }

  async getUserInfo(): Promise<{ name: string; email: string; oid: string } | null> {
    if (!this.cachedAccount) {
      const accounts = await this.pca.getTokenCache().getAllAccounts();
      this.cachedAccount = accounts[0] || null;
    }

    if (!this.cachedAccount) {
      return null;
    }

    return {
      name: this.cachedAccount.name || 'Unknown',
      email: this.cachedAccount.username || 'Unknown',
      oid: this.cachedAccount.localAccountId || '',
    };
  }

  async clearCache(): Promise<void> {
    this.tokenCache.clear();
    this.cachedAccount = null;
  }

  /**
   * Acquire token via browser-based interactive flow
   */
  private async acquireTokenInteractive(resource: string): Promise<string> {
    const port = await this.findFreePort();
    const redirectUri = `http://localhost:${port}`;

    return new Promise((resolve, reject) => {
      let serverClosed = false;

      const server = http.createServer(async (req, res) => {
        if (serverClosed) return;

        try {
          const url = new URL(req.url!, `http://localhost:${port}`);

          if (url.pathname === '/') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const errorDescription = url.searchParams.get('error_description');

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getErrorHtml(error, errorDescription || 'Unknown error'));
              serverClosed = true;
              server.close();
              reject(new Error(`Authentication failed: ${error} - ${errorDescription}`));
              return;
            }

            if (code) {
              try {
                const result = await this.pca.acquireTokenByCode({
                  code,
                  scopes: [`${resource}/.default`, 'offline_access'],
                  redirectUri,
                });

                this.cachedAccount = result.account;

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(this.getSuccessHtml(result));

                serverClosed = true;
                server.close();
                resolve(result.accessToken);
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(this.getErrorHtml('token_exchange_failed', (err as Error).message));
                serverClosed = true;
                server.close();
                reject(err);
              }
              return;
            }

            // No code or error, show waiting page
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.getWaitingHtml());
          }
        } catch (err) {
          console.error('Error handling callback:', err);
          if (!serverClosed) {
            serverClosed = true;
            server.close();
            reject(err);
          }
        }
      });

      server.on('error', (err) => {
        reject(new Error(`Failed to start callback server: ${err.message}`));
      });

      server.listen(port, async () => {
        try {
          const authUrl = await this.pca.getAuthCodeUrl({
            scopes: [`${resource}/.default`, 'offline_access', 'openid'],
            redirectUri,
          });

          console.error('');
          console.error('🔐 Authentication required');
          console.error('   Opening browser for sign-in...');
          console.error(`   If browser doesn't open, visit: ${authUrl.substring(0, 80)}...`);
          console.error('');

          await open(authUrl);
        } catch (err) {
          serverClosed = true;
          server.close();
          reject(err);
        }
      });

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        if (!serverClosed) {
          serverClosed = true;
          server.close();
          reject(new Error('Authentication timed out after 5 minutes'));
        }
      }, 5 * 60 * 1000);

      server.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Find an available port for the callback server
   */
  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      server.on('error', reject);
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          const port = address.port;
          server.close(() => resolve(port));
        } else {
          reject(new Error('Failed to get port'));
        }
      });
    });
  }

  /**
   * HTML page shown after successful authentication
   */
  private getSuccessHtml(result: AuthenticationResult): string {
    const userName = result.account?.name || 'User';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      text-align: center;
      max-width: 400px;
    }
    .checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #10b981;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 1.5rem;
    }
    .checkmark svg {
      width: 40px;
      height: 40px;
      fill: white;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }
    p {
      color: #6b7280;
      margin: 0.5rem 0;
    }
    .user {
      color: #374151;
      font-weight: 600;
    }
    .close-note {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #f3f4f6;
      border-radius: 8px;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    </div>
    <h1>Authentication Successful</h1>
    <p>Welcome, <span class="user">${this.escapeHtml(userName)}</span>!</p>
    <p>You are now connected to PowerPlatform.</p>
    <div class="close-note">
      You can close this window and return to your application.
    </div>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`;
  }

  /**
   * HTML page shown when authentication fails
   */
  private getErrorHtml(error: string, description: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      text-align: center;
      max-width: 500px;
    }
    .error-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #ef4444;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 1.5rem;
    }
    .error-icon svg {
      width: 40px;
      height: 40px;
      fill: white;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 1rem;
      font-size: 1.5rem;
    }
    .error-code {
      background: #fef2f2;
      color: #991b1b;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-family: monospace;
      margin-bottom: 1rem;
    }
    p {
      color: #6b7280;
      margin: 0.5rem 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </div>
    <h1>Authentication Failed</h1>
    <div class="error-code">${this.escapeHtml(error)}</div>
    <p>${this.escapeHtml(description)}</p>
    <p style="margin-top: 1.5rem;">Please close this window and try again.</p>
  </div>
</body>
</html>`;
  }

  /**
   * HTML page shown while waiting for callback
   */
  private getWaitingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authenticating...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      text-align: center;
    }
    .spinner {
      width: 60px;
      height: 60px;
      border: 4px solid #e5e7eb;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h1 {
      color: #1f2937;
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }
    p {
      color: #6b7280;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Authenticating...</h1>
    <p>Please complete sign-in in the browser window.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
