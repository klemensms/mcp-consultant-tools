/**
 * PublishingService
 *
 * Service for publishing customizations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class PublishingService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Publish all customizations
   */
  async publishAllCustomizations(): Promise<void> {
    await this.client.makeRequest('api/data/v9.2/PublishAllXml', 'POST', {});
  }

  /**
   * Publish specific customizations
   */
  async publishXml(parameterXml: string): Promise<void> {
    await this.client.makeRequest('api/data/v9.2/PublishXml', 'POST', {
      ParameterXml: parameterXml,
    });
  }

  /**
   * Publish specific entity
   */
  async publishEntity(entityLogicalName: string): Promise<void> {
    const parameterXml = `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>`;
    await this.publishXml(parameterXml);
  }

  /**
   * Publish specific component
   */
  async publishComponent(
    componentId: string,
    componentType: number
  ): Promise<void> {
    const typeMap: Record<number, string> = {
      1: 'entity',
      2: 'attribute',
      9: 'optionset',
      24: 'form',
      26: 'savedquery',
      29: 'workflow',
      60: 'systemform',
      61: 'webresource',
    };

    const componentTypeName = typeMap[componentType] || 'component';
    const parameterXml = `<importexportxml><${componentTypeName}s><${componentTypeName}>${componentId}</${componentTypeName}></${componentTypeName}s></importexportxml>`;
    await this.publishXml(parameterXml);
  }

  /**
   * Check for unpublished customizations
   */
  async checkUnpublishedChanges(): Promise<unknown> {
    return this.client.makeRequest(
      'api/data/v9.2/RetrieveUnpublished',
      'POST',
      {}
    );
  }

  /**
   * Preview unpublished changes
   * Returns all components that have unpublished customizations
   */
  async previewUnpublishedChanges(): Promise<unknown> {
    return this.client.makeRequest(
      'api/data/v9.2/RetrieveUnpublished',
      'POST',
      {}
    );
  }
}
