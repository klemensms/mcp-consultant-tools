import type { AdfService } from './services/adf-service.js';

export interface ServiceContext {
  readonly adf: AdfService;
}
