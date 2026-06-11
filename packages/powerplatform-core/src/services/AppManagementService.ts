/**
 * AppManagementService
 *
 * Service for app management operations (create, configure, publish).
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { auditLogger } from '../utils/auditLogger.js';
import { rateLimiter } from '../utils/rate-limiter.js';

interface SitemapArea {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  showGroups?: boolean;
  groups: SitemapGroup[];
}

interface SitemapGroup {
  id: string;
  title: string;
  description?: string;
  isProfile?: boolean;
  subareas: SitemapSubArea[];
}

interface SitemapSubArea {
  id: string;
  title: string;
  description?: string;
  entity?: string;
  url?: string;
  icon?: string;
  availableOffline?: boolean;
  passParams?: boolean;
}

interface SitemapConfig {
  name: string;
  areas: SitemapArea[];
  enableCollapsibleGroups?: boolean;
  showHome?: boolean;
  showPinned?: boolean;
  showRecents?: boolean;
}

export class AppManagementService {
  constructor(
    private client: PowerPlatformClient,
    private getAppSitemap: (
      appId: string
    ) => Promise<{ hasSitemap: boolean; sitemapid?: string; sitemapxml?: string }>
  ) {}

  /**
   * Escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  }

  /**
   * Create a simple sitemap
   */
  async createSimpleSitemap(
    config: SitemapConfig,
    solutionUniqueName?: string
  ): Promise<{
    sitemapId: string;
    sitemapName: string;
    sitemapXml: string;
    message: string;
  }> {
    const startTime = Date.now();

    try {
      // Generate sitemap XML
      let xml = '<SiteMap>';

      config.areas.forEach((area) => {
        xml += `<Area Id="${area.id}"`;
        if (area.icon) xml += ` Icon="${area.icon}"`;
        if (area.showGroups !== undefined) xml += ` ShowGroups="${area.showGroups}"`;
        xml += '>';
        xml += `<Titles><Title LCID="1033" Title="${this.escapeXml(area.title)}" /></Titles>`;
        if (area.description) {
          xml += `<Descriptions><Description LCID="1033" Description="${this.escapeXml(area.description)}" /></Descriptions>`;
        }

        area.groups.forEach((group) => {
          xml += `<Group Id="${group.id}"`;
          if (group.isProfile !== undefined) xml += ` IsProfile="${group.isProfile}"`;
          xml += '>';
          xml += `<Titles><Title LCID="1033" Title="${this.escapeXml(group.title)}" /></Titles>`;
          if (group.description) {
            xml += `<Descriptions><Description LCID="1033" Description="${this.escapeXml(group.description)}" /></Descriptions>`;
          }

          group.subareas.forEach((subarea) => {
            xml += `<SubArea Id="${subarea.id}"`;
            if (subarea.entity) xml += ` Entity="${subarea.entity}"`;
            if (subarea.url) xml += ` Url="${subarea.url}"`;
            if (subarea.icon) xml += ` Icon="${subarea.icon}"`;
            if (subarea.availableOffline !== undefined) {
              xml += ` AvailableOffline="${subarea.availableOffline}"`;
            }
            if (subarea.passParams !== undefined) {
              xml += ` PassParams="${subarea.passParams}"`;
            }
            xml += '>';
            xml += `<Titles><Title LCID="1033" Title="${this.escapeXml(subarea.title)}" /></Titles>`;
            if (subarea.description) {
              xml += `<Descriptions><Description LCID="1033" Description="${this.escapeXml(subarea.description)}" /></Descriptions>`;
            }
            xml += '</SubArea>';
          });

          xml += '</Group>';
        });

        xml += '</Area>';
      });

      xml += '</SiteMap>';

      const sitemapRequest = {
        sitemapname: config.name,
        sitemapxml: xml,
        isappaware: true,
        enablecollapsiblegroups: config.enableCollapsibleGroups ?? false,
        showhome: config.showHome ?? true,
        showpinned: config.showPinned ?? true,
        showrecents: config.showRecents ?? true,
      };

      const headers: Record<string, string> = {};
      if (solutionUniqueName) {
        headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
      }

      const response = await rateLimiter.execute(async () => {
        return await this.client.makeRequest<Record<string, unknown>>(
          'api/data/v9.2/sitemaps',
          'POST',
          sitemapRequest,
          headers
        );
      });

      const sitemapId = response.sitemapid as string;

      auditLogger.log({
        operation: 'createSimpleSitemap',
        operationType: 'CREATE',
        componentType: 'SiteMap',
        componentName: config.name,
        componentId: sitemapId,
        success: true,
        executionTimeMs: Date.now() - startTime,
      });

      return {
        sitemapId,
        sitemapName: config.name,
        sitemapXml: xml,
        message:
          'Sitemap created successfully. Add it to your app using add-entities-to-app.',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'createSimpleSitemap',
        operationType: 'CREATE',
        componentType: 'SiteMap',
        componentName: config.name,
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      });
      throw new Error(`Failed to create sitemap: ${errorMessage}`);
    }
  }

  /**
   * Add entities to an app
   */
  async addEntitiesToApp(
    appId: string,
    entityNames: string[]
  ): Promise<{
    appId: string;
    sitemapId: string;
    entitiesAdded: string[];
    message: string;
  }> {
    const startTime = Date.now();

    try {
      // Get app details
      const app = await this.client.makeRequest<Record<string, unknown>>(
        `api/data/v9.2/appmodules(${appId})?$select=appmoduleid,name,uniquename`
      );

      // Validate entities and get metadata
      const entityPromises = entityNames.map((name) =>
        this.client.makeRequest<Record<string, unknown>>(
          `api/data/v9.2/EntityDefinitions(LogicalName='${name}')?$select=LogicalName,DisplayName,MetadataId`
        )
      );
      const entities = await Promise.all(entityPromises);

      // Get the app's sitemap
      let sitemapInfo = await this.getAppSitemap(appId);

      // If not found via components, try to find by matching name
      if (!sitemapInfo.hasSitemap) {
        const sitemapQuery = await this.client.makeRequest<
          ApiCollectionResponse<Record<string, unknown>>
        >(
          `api/data/v9.2/sitemaps?$filter=sitemapnameunique eq '${app.uniquename}'&$select=sitemapid,sitemapname,sitemapnameunique,sitemapxml`
        );

        if (sitemapQuery.value.length > 0) {
          const sitemap = sitemapQuery.value[0];
          sitemapInfo = {
            hasSitemap: true,
            sitemapid: sitemap.sitemapid as string,
            sitemapxml: sitemap.sitemapxml as string,
          };
        } else {
          throw new Error(
            `App '${app.name}' does not have a sitemap. Cannot add entities without a sitemap.`
          );
        }
      }

      // Parse sitemap XML
      let sitemapXml = sitemapInfo.sitemapxml as string;

      // Check for or create Tables area
      const areaRegex = /<Area[^>]+Id="Area_Tables"[^>]*>/;
      const hasTablesArea = areaRegex.test(sitemapXml);

      if (!hasTablesArea) {
        const newArea = `
  <Area Id="Area_Tables" Title="Tables" ShowGroups="true">
    <Group Id="Group_Tables" Title="Custom Tables">
    </Group>
  </Area>`;
        sitemapXml = sitemapXml.replace('</SiteMap>', newArea + '\n</SiteMap>');
      }

      // Add SubArea elements for each entity
      for (const entity of entities) {
        const displayName =
          ((entity.DisplayName as Record<string, unknown>)
            ?.UserLocalizedLabel as Record<string, unknown>)?.Label ||
          (entity.LogicalName as string);
        const subAreaId = `SubArea_${entity.LogicalName}`;

        // Skip if already exists
        const subAreaRegex = new RegExp(`<SubArea[^>]+Id="${subAreaId}"[^>]*>`);
        if (subAreaRegex.test(sitemapXml)) {
          continue;
        }

        const newSubArea = `
      <SubArea Id="${subAreaId}" Entity="${entity.LogicalName}" Title="${displayName}" />`;

        sitemapXml = sitemapXml.replace(/<\/Group>/, newSubArea + '\n    </Group>');
      }

      // Update the sitemap
      await rateLimiter.execute(async () => {
        return await this.client.makeRequest(
          `api/data/v9.2/sitemaps(${sitemapInfo.sitemapid})`,
          'PATCH',
          { sitemapxml: sitemapXml }
        );
      });

      // Add entity components to app
      for (const entity of entities) {
        try {
          await rateLimiter.execute(async () => {
            return await this.client.makeRequest(
              `api/data/v9.2/appmodules(${appId})/appmodule_appmodulecomponent`,
              'POST',
              {
                componenttype: 1, // Entity
                objectid: entity.MetadataId,
              }
            );
          });
        } catch (componentError: unknown) {
          const errorMsg =
            componentError instanceof Error
              ? componentError.message
              : 'Unknown error';
          auditLogger.log({
            operation: 'addEntitiesToApp',
            operationType: 'CREATE',
            componentType: 'AppModuleComponent',
            componentName: entity.LogicalName as string,
            success: false,
            error: `Failed to add ${entity.LogicalName} as app component: ${errorMsg}`,
            executionTimeMs: Date.now() - startTime,
          });
        }
      }

      auditLogger.log({
        operation: 'addEntitiesToApp',
        operationType: 'UPDATE',
        componentType: 'AppModule',
        componentId: appId,
        success: true,
        executionTimeMs: Date.now() - startTime,
      });

      return {
        appId,
        sitemapId: sitemapInfo.sitemapid as string,
        entitiesAdded: entityNames,
        message: `Successfully added ${entityNames.length} entities to app sitemap. Remember to publish the app.`,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'addEntitiesToApp',
        operationType: 'UPDATE',
        componentType: 'AppModule',
        componentId: appId,
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      });
      throw new Error(`Failed to add entities to app: ${errorMessage}`);
    }
  }

  /**
   * Validate an app before publishing
   */
  async validateApp(appId: string): Promise<{
    appId: string;
    isValid: boolean;
    issueCount: number;
    issues: Array<{
      errorType: string;
      message: string;
      componentId: string;
      componentType: string;
    }>;
    message: string;
  }> {
    const response = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/ValidateApp(AppModuleId=${appId})`
    );

    const validationResponse = response.AppValidationResponse as Record<
      string,
      unknown
    >;
    const isValid = validationResponse.ValidationSuccess as boolean;
    const issues = (validationResponse.ValidationIssueList as unknown[]) || [];

    return {
      appId,
      isValid,
      issueCount: issues.length,
      issues: issues.map((issue: unknown) => {
        const i = issue as Record<string, unknown>;
        return {
          errorType: i.ErrorType as string,
          message: i.Message as string,
          componentId: i.ComponentId as string,
          componentType: i.ComponentType as string,
        };
      }),
      message: isValid
        ? 'App validation passed. Ready to publish.'
        : `App validation found ${issues.length} issue(s). Fix them before publishing.`,
    };
  }

  /**
   * Publish an app
   */
  async publishApp(
    appId: string,
    publishXml: (parameterXml: string) => Promise<void>
  ): Promise<{ appId: string; message: string }> {
    const startTime = Date.now();

    try {
      // First validate
      const validation = await this.validateApp(appId);
      if (!validation.isValid) {
        throw new Error(
          `Cannot publish app with validation errors: ${JSON.stringify(validation.issues)}`
        );
      }

      // Publish
      const parameterXml = `<importexportxml><appmodules><appmodule>${appId}</appmodule></appmodules></importexportxml>`;

      await rateLimiter.execute(async () => {
        return await publishXml(parameterXml);
      });

      auditLogger.log({
        operation: 'publishApp',
        operationType: 'PUBLISH',
        componentType: 'AppModule',
        componentId: appId,
        success: true,
        executionTimeMs: Date.now() - startTime,
      });

      return {
        appId,
        message:
          'App published successfully. It is now available to users with appropriate security roles.',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'publishApp',
        operationType: 'PUBLISH',
        componentType: 'AppModule',
        componentId: appId,
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      });
      throw new Error(`Failed to publish app: ${errorMessage}`);
    }
  }
}
