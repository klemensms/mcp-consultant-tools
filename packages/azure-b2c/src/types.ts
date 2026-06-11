/**
 * Azure B2C ServiceContext
 */
import type { B2CClient } from './b2c-client.js';
import type { UserService } from './services/user-service.js';
import type { GroupService } from './services/group-service.js';

export interface ServiceContext {
  readonly client: B2CClient;
  readonly users: UserService;
  readonly groups: GroupService;
}
