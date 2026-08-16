/**
 * SecurityRoleService
 *
 * Read-only service for querying security roles and their privileges
 * in a Dataverse environment. Supports filtering by solution and
 * detailed privilege inspection.
 */

import {
  buildTruncation,
  UNCAPPED,
  type TruncationInfo,
} from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { paginateDataverse } from './paginate.js';
import { SolutionService } from './SolutionService.js';

// ============================================================================
// Types
// ============================================================================

export interface SecurityRole {
  roleId: string;
  roleIdUnique: string;
  name: string;
  isManaged: boolean;
  isCustomizable: boolean;
  businessUnitId: string;
}

export interface SecurityRolesResult {
  roles: SecurityRole[];
  truncation: TruncationInfo;
  summary: {
    /**
     * Roles in this payload, which is the population only when
     * `truncation.hasMore` is false. Every other figure in this block describes the
     * same returned set, so a capped run is a census of what was fetched, not of
     * what exists.
     */
    total: number;
    managed: number;
    unmanaged: number;
    systemRolesExcluded: number;
  };
}

export interface RolePrivilege {
  privilegeId: string;
  privilegeName: string;
  entityName: string;
  accessRight: string;
  depth: string;
  canBeBasic: boolean;
  canBeLocal: boolean;
  canBeDeep: boolean;
  canBeGlobal: boolean;
}

export interface SecurityRolePrivilegesResult {
  roleId: string;
  privileges: RolePrivilege[];
  groupedByEntity: Record<string, RolePrivilege[]>;
  summary: {
    total: number;
    entityCount: number;
    byAccessRight: Record<string, number>;
  };
}

export interface SecurityRoleBySolution extends SecurityRole {
  privilegeSummary?: {
    total: number;
    entityCount: number;
  };
}

export interface SecurityRolesBySolutionResult {
  solutionUniqueName: string;
  roles: SecurityRoleBySolution[];
  summary: {
    total: number;
  };
}

interface DataverseRole {
  roleid: string;
  name: string;
  roleidunique: string;
  ismanaged: boolean;
  iscustomizable: { Value: boolean };
  _businessunitid_value: string;
}

interface DataverseRolePrivilege {
  PrivilegeId: string;
  Depth: string;
  BusinessUnitId: string;
}

interface DataversePrivilege {
  privilegeid: string;
  name: string;
  accessright: number;
  canbebasic: boolean;
  canbelocal: boolean;
  canbedeep: boolean;
  canbeglobal: boolean;
}

interface DataverseSolutionComponent {
  objectid: string;
  componenttype: number;
  rootcomponentbehavior: number;
}

// Well-known system role names that are typically excluded from audits
const SYSTEM_ROLE_NAMES = [
  'System Administrator',
  'System Customizer',
  'Environment Maker',
  'Basic User',
  'Delegate',
  'Support User',
  'Activity Feeds',
  'Sales, Enterprise app access',
  'Customer Service Representative',
  'Customer Service Manager',
  'Knowledge Manager',
  'Marketing Manager',
  'Marketing Professional',
  'Salesperson',
  'Sales Manager',
  'Vice President of Sales',
  'Vice President of Marketing',
  'CEO-Business Manager',
  'CSR Manager',
  'Schedule Manager',
];

// Access right bit flags
const ACCESS_RIGHT_MAP: Record<number, string> = {
  1: 'Read',
  2: 'Write',
  4: 'Append',
  8: 'AppendTo',
  16: 'Create',
  32: 'Delete',
  64: 'Share',
  128: 'Assign',
};

// Depth string mapping
const DEPTH_MAP: Record<string, string> = {
  Basic: 'User',
  Local: 'Business Unit',
  Deep: 'Parent: Child BU',
  Global: 'Organization',
};

// ============================================================================
// Service
// ============================================================================

export class SecurityRoleService {
  private solutionService: SolutionService;

  constructor(private client: PowerPlatformClient) {
    this.solutionService = new SolutionService(client);
  }

  /**
   * Get security roles, optionally filtered by solution
   */
  async getSecurityRoles(options?: {
    solutionUniqueName?: string;
    excludeSystemRoles?: boolean;
    maxRecords?: number;
  }): Promise<SecurityRolesResult> {
    const maxRecords = options?.maxRecords ?? UNCAPPED;
    const excludeSystemRoles = options?.excludeSystemRoles ?? true;

    // If filtering by solution, use the solution-based approach
    if (options?.solutionUniqueName) {
      const result = await this.getSecurityRolesBySolution({
        solutionUniqueName: options.solutionUniqueName,
        includePrivileges: false,
      });
      return {
        roles: result.roles,
        truncation: buildTruncation({
          returnedCount: result.roles.length,
          requestedMax: UNCAPPED,
          hasMore: false,
        }),
        summary: {
          total: result.roles.length,
          managed: result.roles.filter((r) => r.isManaged).length,
          unmanaged: result.roles.filter((r) => !r.isManaged).length,
          systemRolesExcluded: 0,
        },
      };
    }

    let systemRolesExcluded = 0;

    const { rows, hasMore, truncationReason } =
      await paginateDataverse<DataverseRole>(this.client, {
        endpoint:
          `api/data/v9.2/roles` +
          `?$select=roleid,name,roleidunique,ismanaged,iscustomizable,_businessunitid_value` +
          `&$orderby=name`,
        maxRecords,
        keep: (r) => {
          if (excludeSystemRoles && SYSTEM_ROLE_NAMES.includes(r.name)) {
            systemRolesExcluded++;
            return false;
          }
          return true;
        },
      });

    const roles: SecurityRole[] = rows.map((r) => ({
      roleId: r.roleid,
      roleIdUnique: r.roleidunique,
      name: r.name,
      isManaged: r.ismanaged,
      isCustomizable: r.iscustomizable?.Value ?? false,
      businessUnitId: r._businessunitid_value,
    }));

    return {
      roles,
      truncation: buildTruncation({
        returnedCount: roles.length,
        requestedMax: maxRecords,
        hasMore,
        truncationReason,
      }),
      summary: {
        total: roles.length,
        managed: roles.filter((r) => r.isManaged).length,
        unmanaged: roles.filter((r) => !r.isManaged).length,
        systemRolesExcluded,
      },
    };
  }

  /**
   * Get privileges for a specific security role
   */
  async getSecurityRolePrivileges(options: {
    roleId: string;
    entityFilter?: string;
    accessRightFilter?: string;
  }): Promise<SecurityRolePrivilegesResult> {
    const { roleId, entityFilter, accessRightFilter } = options;
    const cleanRoleId = roleId.replace(/[{}]/g, '');

    // Step 1: Get role privileges via RetrieveRolePrivilegesRole
    const rolePrivilegesResponse = await this.client.makeRequest<{
      RolePrivileges: DataverseRolePrivilege[];
    }>(
      `api/data/v9.2/RetrieveRolePrivilegesRole(RoleId=@roleId)?@roleId=${cleanRoleId}`
    );

    const rolePrivileges = rolePrivilegesResponse.RolePrivileges || [];
    if (rolePrivileges.length === 0) {
      return {
        roleId: cleanRoleId,
        privileges: [],
        groupedByEntity: {},
        summary: { total: 0, entityCount: 0, byAccessRight: {} },
      };
    }

    // Step 2: Batch-fetch privilege details (in chunks to avoid URL length limits)
    const privilegeIds = rolePrivileges.map((rp) => rp.PrivilegeId);
    const depthMap = new Map(rolePrivileges.map((rp) => [rp.PrivilegeId, rp.Depth]));

    const allPrivilegeDetails: DataversePrivilege[] = [];
    const chunkSize = 50;

    for (let i = 0; i < privilegeIds.length; i += chunkSize) {
      const chunk = privilegeIds.slice(i, i + chunkSize);
      const filter = chunk.map((id) => `privilegeid eq ${id}`).join(' or ');

      const privResponse = await this.client.makeRequest<ApiCollectionResponse<DataversePrivilege>>(
        `api/data/v9.2/privileges?$filter=${filter}` +
        `&$select=privilegeid,name,accessright,canbebasic,canbelocal,canbedeep,canbeglobal`
      );
      allPrivilegeDetails.push(...(privResponse.value || []));
    }

    // Step 3: Map to result type
    let privileges: RolePrivilege[] = allPrivilegeDetails.map((p) => {
      const depth = depthMap.get(p.privilegeid) || 'None';
      const entityName = this.extractEntityFromPrivilegeName(p.name);
      const accessRight = this.mapAccessRight(p.accessright);

      return {
        privilegeId: p.privilegeid,
        privilegeName: p.name,
        entityName,
        accessRight,
        depth: DEPTH_MAP[depth] || depth,
        canBeBasic: p.canbebasic,
        canBeLocal: p.canbelocal,
        canBeDeep: p.canbedeep,
        canBeGlobal: p.canbeglobal,
      };
    });

    // Step 4: Apply filters
    if (entityFilter) {
      const lowerFilter = entityFilter.toLowerCase();
      privileges = privileges.filter((p) => p.entityName.toLowerCase().includes(lowerFilter));
    }
    if (accessRightFilter) {
      const lowerFilter = accessRightFilter.toLowerCase();
      privileges = privileges.filter((p) => p.accessRight.toLowerCase() === lowerFilter);
    }

    // Step 5: Group by entity
    const groupedByEntity: Record<string, RolePrivilege[]> = {};
    const byAccessRight: Record<string, number> = {};

    for (const priv of privileges) {
      if (!groupedByEntity[priv.entityName]) {
        groupedByEntity[priv.entityName] = [];
      }
      groupedByEntity[priv.entityName].push(priv);
      byAccessRight[priv.accessRight] = (byAccessRight[priv.accessRight] || 0) + 1;
    }

    return {
      roleId: cleanRoleId,
      privileges,
      groupedByEntity,
      summary: {
        total: privileges.length,
        entityCount: Object.keys(groupedByEntity).length,
        byAccessRight,
      },
    };
  }

  /**
   * Get security roles that are components of a specific solution
   */
  async getSecurityRolesBySolution(options: {
    solutionUniqueName: string;
    includePrivileges?: boolean;
  }): Promise<SecurityRolesBySolutionResult> {
    const { solutionUniqueName, includePrivileges = false } = options;

    // Step 1: Get solution ID
    const solution = await this.solutionService.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    // Step 2: Get solution components with type 20 (Security Role)
    const componentsResponse = await this.client.makeRequest<ApiCollectionResponse<DataverseSolutionComponent>>(
      `api/data/v9.2/solutioncomponents` +
      `?$filter=componenttype eq 20 and _solutionid_value eq ${solution.solutionid}` +
      `&$select=objectid,componenttype,rootcomponentbehavior`
    );

    const roleObjectIds = (componentsResponse.value || []).map((c) => c.objectid);

    if (roleObjectIds.length === 0) {
      return {
        solutionUniqueName,
        roles: [],
        summary: { total: 0 },
      };
    }

    // Step 3: Fetch role details
    const filter = roleObjectIds.map((id) => `roleid eq ${id}`).join(' or ');
    const rolesResponse = await this.client.makeRequest<ApiCollectionResponse<DataverseRole>>(
      `api/data/v9.2/roles?$filter=${filter}` +
      `&$select=roleid,name,roleidunique,ismanaged,iscustomizable,_businessunitid_value` +
      `&$orderby=name`
    );

    const roles: SecurityRoleBySolution[] = (rolesResponse.value || []).map((r) => ({
      roleId: r.roleid,
      roleIdUnique: r.roleidunique,
      name: r.name,
      isManaged: r.ismanaged,
      isCustomizable: r.iscustomizable?.Value ?? false,
      businessUnitId: r._businessunitid_value,
    }));

    // Step 4: Optionally fetch privilege summaries
    if (includePrivileges) {
      for (const role of roles) {
        const privResult = await this.getSecurityRolePrivileges({ roleId: role.roleId });
        role.privilegeSummary = {
          total: privResult.summary.total,
          entityCount: privResult.summary.entityCount,
        };
      }
    }

    return {
      solutionUniqueName,
      roles,
      summary: { total: roles.length },
    };
  }

  /**
   * Extract entity name from privilege name.
   * Privilege names follow pattern: prv{Action}{EntityName}
   * e.g., prvReadAccount, prvCreateContact, prvWriteInvoice
   */
  private extractEntityFromPrivilegeName(privilegeName: string): string {
    // Remove common prefixes
    const actions = ['Read', 'Write', 'Create', 'Delete', 'Append', 'AppendTo', 'Assign', 'Share'];
    for (const action of actions) {
      if (privilegeName.startsWith(`prv${action}`)) {
        return privilegeName.substring(3 + action.length) || privilegeName;
      }
    }
    // Misc privileges (e.g., prvBulkDelete, prvExportToExcel)
    return privilegeName.startsWith('prv') ? privilegeName.substring(3) : privilegeName;
  }

  /**
   * Map access right bit flag to readable string
   */
  private mapAccessRight(accessRight: number): string {
    return ACCESS_RIGHT_MAP[accessRight] || `Unknown(${accessRight})`;
  }
}
