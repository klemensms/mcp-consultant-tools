/**
 * AppService
 *
 * Read-only service for model-driven apps in Dynamics 365.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';

export class AppService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all model-driven apps in the environment
   */
  async getApps(
    activeOnly: boolean = false,
    maxRecords: number = 100,
    includeUnpublished: boolean = true,
    solutionUniqueName?: string
  ): Promise<{
    totalCount: number;
    apps: unknown[];
    filters: {
      activeOnly: boolean;
      includeUnpublished: boolean;
      solutionUniqueName: string;
    };
  }> {
    // Build filter conditions
    const filters: string[] = [];

    // StateCode: 0=Active, 1=Inactive
    if (activeOnly) {
      filters.push('statecode eq 0');
    }

    // Published status: publishedon null = unpublished
    if (!includeUnpublished) {
      filters.push('publishedon ne null');
    }

    const filterString =
      filters.length > 0 ? `&$filter=${filters.join(' and ')}` : '';

    const apps = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/appmodules?$select=appmoduleid,name,uniquename,description,webresourceid,clienttype,formfactor,navigationtype,url,isfeatured,isdefault,publishedon,statecode,statuscode,_publisherid_value,createdon,modifiedon&$orderby=modifiedon desc&$top=${maxRecords}${filterString}`
    );

    // If solution filter specified, filter results by solution
    let filteredApps = apps.value;
    if (solutionUniqueName) {
      // Query solution components to find apps in the specified solution
      const solution = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid`
      );

      if (solution.value.length > 0) {
        const solutionId = solution.value[0].solutionid as string;

        // Query solution components for app modules
        const solutionComponents = await this.client.makeRequest<
          ApiCollectionResponse<Record<string, unknown>>
        >(
          `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solutionId} and componenttype eq 80&$select=objectid`
        );

        const appIdsInSolution = new Set(
          solutionComponents.value.map((c) =>
            (c.objectid as string).toLowerCase()
          )
        );
        filteredApps = apps.value.filter((app) =>
          appIdsInSolution.has((app.appmoduleid as string).toLowerCase())
        );
      }
    }

    // Format the results for better readability
    const formattedApps = filteredApps.map((app) => ({
      appmoduleid: app.appmoduleid,
      name: app.name,
      uniquename: app.uniquename,
      description: app.description,
      webresourceid: app.webresourceid,
      clienttype: app.clienttype,
      formfactor: app.formfactor,
      navigationtype: app.navigationtype,
      url: app.url,
      isfeatured: app.isfeatured,
      isdefault: app.isdefault,
      state: app.statecode === 0 ? 'Active' : 'Inactive',
      statecode: app.statecode,
      statuscode: app.statuscode,
      publishedon: app.publishedon,
      published: app.publishedon ? true : false,
      publisherid: app._publisherid_value || null,
      createdon: app.createdon,
      modifiedon: app.modifiedon,
    }));

    return {
      totalCount: formattedApps.length,
      apps: formattedApps,
      filters: {
        activeOnly,
        includeUnpublished,
        solutionUniqueName: solutionUniqueName || 'all',
      },
    };
  }

  /**
   * Get a specific model-driven app by ID
   */
  async getApp(appId: string): Promise<unknown> {
    const app = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/appmodules(${appId})?$select=appmoduleid,name,uniquename,description,webresourceid,clienttype,formfactor,navigationtype,url,isfeatured,isdefault,publishedon,statecode,statuscode,configxml,createdon,modifiedon,_publisherid_value,_createdby_value,_modifiedby_value`
    );

    return {
      appmoduleid: app.appmoduleid,
      name: app.name,
      uniquename: app.uniquename,
      description: app.description,
      webresourceid: app.webresourceid,
      clienttype: app.clienttype,
      formfactor: app.formfactor,
      navigationtype: app.navigationtype === 0 ? 'Single Session' : 'Multi Session',
      url: app.url,
      isfeatured: app.isfeatured,
      isdefault: app.isdefault,
      state: app.statecode === 0 ? 'Active' : 'Inactive',
      statecode: app.statecode,
      statuscode: app.statuscode,
      publishedon: app.publishedon,
      createdon: app.createdon,
      modifiedon: app.modifiedon,
      createdBy: app._createdby_value || null,
      modifiedBy: app._modifiedby_value || null,
      publisherid: app._publisherid_value || null,
    };
  }

  /**
   * Get all components (entities, forms, views, sitemaps) associated with an app
   */
  async getAppComponents(appId: string): Promise<{
    totalCount: number;
    components: unknown[];
    groupedByType: Record<string, unknown[]>;
  }> {
    const components = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/appmodulecomponents?$filter=_appmoduleidunique_value eq ${appId}&$select=appmodulecomponentid,objectid,componenttype,rootappmodulecomponentid,createdon,modifiedon&$orderby=componenttype asc`
    );

    // Map component type numbers to friendly names
    const componentTypeMap: { [key: number]: string } = {
      1: 'Entity',
      24: 'Form',
      26: 'View',
      29: 'Business Process Flow',
      48: 'Ribbon Command',
      59: 'Chart/Dashboard',
      60: 'System Form',
      62: 'SiteMap',
    };

    const formattedComponents = components.value.map((component) => ({
      appmodulecomponentid: component.appmodulecomponentid,
      objectid: component.objectid,
      componenttype: component.componenttype,
      componenttypeName:
        componentTypeMap[component.componenttype as number] ||
        `Unknown (${component.componenttype})`,
      rootappmodulecomponentid: component.rootappmodulecomponentid,
      createdon: component.createdon,
      modifiedon: component.modifiedon,
    }));

    // Group by component type for easier reading
    const groupedByType: Record<string, unknown[]> = {};
    formattedComponents.forEach((comp) => {
      const typeName = comp.componenttypeName;
      if (!groupedByType[typeName]) {
        groupedByType[typeName] = [];
      }
      groupedByType[typeName].push(comp);
    });

    return {
      totalCount: formattedComponents.length,
      components: formattedComponents,
      groupedByType,
    };
  }

  /**
   * Get the sitemap for a specific app
   */
  async getAppSitemap(appId: string): Promise<unknown> {
    // First get the app components to find the sitemap
    const components = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/appmodulecomponents?$filter=_appmoduleidunique_value eq ${appId} and componenttype eq 62&$select=objectid`
    );

    if (components.value.length === 0) {
      return {
        hasSitemap: false,
        message: 'No sitemap found for this app',
      };
    }

    // Get the sitemap details
    const sitemapId = components.value[0].objectid;
    const sitemap = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/sitemaps(${sitemapId})?$select=sitemapid,sitemapname,sitemapnameunique,sitemapxml,isappaware,enablecollapsiblegroups,showhome,showpinned,showrecents,ismanaged,createdon,modifiedon`
    );

    return {
      hasSitemap: true,
      sitemapid: sitemap.sitemapid,
      sitemapname: sitemap.sitemapname,
      sitemapnameunique: sitemap.sitemapnameunique,
      sitemapxml: sitemap.sitemapxml,
      isappaware: sitemap.isappaware,
      enablecollapsiblegroups: sitemap.enablecollapsiblegroups,
      showhome: sitemap.showhome,
      showpinned: sitemap.showpinned,
      showrecents: sitemap.showrecents,
      ismanaged: sitemap.ismanaged,
      createdon: sitemap.createdon,
      modifiedon: sitemap.modifiedon,
    };
  }
}
