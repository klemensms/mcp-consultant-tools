import axios, { AxiosError } from 'axios';
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

  private handleError(error: unknown, host: string, path: string): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status === 403) {
        return new Error(`SCM access denied for ${host}${path}. Ensure the service principal has Website Contributor role.`);
      }
      if (status === 404) {
        return new Error(`SCM endpoint not found: ${host}${path}. This log type may not be available for this app.`);
      }
      return new Error(`SCM API error: ${error.message} (status: ${status})`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
