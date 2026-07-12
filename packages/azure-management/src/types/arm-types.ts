/**
 * ARM API response types for Azure Management.
 */

/**
 * Standard ARM resource structure.
 */
export interface ArmResource {
  id: string;
  name: string;
  type: string;
  kind?: string;
  location: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  sku?: {
    name: string;
    tier?: string;
    capacity?: number;
    family?: string;
    size?: string;
  };
  identity?: {
    type: string;
    principalId?: string;
    tenantId?: string;
    userAssignedIdentities?: Record<string, unknown>;
  };
  plan?: {
    name: string;
    publisher: string;
    product: string;
    promotionCode?: string;
  };
  managedBy?: string;
  zones?: string[];
}

/**
 * ARM list response wrapper.
 */
export interface ArmListResponse<T> {
  value: T[];
  nextLink?: string;
}

/**
 * ARM error response.
 */
export interface ArmError {
  error: {
    code: string;
    message: string;
    target?: string;
    details?: Array<{
      code: string;
      message: string;
    }>;
  };
}

/**
 * Resource group.
 */
export interface ResourceGroup {
  id: string;
  name: string;
  location: string;
  tags?: Record<string, string>;
  properties?: {
    provisioningState: string;
  };
  managedBy?: string;
}

/**
 * Function App / App Service (Microsoft.Web/sites).
 */
export interface WebSite extends ArmResource {
  properties?: {
    state?: string;
    hostNames?: string[];
    defaultHostName?: string;
    hostNameSslStates?: Array<{
      name: string;
      sslState: string;
      hostType: string;
    }>;
    serverFarmId?: string;
    reserved?: boolean;
    isXenon?: boolean;
    hyperV?: boolean;
    lastModifiedTimeUtc?: string;
    storageAccountRequired?: boolean;
    virtualNetworkSubnetId?: string;
    keyVaultReferenceIdentity?: string;
    httpsOnly?: boolean;
    siteConfig?: SiteConfig;
    outboundIpAddresses?: string;
    possibleOutboundIpAddresses?: string;
    containerSize?: number;
    dailyMemoryTimeQuota?: number;
    clientCertEnabled?: boolean;
    clientCertMode?: string;
    clientAffinityEnabled?: boolean;
    hostingEnvironmentProfile?: {
      id: string;
    };
    publicNetworkAccess?: string;
    storageAccountUrl?: string;
    ftpUsername?: string;
    ftpsHostName?: string;
  };
}

/**
 * Site configuration.
 */
export interface SiteConfig {
  numberOfWorkers?: number;
  defaultDocuments?: string[];
  netFrameworkVersion?: string;
  phpVersion?: string;
  pythonVersion?: string;
  nodeVersion?: string;
  powerShellVersion?: string;
  linuxFxVersion?: string;
  windowsFxVersion?: string;
  requestTracingEnabled?: boolean;
  requestTracingExpirationTime?: string;
  remoteDebuggingEnabled?: boolean;
  remoteDebuggingVersion?: string;
  httpLoggingEnabled?: boolean;
  detailedErrorLoggingEnabled?: boolean;
  publishingUsername?: string;
  appSettings?: Array<{ name: string; value: string }>;
  connectionStrings?: Array<{
    name: string;
    connectionString: string;
    type: string;
  }>;
  use32BitWorkerProcess?: boolean;
  webSocketsEnabled?: boolean;
  alwaysOn?: boolean;
  javaVersion?: string;
  javaContainer?: string;
  javaContainerVersion?: string;
  appCommandLine?: string;
  managedPipelineMode?: string;
  virtualApplications?: Array<{
    virtualPath: string;
    physicalPath: string;
    preloadEnabled?: boolean;
  }>;
  loadBalancing?: string;
  autoHealEnabled?: boolean;
  vnetName?: string;
  vnetRouteAllEnabled?: boolean;
  vnetPrivatePortsCount?: number;
  cors?: {
    allowedOrigins?: string[];
    supportCredentials?: boolean;
  };
  ipSecurityRestrictions?: Array<{
    ipAddress?: string;
    action?: string;
    priority?: number;
    name?: string;
  }>;
  scmIpSecurityRestrictions?: Array<{
    ipAddress?: string;
    action?: string;
    priority?: number;
    name?: string;
  }>;
  scmIpSecurityRestrictionsUseMain?: boolean;
  http20Enabled?: boolean;
  minTlsVersion?: string;
  scmMinTlsVersion?: string;
  ftpsState?: string;
  preWarmedInstanceCount?: number;
  functionAppScaleLimit?: number;
  healthCheckPath?: string;
  functionsRuntimeScaleMonitoringEnabled?: boolean;
  websiteTimeZone?: string;
  minimumElasticInstanceCount?: number;
  azureStorageAccounts?: Record<string, unknown>;
  publicNetworkAccess?: string;
}

/**
 * Function within a Function App.
 */
export interface FunctionEnvelope {
  id: string;
  name: string;
  type: string;
  properties?: {
    function_app_id?: string;
    script_root_path_href?: string;
    script_href?: string;
    config_href?: string;
    test_data_href?: string;
    secrets_file_href?: string;
    href?: string;
    config?: {
      bindings?: Array<{
        type: string;
        direction: string;
        name: string;
        [key: string]: unknown;
      }>;
      disabled?: boolean;
      scriptFile?: string;
      entryPoint?: string;
    };
    files?: Record<string, string>;
    test_data?: string;
    invoke_url_template?: string;
    language?: string;
    isDisabled?: boolean;
  };
}

/**
 * Function/Host keys.
 */
export interface FunctionKeys {
  keys?: Array<{
    name: string;
    value: string;
  }>;
  functionKeys?: Array<{
    name: string;
    value: string;
  }>;
  systemKeys?: Array<{
    name: string;
    value: string;
  }>;
}

/**
 * App Service Plan (Microsoft.Web/serverfarms).
 */
export interface AppServicePlan extends ArmResource {
  properties?: {
    workerTierName?: string;
    status?: string;
    subscription?: string;
    hostingEnvironmentProfile?: {
      id: string;
    };
    maximumNumberOfWorkers?: number;
    geoRegion?: string;
    perSiteScaling?: boolean;
    elasticScaleEnabled?: boolean;
    maximumElasticWorkerCount?: number;
    numberOfSites?: number;
    isSpot?: boolean;
    spotExpirationTime?: string;
    freeOfferExpirationTime?: string;
    resourceGroup?: string;
    reserved?: boolean;
    isXenon?: boolean;
    hyperV?: boolean;
    mdmId?: string;
    targetWorkerCount?: number;
    targetWorkerSizeId?: number;
    provisioningState?: string;
    zoneRedundant?: boolean;
  };
}

/**
 * Key Vault (Microsoft.KeyVault/vaults).
 */
export interface KeyVault extends ArmResource {
  properties?: {
    tenantId?: string;
    sku?: {
      family: string;
      name: string;
    };
    accessPolicies?: Array<{
      tenantId: string;
      objectId: string;
      permissions: {
        keys?: string[];
        secrets?: string[];
        certificates?: string[];
        storage?: string[];
      };
    }>;
    vaultUri?: string;
    enabledForDeployment?: boolean;
    enabledForDiskEncryption?: boolean;
    enabledForTemplateDeployment?: boolean;
    enableSoftDelete?: boolean;
    softDeleteRetentionInDays?: number;
    enableRbacAuthorization?: boolean;
    enablePurgeProtection?: boolean;
    networkAcls?: {
      defaultAction: string;
      bypass: string;
      ipRules?: Array<{ value: string }>;
      virtualNetworkRules?: Array<{ id: string }>;
    };
    publicNetworkAccess?: string;
    provisioningState?: string;
  };
}

/**
 * Key Vault secret metadata (data plane response).
 */
export interface KeyVaultSecretItem {
  id: string;
  attributes: {
    enabled: boolean;
    created: number;
    updated: number;
    recoveryLevel: string;
    recoverableDays?: number;
  };
  tags?: Record<string, string>;
  contentType?: string;
  managed?: boolean;
}

/**
 * Storage Account (Microsoft.Storage/storageAccounts).
 */
export interface StorageAccount extends ArmResource {
  properties?: {
    primaryEndpoints?: {
      blob?: string;
      queue?: string;
      table?: string;
      file?: string;
      web?: string;
      dfs?: string;
    };
    primaryLocation?: string;
    statusOfPrimary?: string;
    secondaryLocation?: string;
    statusOfSecondary?: string;
    creationTime?: string;
    customDomain?: {
      name: string;
      useSubDomainName?: boolean;
    };
    secondaryEndpoints?: {
      blob?: string;
      queue?: string;
      table?: string;
    };
    encryption?: {
      services?: {
        blob?: { enabled: boolean; lastEnabledTime?: string };
        file?: { enabled: boolean; lastEnabledTime?: string };
        table?: { enabled: boolean; lastEnabledTime?: string };
        queue?: { enabled: boolean; lastEnabledTime?: string };
      };
      keySource: string;
      keyVaultProperties?: {
        keyName: string;
        keyVersion: string;
        keyVaultUri: string;
      };
    };
    accessTier?: string;
    provisioningState?: string;
    supportsHttpsTrafficOnly?: boolean;
    networkAcls?: {
      bypass: string;
      virtualNetworkRules?: Array<{ id: string; action?: string }>;
      ipRules?: Array<{ value: string; action?: string }>;
      defaultAction: string;
    };
    isHnsEnabled?: boolean;
    isNfsV3Enabled?: boolean;
    allowBlobPublicAccess?: boolean;
    allowSharedKeyAccess?: boolean;
    minimumTlsVersion?: string;
    allowCrossTenantReplication?: boolean;
    publicNetworkAccess?: string;
  };
}

/**
 * SQL Server (Microsoft.Sql/servers).
 */
export interface SqlServer extends ArmResource {
  properties?: {
    administratorLogin?: string;
    version?: string;
    state?: string;
    fullyQualifiedDomainName?: string;
    privateEndpointConnections?: Array<{
      id: string;
      properties: {
        privateEndpoint: { id: string };
        privateLinkServiceConnectionState: {
          status: string;
          description?: string;
        };
      };
    }>;
    minimalTlsVersion?: string;
    publicNetworkAccess?: string;
    workspaceFeature?: string;
    primaryUserAssignedIdentityId?: string;
    federatedClientId?: string;
    keyId?: string;
    administrators?: {
      administratorType: string;
      principalType?: string;
      login: string;
      sid: string;
      tenantId?: string;
      azureADOnlyAuthentication?: boolean;
    };
    restrictOutboundNetworkAccess?: string;
  };
}

/**
 * SQL Database (Microsoft.Sql/servers/databases).
 */
export interface SqlDatabase extends ArmResource {
  properties?: {
    collation?: string;
    maxSizeBytes?: number;
    status?: string;
    databaseId?: string;
    creationDate?: string;
    currentServiceObjectiveName?: string;
    requestedServiceObjectiveName?: string;
    defaultSecondaryLocation?: string;
    catalogCollation?: string;
    zoneRedundant?: boolean;
    licenseType?: string;
    maxLogSizeBytes?: number;
    earliestRestoreDate?: string;
    readScale?: string;
    highAvailabilityReplicaCount?: number;
    secondaryType?: string;
    currentSku?: {
      name: string;
      tier?: string;
      capacity?: number;
    };
    autoPauseDelay?: number;
    currentBackupStorageRedundancy?: string;
    requestedBackupStorageRedundancy?: string;
    minCapacity?: number;
    pausedDate?: string;
    resumedDate?: string;
    maintenanceConfigurationId?: string;
    isLedgerOn?: boolean;
    isInfraEncryptionEnabled?: boolean;
    federatedClientId?: string;
    preferredEnclaveType?: string;
  };
}

/**
 * Metric Alert Rule (Microsoft.Insights/metricAlerts).
 */
export interface MetricAlertRule extends ArmResource {
  properties?: {
    description?: string;
    severity?: number;
    enabled?: boolean;
    scopes?: string[];
    evaluationFrequency?: string;
    windowSize?: string;
    criteria?: {
      'odata.type': string;
      allOf?: Array<{
        name?: string;
        metricName: string;
        metricNamespace?: string;
        operator: string;
        timeAggregation: string;
        threshold?: number;
        dimensions?: Array<{
          name: string;
          operator: string;
          values: string[];
        }>;
        skipMetricValidation?: boolean;
        criterionType?: string;
      }>;
    };
    autoMitigate?: boolean;
    actions?: Array<{
      actionGroupId: string;
      webHookProperties?: Record<string, string>;
    }>;
    targetResourceType?: string;
    targetResourceRegion?: string;
    lastUpdatedTime?: string;
    isMigrated?: boolean;
  };
}

/**
 * Action Group (Microsoft.Insights/actionGroups).
 */
export interface ActionGroup extends ArmResource {
  properties?: {
    groupShortName?: string;
    enabled?: boolean;
    emailReceivers?: Array<{
      name: string;
      emailAddress: string;
      useCommonAlertSchema?: boolean;
      status?: string;
    }>;
    smsReceivers?: Array<{
      name: string;
      countryCode: string;
      phoneNumber: string;
      status?: string;
    }>;
    webhookReceivers?: Array<{
      name: string;
      serviceUri: string;
      useCommonAlertSchema?: boolean;
      useAadAuth?: boolean;
      objectId?: string;
      identifierUri?: string;
      tenantId?: string;
    }>;
    azureAppPushReceivers?: Array<{
      name: string;
      emailAddress: string;
    }>;
    automationRunbookReceivers?: Array<{
      automationAccountId: string;
      runbookName: string;
      webhookResourceId: string;
      isGlobalRunbook: boolean;
      name?: string;
      serviceUri?: string;
      useCommonAlertSchema?: boolean;
    }>;
    azureFunctionReceivers?: Array<{
      name: string;
      functionAppResourceId: string;
      functionName: string;
      httpTriggerUrl: string;
      useCommonAlertSchema?: boolean;
    }>;
    logicAppReceivers?: Array<{
      name: string;
      resourceId: string;
      callbackUrl: string;
      useCommonAlertSchema?: boolean;
    }>;
    armRoleReceivers?: Array<{
      name: string;
      roleId: string;
      useCommonAlertSchema?: boolean;
    }>;
    voiceReceivers?: Array<{
      name: string;
      countryCode: string;
      phoneNumber: string;
    }>;
    itsmReceivers?: Array<{
      name: string;
      workspaceId: string;
      connectionId: string;
      ticketConfiguration: string;
      region: string;
    }>;
    eventHubReceivers?: Array<{
      name: string;
      eventHubNameSpace: string;
      eventHubName: string;
      subscriptionId: string;
      tenantId?: string;
      useCommonAlertSchema?: boolean;
    }>;
  };
}

/**
 * Smart Detector Alert Rule.
 */
export interface SmartDetectorAlertRule extends ArmResource {
  properties?: {
    description?: string;
    state?: string;
    severity?: string;
    frequency?: string;
    detector?: {
      id: string;
      parameters?: Record<string, unknown>;
    };
    scope?: string[];
    actionGroups?: {
      groupIds: string[];
      customEmailSubject?: string;
      customWebhookPayload?: string;
    };
    throttling?: {
      duration?: string;
    };
  };
}

/**
 * Front Door profile (Microsoft.Cdn/profiles).
 */
export interface FrontDoorProfile extends ArmResource {
  properties?: {
    provisioningState?: string;
    resourceState?: string;
    frontDoorId?: string;
    originResponseTimeoutSeconds?: number;
  };
}

/**
 * Front Door endpoint.
 */
export interface FrontDoorEndpoint extends ArmResource {
  properties?: {
    hostName?: string;
    enabledState?: string;
    provisioningState?: string;
    deploymentStatus?: string;
    autoGeneratedDomainNameLabelScope?: string;
  };
}

/**
 * Event Grid topic.
 */
export interface EventGridTopic extends ArmResource {
  properties?: {
    provisioningState?: string;
    endpoint?: string;
    inputSchema?: string;
    metricResourceId?: string;
    publicNetworkAccess?: string;
    inboundIpRules?: Array<{
      ipMask: string;
      action: string;
    }>;
    disableLocalAuth?: boolean;
    dataResidencyBoundary?: string;
  };
}

/**
 * Event Grid system topic.
 */
export interface EventGridSystemTopic extends ArmResource {
  properties?: {
    provisioningState?: string;
    source?: string;
    topicType?: string;
    metricResourceId?: string;
  };
}

/**
 * Azure subscription, as returned by `GET /subscriptions`.
 * Every field sits at the top level — none are nested under `properties`.
 */
export interface Subscription {
  id: string;
  subscriptionId: string;
  displayName: string;
  state: 'Enabled' | 'Warned' | 'PastDue' | 'Disabled' | 'Deleted';
  tenantId?: string;
  authorizationSource?: string;
  subscriptionPolicies?: {
    locationPlacementId?: string;
    quotaId?: string;
    spendingLimit?: string;
  };
  tags?: Record<string, string>;
}

/**
 * Azure location.
 */
export interface AzureLocation {
  id: string;
  name: string;
  displayName: string;
  regionalDisplayName?: string;
  metadata?: {
    regionType?: string;
    regionCategory?: string;
    geography?: string;
    geographyGroup?: string;
    longitude?: string;
    latitude?: string;
    physicalLocation?: string;
    pairedRegion?: Array<{
      name: string;
      id: string;
    }>;
  };
}
