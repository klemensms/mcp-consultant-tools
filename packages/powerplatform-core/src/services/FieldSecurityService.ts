/**
 * FieldSecurityService
 *
 * Service for Field Security Profile (FSP) operations.
 *
 * Field Security Profiles control read/create/update access to secured columns
 * in Dataverse. A column must first be marked with IsSecured = true on its
 * attribute metadata (handled by AttributeService + PublishingService on the
 * customization facade). Once secured, a column is inaccessible to any principal
 * that does not have an FSP granting the desired access.
 *
 * This service handles FSP records, field permissions, and team/user assignments.
 * Setting IsSecured on the attribute itself is orchestrated by the facade.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

/** Dataverse permission enum values (NOT 0/1 - surprising but documented). */
export const FIELD_PERMISSION_ALLOWED = 4;
export const FIELD_PERMISSION_NOT_ALLOWED = 0;

export type FieldPermissionValue = 'Allowed' | 'NotAllowed';

export interface FieldSecurityProfileSummary {
  fieldSecurityProfileId: string;
  name: string;
  description?: string;
  isManaged: boolean;
  solutionId?: string;
}

export interface FieldPermissionRecord {
  fieldPermissionId: string;
  entityName: string;
  attributeLogicalName: string;
  canCreate: FieldPermissionValue;
  canRead: FieldPermissionValue;
  canUpdate: FieldPermissionValue;
}

export interface FieldSecurityProfileDetail extends FieldSecurityProfileSummary {
  permissions: FieldPermissionRecord[];
  teams: Array<{ teamId: string; name: string }>;
  users: Array<{ systemUserId: string; fullName: string }>;
}

export interface SecuredColumnInfo {
  attributeLogicalName: string;
  attributeType: string;
  fieldSecurityProfiles: Array<{
    fieldSecurityProfileId: string;
    name: string;
    canCreate: FieldPermissionValue;
    canRead: FieldPermissionValue;
    canUpdate: FieldPermissionValue;
  }>;
}

function toEnum(v: FieldPermissionValue): number {
  return v === 'Allowed' ? FIELD_PERMISSION_ALLOWED : FIELD_PERMISSION_NOT_ALLOWED;
}

function fromEnum(v: number | undefined): FieldPermissionValue {
  return v === FIELD_PERMISSION_ALLOWED ? 'Allowed' : 'NotAllowed';
}

export class FieldSecurityService {
  constructor(private client: PowerPlatformClient) {}

  // =====================================================
  // FSP LIFECYCLE
  // =====================================================

  async createFieldSecurityProfile(
    name: string,
    description?: string,
    solutionUniqueName?: string
  ): Promise<FieldSecurityProfileSummary> {
    const headers: Record<string, string> = { Prefer: 'return=representation' };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }
    const body: Record<string, unknown> = { name };
    if (description !== undefined) body.description = description;

    const created = await this.client.makeRequest<Record<string, unknown>>(
      'api/data/v9.2/fieldsecurityprofiles',
      'POST',
      body,
      headers
    );

    return {
      fieldSecurityProfileId: String(created.fieldsecurityprofileid),
      name: String(created.name),
      description: created.description as string | undefined,
      isManaged: Boolean(created.ismanaged),
      solutionId: created.solutionid as string | undefined,
    };
  }

  async updateFieldSecurityProfile(
    fieldSecurityProfileId: string,
    updates: { name?: string; description?: string }
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.description !== undefined) body.description = updates.description;
    if (Object.keys(body).length === 0) {
      throw new Error('updateFieldSecurityProfile requires at least one of: name, description');
    }
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})`,
      'PATCH',
      body
    );
  }

  async deleteFieldSecurityProfile(fieldSecurityProfileId: string): Promise<void> {
    const existing = await this.getFieldSecurityProfileRecord(fieldSecurityProfileId);
    if (existing.isManaged) {
      throw new Error(
        `Cannot delete field security profile '${existing.name}' - it is part of a managed solution.`
      );
    }
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})`,
      'DELETE'
    );
  }

  async listFieldSecurityProfiles(
    namePattern?: string
  ): Promise<FieldSecurityProfileSummary[]> {
    let endpoint =
      'api/data/v9.2/fieldsecurityprofiles?$select=fieldsecurityprofileid,name,description,ismanaged,solutionid';
    if (namePattern) {
      const escaped = namePattern.replace(/'/g, "''");
      endpoint += `&$filter=contains(name,'${escaped}')`;
    }
    const resp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      endpoint,
      'GET'
    );
    return (resp.value || []).map((r) => ({
      fieldSecurityProfileId: String(r.fieldsecurityprofileid),
      name: String(r.name),
      description: r.description as string | undefined,
      isManaged: Boolean(r.ismanaged),
      solutionId: r.solutionid as string | undefined,
    }));
  }

  private async getFieldSecurityProfileRecord(
    fieldSecurityProfileId: string
  ): Promise<FieldSecurityProfileSummary> {
    const r = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})?$select=fieldsecurityprofileid,name,description,ismanaged,solutionid`,
      'GET'
    );
    return {
      fieldSecurityProfileId: String(r.fieldsecurityprofileid),
      name: String(r.name),
      description: r.description as string | undefined,
      isManaged: Boolean(r.ismanaged),
      solutionId: r.solutionid as string | undefined,
    };
  }

  async getFieldSecurityProfile(
    fieldSecurityProfileId: string
  ): Promise<FieldSecurityProfileDetail> {
    const summary = await this.getFieldSecurityProfileRecord(fieldSecurityProfileId);
    const [permissions, teams, users] = await Promise.all([
      this.listFieldPermissions(fieldSecurityProfileId),
      this.listAssignedTeams(fieldSecurityProfileId),
      this.listAssignedUsers(fieldSecurityProfileId),
    ]);
    return { ...summary, permissions, teams, users };
  }

  // =====================================================
  // FIELD PERMISSIONS
  // =====================================================

  async listFieldPermissions(
    fieldSecurityProfileId: string
  ): Promise<FieldPermissionRecord[]> {
    const endpoint = `api/data/v9.2/fieldpermissions?$select=fieldpermissionid,entityname,attributelogicalname,cancreate,canread,canupdate&$filter=_fieldsecurityprofileid_value eq ${fieldSecurityProfileId}`;
    const resp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      endpoint,
      'GET'
    );
    return (resp.value || []).map((r) => ({
      fieldPermissionId: String(r.fieldpermissionid),
      entityName: String(r.entityname),
      attributeLogicalName: String(r.attributelogicalname),
      canCreate: fromEnum(r.cancreate as number),
      canRead: fromEnum(r.canread as number),
      canUpdate: fromEnum(r.canupdate as number),
    }));
  }

  private async findExistingPermission(
    fieldSecurityProfileId: string,
    entityName: string,
    attributeLogicalName: string
  ): Promise<string | null> {
    const escapedEntity = entityName.replace(/'/g, "''");
    const escapedAttr = attributeLogicalName.replace(/'/g, "''");
    const endpoint = `api/data/v9.2/fieldpermissions?$select=fieldpermissionid&$filter=_fieldsecurityprofileid_value eq ${fieldSecurityProfileId} and entityname eq '${escapedEntity}' and attributelogicalname eq '${escapedAttr}'`;
    const resp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      endpoint,
      'GET'
    );
    const first = resp.value?.[0];
    return first ? String(first.fieldpermissionid) : null;
  }

  async addFieldPermission(options: {
    fieldSecurityProfileId: string;
    entityLogicalName: string;
    attributeLogicalName: string;
    canCreate: FieldPermissionValue;
    canRead: FieldPermissionValue;
    canUpdate: FieldPermissionValue;
    upsert?: boolean;
  }): Promise<FieldPermissionRecord> {
    const upsert = options.upsert !== false;

    if (upsert) {
      const existingId = await this.findExistingPermission(
        options.fieldSecurityProfileId,
        options.entityLogicalName,
        options.attributeLogicalName
      );
      if (existingId) {
        await this.client.makeRequestNoContent(
          `api/data/v9.2/fieldpermissions(${existingId})`,
          'PATCH',
          {
            cancreate: toEnum(options.canCreate),
            canread: toEnum(options.canRead),
            canupdate: toEnum(options.canUpdate),
          }
        );
        return {
          fieldPermissionId: existingId,
          entityName: options.entityLogicalName,
          attributeLogicalName: options.attributeLogicalName,
          canCreate: options.canCreate,
          canRead: options.canRead,
          canUpdate: options.canUpdate,
        };
      }
    }

    const body = {
      entityname: options.entityLogicalName,
      attributelogicalname: options.attributeLogicalName,
      cancreate: toEnum(options.canCreate),
      canread: toEnum(options.canRead),
      canupdate: toEnum(options.canUpdate),
      'fieldsecurityprofileid@odata.bind': `/fieldsecurityprofiles(${options.fieldSecurityProfileId})`,
    };
    const created = await this.client.makeRequest<Record<string, unknown>>(
      'api/data/v9.2/fieldpermissions',
      'POST',
      body,
      { Prefer: 'return=representation' }
    );
    return {
      fieldPermissionId: String(created.fieldpermissionid),
      entityName: options.entityLogicalName,
      attributeLogicalName: options.attributeLogicalName,
      canCreate: options.canCreate,
      canRead: options.canRead,
      canUpdate: options.canUpdate,
    };
  }

  async removeFieldPermission(fieldPermissionId: string): Promise<void> {
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldpermissions(${fieldPermissionId})`,
      'DELETE'
    );
  }

  // =====================================================
  // ASSIGNMENTS (TEAMS / USERS)
  // =====================================================

  async listAssignedTeams(
    fieldSecurityProfileId: string
  ): Promise<Array<{ teamId: string; name: string }>> {
    const endpoint = `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})/teamprofiles_association?$select=teamid,name`;
    const resp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      endpoint,
      'GET'
    );
    return (resp.value || []).map((r) => ({
      teamId: String(r.teamid),
      name: String(r.name ?? ''),
    }));
  }

  async listAssignedUsers(
    fieldSecurityProfileId: string
  ): Promise<Array<{ systemUserId: string; fullName: string }>> {
    const endpoint = `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})/systemuserprofiles_association?$select=systemuserid,fullname`;
    const resp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      endpoint,
      'GET'
    );
    return (resp.value || []).map((r) => ({
      systemUserId: String(r.systemuserid),
      fullName: String(r.fullname ?? ''),
    }));
  }

  async assignProfileToTeam(
    fieldSecurityProfileId: string,
    teamId: string
  ): Promise<{ alreadyAssigned: boolean }> {
    const existing = await this.listAssignedTeams(fieldSecurityProfileId);
    if (existing.some((t) => t.teamId.toLowerCase() === teamId.toLowerCase())) {
      return { alreadyAssigned: true };
    }
    const orgUrl = this.client.getOrganizationUrl().replace(/\/$/, '');
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})/teamprofiles_association/$ref`,
      'POST',
      { '@odata.id': `${orgUrl}/api/data/v9.2/teams(${teamId})` }
    );
    return { alreadyAssigned: false };
  }

  async unassignProfileFromTeam(
    fieldSecurityProfileId: string,
    teamId: string
  ): Promise<void> {
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})/teamprofiles_association(${teamId})/$ref`,
      'DELETE'
    );
  }

  async assignProfileToUser(
    fieldSecurityProfileId: string,
    systemUserId: string
  ): Promise<{ alreadyAssigned: boolean }> {
    const existing = await this.listAssignedUsers(fieldSecurityProfileId);
    if (existing.some((u) => u.systemUserId.toLowerCase() === systemUserId.toLowerCase())) {
      return { alreadyAssigned: true };
    }
    const orgUrl = this.client.getOrganizationUrl().replace(/\/$/, '');
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})/systemuserprofiles_association/$ref`,
      'POST',
      { '@odata.id': `${orgUrl}/api/data/v9.2/systemusers(${systemUserId})` }
    );
    return { alreadyAssigned: false };
  }

  async unassignProfileFromUser(
    fieldSecurityProfileId: string,
    systemUserId: string
  ): Promise<void> {
    await this.client.makeRequestNoContent(
      `api/data/v9.2/fieldsecurityprofiles(${fieldSecurityProfileId})/systemuserprofiles_association(${systemUserId})/$ref`,
      'DELETE'
    );
  }

  // =====================================================
  // SECURED COLUMNS DISCOVERY
  // =====================================================

  /**
   * Return all secured columns on an entity with the FSPs that grant access to each.
   * Requires IsSecured = true on the attribute metadata.
   */
  async getSecuredColumns(entityLogicalName: string): Promise<SecuredColumnInfo[]> {
    const attrsEndpoint = `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,AttributeType,IsSecured&$filter=IsSecured eq true`;
    const attrsResp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      attrsEndpoint,
      'GET'
    );
    const securedAttrs = (attrsResp.value || []).map((a) => ({
      attributeLogicalName: String(a.LogicalName),
      attributeType: String(a.AttributeType),
    }));

    if (securedAttrs.length === 0) return [];

    const permsEndpoint = `api/data/v9.2/fieldpermissions?$select=fieldpermissionid,entityname,attributelogicalname,cancreate,canread,canupdate,_fieldsecurityprofileid_value&$filter=entityname eq '${entityLogicalName.replace(/'/g, "''")}'`;
    const permsResp = await this.client.makeRequest<{ value: Array<Record<string, unknown>> }>(
      permsEndpoint,
      'GET'
    );
    const perms = permsResp.value || [];

    const fspIds = Array.from(
      new Set(perms.map((p) => String(p._fieldsecurityprofileid_value)))
    );
    const fspNames: Record<string, string> = {};
    if (fspIds.length > 0) {
      const orFilter = fspIds
        .map((id) => `fieldsecurityprofileid eq ${id}`)
        .join(' or ');
      const fspResp = await this.client.makeRequest<{
        value: Array<Record<string, unknown>>;
      }>(
        `api/data/v9.2/fieldsecurityprofiles?$select=fieldsecurityprofileid,name&$filter=${encodeURIComponent(
          orFilter
        )}`,
        'GET'
      );
      for (const f of fspResp.value || []) {
        fspNames[String(f.fieldsecurityprofileid)] = String(f.name);
      }
    }

    return securedAttrs.map((attr) => ({
      attributeLogicalName: attr.attributeLogicalName,
      attributeType: attr.attributeType,
      fieldSecurityProfiles: perms
        .filter((p) => String(p.attributelogicalname) === attr.attributeLogicalName)
        .map((p) => {
          const fspId = String(p._fieldsecurityprofileid_value);
          return {
            fieldSecurityProfileId: fspId,
            name: fspNames[fspId] ?? '',
            canCreate: fromEnum(p.cancreate as number),
            canRead: fromEnum(p.canread as number),
            canUpdate: fromEnum(p.canupdate as number),
          };
        }),
    }));
  }
}
