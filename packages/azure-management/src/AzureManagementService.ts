import { ArmClient, type ArmClientConfig } from './client/ArmClient.js';
import { ResourceService } from './services/ResourceService.js';
import { ComputeService } from './services/ComputeService.js';
import { FunctionAppService } from './services/FunctionAppService.js';
import { AppServiceService } from './services/AppServiceService.js';
import { KeyVaultService } from './services/KeyVaultService.js';
import { StorageService } from './services/StorageService.js';
import { SqlService } from './services/SqlService.js';
import { MonitoringService } from './services/MonitoringService.js';
import { NetworkingService } from './services/NetworkingService.js';
import { ResourceGraphService } from './services/ResourceGraphService.js';
import { LogStreamService } from './services/LogStreamService.js';
import { ScmClient } from './utils/scm-client.js';

/**
 * Configuration for Azure Management Service.
 */
export interface AzureManagementConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  resourceGroup?: string;
  redactSecrets?: boolean;
  enableWrite?: boolean;
  maxRetries?: number;
}

/**
 * Main facade for Azure Management operations.
 * Provides access to all Azure resource management services.
 */
export class AzureManagementService {
  private client: ArmClient;
  private _resourceService: ResourceService | null = null;
  private _computeService: ComputeService | null = null;
  private _functionAppService: FunctionAppService | null = null;
  private _appServiceService: AppServiceService | null = null;
  private _keyVaultService: KeyVaultService | null = null;
  private _storageService: StorageService | null = null;
  private _sqlService: SqlService | null = null;
  private _monitoringService: MonitoringService | null = null;
  private _networkingService: NetworkingService | null = null;
  private _resourceGraphService: ResourceGraphService | null = null;
  private _logStreamService: LogStreamService | null = null;

  private redactSecrets: boolean;
  private enableWrite: boolean;
  private scmClient: ScmClient;

  constructor(config: AzureManagementConfig) {
    const clientConfig: ArmClientConfig = {
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      subscriptionId: config.subscriptionId,
      resourceGroup: config.resourceGroup,
      maxRetries: config.maxRetries,
    };

    this.client = new ArmClient(clientConfig);
    this.redactSecrets = config.redactSecrets ?? true;
    this.enableWrite = config.enableWrite ?? false;
    this.scmClient = new ScmClient(this.client.getAuthProvider());

    console.error(`Azure Management service initialized for subscription: ${config.subscriptionId}`);
  }

  /**
   * Get the Resource Service (lazy initialization).
   */
  get resources(): ResourceService {
    if (!this._resourceService) {
      this._resourceService = new ResourceService(this.client);
    }
    return this._resourceService;
  }

  /**
   * Get the Compute Service (lazy initialization).
   */
  get compute(): ComputeService {
    if (!this._computeService) {
      this._computeService = new ComputeService(this.client);
    }
    return this._computeService;
  }

  /**
   * Get the Function App Service (lazy initialization).
   */
  get functionApps(): FunctionAppService {
    if (!this._functionAppService) {
      this._functionAppService = new FunctionAppService(this.client, {
        redactSecrets: this.redactSecrets,
      });
    }
    return this._functionAppService;
  }

  /**
   * Get the App Service Service (lazy initialization).
   */
  get appServices(): AppServiceService {
    if (!this._appServiceService) {
      this._appServiceService = new AppServiceService(this.client, {
        redactSecrets: this.redactSecrets,
        enableWrite: this.enableWrite,
        scmClient: this.scmClient,
      });
    }
    return this._appServiceService;
  }

  /**
   * Get the Key Vault Service (lazy initialization).
   */
  get keyVaults(): KeyVaultService {
    if (!this._keyVaultService) {
      this._keyVaultService = new KeyVaultService(this.client);
    }
    return this._keyVaultService;
  }

  /**
   * Get the Storage Service (lazy initialization).
   */
  get storage(): StorageService {
    if (!this._storageService) {
      this._storageService = new StorageService(this.client, {
        redactSecrets: this.redactSecrets,
      });
    }
    return this._storageService;
  }

  /**
   * Get the SQL Service (lazy initialization).
   */
  get sql(): SqlService {
    if (!this._sqlService) {
      this._sqlService = new SqlService(this.client);
    }
    return this._sqlService;
  }

  /**
   * Get the Monitoring Service (lazy initialization).
   */
  get monitoring(): MonitoringService {
    if (!this._monitoringService) {
      this._monitoringService = new MonitoringService(this.client);
    }
    return this._monitoringService;
  }

  /**
   * Get the Networking Service (lazy initialization).
   */
  get networking(): NetworkingService {
    if (!this._networkingService) {
      this._networkingService = new NetworkingService(this.client);
    }
    return this._networkingService;
  }

  /**
   * Get the Resource Graph Service (lazy initialization).
   */
  get resourceGraph(): ResourceGraphService {
    if (!this._resourceGraphService) {
      this._resourceGraphService = new ResourceGraphService(this.client);
    }
    return this._resourceGraphService;
  }

  /**
   * Get the Log Stream Service (lazy initialization).
   */
  get logStream(): LogStreamService {
    if (!this._logStreamService) {
      this._logStreamService = new LogStreamService(this.client, this.scmClient);
    }
    return this._logStreamService;
  }

  /**
   * Get the subscription ID.
   */
  getSubscriptionId(): string {
    return this.client.getSubscriptionId();
  }

  /**
   * Get the default resource group.
   */
  getDefaultResourceGroup(): string | undefined {
    return this.client.getDefaultResourceGroup();
  }
}
