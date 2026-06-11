/**
 * Azure B2C Graph API client
 *
 * Handles authentication, client setup, response mapping, and error enhancement.
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import type { AzureB2CConfig, B2CUser, B2CGroup } from './models/index.js';

export class B2CClient {
  private config: AzureB2CConfig;
  private graphClient: Client | null = null;
  private credential: ClientSecretCredential | null = null;

  constructor(config: AzureB2CConfig) {
    this.config = {
      maxResults: 100,
      cacheUsersTTL: 300,
      ...config,
    };

    if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'Azure B2C requires tenantId, clientId, and clientSecret configuration'
      );
    }
  }

  /** Get the resolved config */
  getConfig(): AzureB2CConfig {
    return this.config;
  }

  /** Get or create the Microsoft Graph client */
  getClient(): Client {
    if (!this.graphClient) {
      this.credential = new ClientSecretCredential(
        this.config.tenantId,
        this.config.clientId,
        this.config.clientSecret
      );

      const authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      this.graphClient = Client.initWithMiddleware({
        authProvider,
      });
    }

    return this.graphClient;
  }

  /** Check if operation is permitted */
  checkPermission(operation: string, enabled: boolean): void {
    if (!enabled) {
      throw new Error(
        `${operation} is not enabled. ` +
          `Set the appropriate environment variable to enable this operation.`
      );
    }
  }

  /** Map Graph API user response to B2CUser */
  mapUserResponse(response: any): B2CUser {
    return {
      id: response.id,
      displayName: response.displayName,
      givenName: response.givenName,
      surname: response.surname,
      userPrincipalName: response.userPrincipalName,
      mail: response.mail,
      otherMails: response.otherMails,
      identities: response.identities,
      accountEnabled: response.accountEnabled,
      createdDateTime: response.createdDateTime,
      jobTitle: response.jobTitle,
      department: response.department,
      mobilePhone: response.mobilePhone,
      city: response.city,
      country: response.country,
    };
  }

  /** Map array of Graph API user responses */
  mapUsersResponse(responses: any[]): B2CUser[] {
    return responses.map((r) => this.mapUserResponse(r));
  }

  /** Map Graph API group response to B2CGroup */
  mapGroupResponse(response: any): B2CGroup {
    return {
      id: response.id,
      displayName: response.displayName,
      description: response.description,
      mailEnabled: response.mailEnabled,
      securityEnabled: response.securityEnabled,
    };
  }

  /** Map array of Graph API group responses */
  mapGroupsResponse(responses: any[]): B2CGroup[] {
    return responses.map((r) => this.mapGroupResponse(r));
  }

  /** Enhance error with helpful context */
  enhanceError(error: any, operation: string): Error {
    const message = error.message || String(error);

    if (error.statusCode === 401 || message.includes('Unauthorized')) {
      return new Error(
        `Unauthorized to ${operation}. ` +
          `Verify app registration has correct API permissions (User.ReadWrite.All) ` +
          `and "User Administrator" role assignment. ` +
          `Original error: ${message}`
      );
    }

    if (error.statusCode === 403 || message.includes('Forbidden')) {
      return new Error(
        `Forbidden to ${operation}. ` +
          `The app may lack required permissions or role assignments. ` +
          `Original error: ${message}`
      );
    }

    if (error.statusCode === 404 || message.includes('Request_ResourceNotFound')) {
      return new Error(
        `Resource not found when attempting to ${operation}. ` +
          `Verify the user/group ID is correct. ` +
          `Original error: ${message}`
      );
    }

    if (message.includes('Invalid password')) {
      return new Error(
        `Invalid password format. Password must meet Azure AD B2C complexity requirements: ` +
          `8-256 characters, at least 3 of: lowercase, uppercase, digit, symbol. ` +
          `Original error: ${message}`
      );
    }

    return new Error(`Failed to ${operation}: ${message}`);
  }
}
