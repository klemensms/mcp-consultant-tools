import axios, { AxiosError } from 'axios';
import type { Readable } from 'stream';
import type { AzureAuthProvider } from '../auth/AzureAuthProvider.js';

/**
 * Lightweight HTTP client for Kudu SCM API requests.
 * Uses the ARM bearer token which is valid for SCM endpoints.
 * Service principal needs Website Contributor role on the App Service.
 */
export class ScmClient {
  constructor(private authProvider: AzureAuthProvider) {}

  /**
   * Make an authenticated GET request to the Kudu SCM API (JSON response).
   */
  async get<T>(scmHostName: string, path: string): Promise<T> {
    const token = await this.authProvider.getArmToken();
    const url = `https://${scmHostName}${path}`;
    try {
      const response = await axios.get<T>(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, scmHostName, path);
    }
  }

  /**
   * GET request returning raw text (for log file contents).
   */
  async getText(scmHostName: string, path: string): Promise<string> {
    const token = await this.authProvider.getArmToken();
    const url = `https://${scmHostName}${path}`;
    try {
      const response = await axios.get<string>(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'text',
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, scmHostName, path);
    }
  }

  /**
   * GET request returning the raw response body as a stream, for endpoints that
   * stay open (`/api/logstream`). The caller owns the abort signal and must
   * abort, or the connection is held until the server closes it.
   */
  async getStream(
    scmHostName: string,
    path: string,
    options: { signal: AbortSignal; timeoutMs: number }
  ): Promise<Readable> {
    const token = await this.authProvider.getArmToken();
    const url = `https://${scmHostName}${path}`;
    try {
      const response = await axios.get<Readable>(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'stream',
        signal: options.signal,
        timeout: options.timeoutMs,
      });
      return response.data;
    } catch (error) {
      // The caller aborts on purpose to bound the read. Rethrow the cancellation
      // untouched so it stays recognisable, rather than flattening it into a
      // generic "SCM API error".
      if (axios.isCancel(error)) throw error;
      throw this.handleError(error, scmHostName, path);
    }
  }

  private handleError(error: unknown, host: string, path: string): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status === 401) {
        // `az webapp log tail` authenticates to Kudu with a token for the
        // `https://appservice.azure.com` audience, not the ARM audience this
        // client uses. If Kudu ever stops accepting ARM tokens, every SCM call
        // here 401s and this is the message that has to explain why.
        return new Error(`SCM authentication rejected for ${host}${path}. The Kudu endpoint did not accept the Azure Resource Manager access token.`);
      }
      if (status === 403) {
        return new Error(`SCM access denied for ${host}${path}. Ensure the service principal has Website Contributor role.`);
      }
      if (status === 404) {
        return new Error(`SCM endpoint not found: ${host}${path}. This log type may not be available for this app.`);
      }
      return new Error(`SCM API error: ${error.message} (status: ${status})`);
    }
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOTFOUND') {
      return new Error(`Could not reach the SCM endpoint for ${host}. Function Apps on Linux Consumption and Flex Consumption plans have no Kudu site, and an app with no running instance may not resolve.`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
