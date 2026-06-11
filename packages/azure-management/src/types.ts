import type { AzureManagementService } from './AzureManagementService.js';

export interface ServiceContext {
  readonly management: AzureManagementService;
}
