/**
 * Field Security Tools - Field Security Profiles (FSP) management
 *
 * Tools: set-column-secured, set-columns-secured,
 *        create-field-security-profile, update-field-security-profile,
 *        delete-field-security-profile, list-field-security-profiles,
 *        get-field-security-profile,
 *        add-field-permission, add-field-permissions, remove-field-permission,
 *        assign-fsp-to-team, unassign-fsp-from-team,
 *        assign-fsp-to-user, unassign-fsp-from-user
 *
 * Note on roles: Dataverse does NOT support assigning FSPs directly to security
 * roles. The supported pattern is: create a team for the role, assign the FSP
 * to the team, add users to the team. Tool descriptions reflect this.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ENTITY_NAME_EXAMPLES,
  SOLUTION_NAME_EXAMPLES,
  FSP_NAME_EXAMPLES,
  FSP_PERMISSION_EXAMPLES,
} from '../tool-examples.js';

const PermissionEnum = z.enum(['Allowed', 'NotAllowed']);

function ok(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

function err(message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function registerFieldSecurityTools(server: any, ctx: ServiceContext): void {
  // ===== SECURED COLUMN FLAG =====

  server.tool(
    'set-column-secured',
    'Toggle the IsSecured flag on a column. This is the prerequisite for any Field Security Profile (FSP) work — until a column is marked Secured, fieldpermission records for it are ignored. Reuses update-attribute internally and publishes the entity afterwards by default. Some OOTB system columns (e.g., name, primary id) cannot be secured and will return AttributeIsNotSecurable.',
    {
      entityLogicalName: z
        .string()
        .describe(
          descWithExamples('Entity logical name', ENTITY_NAME_EXAMPLES)
        ),
      attributeLogicalName: z
        .string()
        .describe('Attribute (column) logical name to secure or unsecure'),
      isSecured: z
        .boolean()
        .describe('true to secure the column, false to unsecure it'),
      publishAfter: z
        .boolean()
        .optional()
        .describe('Publish the entity after the change (default: true)'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const result = await ctx.pp.setColumnSecured(
          params.entityLogicalName,
          params.attributeLogicalName,
          params.isSecured,
          params.publishAfter !== false
        );
        const changed = result.previousValue !== result.isSecured;
        return ok(
          `${changed ? 'Updated' : 'No change'}: ${result.entityLogicalName}.${result.attributeLogicalName} IsSecured = ${result.isSecured} (was ${result.previousValue})`
        );
      } catch (error: any) {
        console.error('Error in set-column-secured:', error);
        return err(`Failed to set column secured: ${error.message}`);
      }
    }
  );

  server.tool(
    'set-columns-secured',
    'Batch wrapper for set-column-secured. Secure or unsecure multiple columns on the same entity in one operation, with a single publish at the end. Useful when applying field security to a group of related columns (e.g., all EDI fields on Contact).',
    {
      entityLogicalName: z
        .string()
        .describe(
          descWithExamples('Entity logical name', ENTITY_NAME_EXAMPLES)
        ),
      attributeLogicalNames: z
        .array(z.string())
        .min(1)
        .describe('Array of attribute logical names to secure or unsecure'),
      isSecured: z
        .boolean()
        .describe('true to secure all columns, false to unsecure all'),
      publishAfter: z
        .boolean()
        .optional()
        .describe('Publish the entity after the changes (default: true)'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const results = await ctx.pp.setColumnsSecured(
          params.entityLogicalName,
          params.attributeLogicalNames,
          params.isSecured,
          params.publishAfter !== false
        );
        const summary = results
          .map(
            (r) =>
              `  ${r.changed ? '✓' : '–'} ${r.attributeLogicalName} (was ${r.previousValue}, now ${r.isSecured})`
          )
          .join('\n');
        const changedCount = results.filter((r) => r.changed).length;
        return ok(
          `Set ${results.length} columns on ${params.entityLogicalName} (${changedCount} changed):\n${summary}`
        );
      } catch (error: any) {
        console.error('Error in set-columns-secured:', error);
        return err(`Failed to set columns secured: ${error.message}`);
      }
    }
  );

  // ===== FSP LIFECYCLE =====

  server.tool(
    'create-field-security-profile',
    'Create a new Field Security Profile (FSP). An FSP is a container for field permissions and is assigned to teams or users. By itself it grants nothing — you must add field-permission records and assign principals.',
    {
      name: z
        .string()
        .describe(
          descWithExamples('Display name of the profile', FSP_NAME_EXAMPLES)
        ),
      description: z.string().optional().describe('Purpose of the profile'),
      solutionUniqueName: z
        .string()
        .optional()
        .describe(
          descWithExamples(
            'Add the FSP as a component of this solution',
            SOLUTION_NAME_EXAMPLES
          )
        ),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const r = await ctx.pp.createFieldSecurityProfile(
          params.name,
          params.description,
          params.solutionUniqueName
        );
        return ok(
          `Created FSP "${r.name}" (id: ${r.fieldSecurityProfileId})${params.solutionUniqueName ? ` in solution ${params.solutionUniqueName}` : ''}`
        );
      } catch (error: any) {
        console.error('Error in create-field-security-profile:', error);
        return err(`Failed to create FSP: ${error.message}`);
      }
    }
  );

  server.tool(
    'update-field-security-profile',
    'Update the name and/or description of an existing FSP. Cannot edit FSPs that are part of a managed solution.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile to update'),
      name: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        await ctx.pp.updateFieldSecurityProfile(params.fieldSecurityProfileId, {
          name: params.name,
          description: params.description,
        });
        return ok(`Updated FSP ${params.fieldSecurityProfileId}`);
      } catch (error: any) {
        console.error('Error in update-field-security-profile:', error);
        return err(`Failed to update FSP: ${error.message}`);
      }
    }
  );

  server.tool(
    'delete-field-security-profile',
    'Delete a Field Security Profile. Refuses if the profile is part of a managed solution. Associated fieldpermission records are deleted as well by Dataverse.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile to delete'),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        await ctx.pp.deleteFieldSecurityProfile(params.fieldSecurityProfileId);
        return ok(`Deleted FSP ${params.fieldSecurityProfileId}`);
      } catch (error: any) {
        console.error('Error in delete-field-security-profile:', error);
        return err(`Failed to delete FSP: ${error.message}`);
      }
    }
  );

  server.tool(
    'list-field-security-profiles',
    'List all Field Security Profiles in the environment, with optional name substring filter.',
    {
      namePattern: z
        .string()
        .optional()
        .describe('Case-insensitive substring filter on FSP name'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        const results = await ctx.pp.listFieldSecurityProfiles(params.namePattern);
        if (results.length === 0) return ok('No field security profiles found.');
        const lines = results.map(
          (r) =>
            `- ${r.name}${r.isManaged ? ' [managed]' : ''} (${r.fieldSecurityProfileId})${r.description ? ` — ${r.description}` : ''}`
        );
        return ok(`Found ${results.length} field security profile(s):\n${lines.join('\n')}`);
      } catch (error: any) {
        console.error('Error in list-field-security-profiles:', error);
        return err(`Failed to list FSPs: ${error.message}`);
      }
    }
  );

  server.tool(
    'get-field-security-profile',
    'Get a single Field Security Profile with all its field permissions and team/user assignments — a one-call snapshot.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        const r = await ctx.pp.getFieldSecurityProfile(params.fieldSecurityProfileId);
        const permLines = r.permissions.length
          ? r.permissions
              .map(
                (p) =>
                  `  - ${p.entityName}.${p.attributeLogicalName}: C=${p.canCreate} R=${p.canRead} U=${p.canUpdate}`
              )
              .join('\n')
          : '  (none)';
        const teamLines = r.teams.length
          ? r.teams.map((t) => `  - ${t.name} (${t.teamId})`).join('\n')
          : '  (none)';
        const userLines = r.users.length
          ? r.users.map((u) => `  - ${u.fullName} (${u.systemUserId})`).join('\n')
          : '  (none)';
        return ok(
          `FSP "${r.name}"${r.isManaged ? ' [managed]' : ''}\nId: ${r.fieldSecurityProfileId}\n${r.description ? `Description: ${r.description}\n` : ''}\nPermissions (${r.permissions.length}):\n${permLines}\n\nTeams (${r.teams.length}):\n${teamLines}\n\nUsers (${r.users.length}):\n${userLines}`
        );
      } catch (error: any) {
        console.error('Error in get-field-security-profile:', error);
        return err(`Failed to get FSP: ${error.message}`);
      }
    }
  );

  // ===== FIELD PERMISSIONS =====

  server.tool(
    'add-field-permission',
    'Add (or upsert) a field permission on an FSP for a specific secured column. The target column must already have IsSecured = true. By default, if a permission for this column already exists on this FSP, it is updated rather than duplicated.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
      entityLogicalName: z
        .string()
        .describe(
          descWithExamples('Entity logical name', ENTITY_NAME_EXAMPLES)
        ),
      attributeLogicalName: z
        .string()
        .describe('Attribute logical name (must be a secured column)'),
      canCreate: PermissionEnum.describe(
        descWithExamples('Create permission', FSP_PERMISSION_EXAMPLES)
      ),
      canRead: PermissionEnum.describe(
        descWithExamples('Read permission', FSP_PERMISSION_EXAMPLES)
      ),
      canUpdate: PermissionEnum.describe(
        descWithExamples('Update permission', FSP_PERMISSION_EXAMPLES)
      ),
      upsert: z
        .boolean()
        .optional()
        .describe(
          'If true (default), update an existing permission for this column rather than creating a duplicate'
        ),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const r = await ctx.pp.addFieldPermission({
          fieldSecurityProfileId: params.fieldSecurityProfileId,
          entityLogicalName: params.entityLogicalName,
          attributeLogicalName: params.attributeLogicalName,
          canCreate: params.canCreate,
          canRead: params.canRead,
          canUpdate: params.canUpdate,
          upsert: params.upsert,
        });
        return ok(
          `Permission set on ${r.entityName}.${r.attributeLogicalName}: C=${r.canCreate} R=${r.canRead} U=${r.canUpdate} (id: ${r.fieldPermissionId})`
        );
      } catch (error: any) {
        console.error('Error in add-field-permission:', error);
        return err(`Failed to add field permission: ${error.message}`);
      }
    }
  );

  server.tool(
    'add-field-permissions',
    'Batch wrapper for add-field-permission. Add permissions for multiple columns to the same FSP in one call. Each entry is upserted by default.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
      permissions: z
        .array(
          z.object({
            entityLogicalName: z.string(),
            attributeLogicalName: z.string(),
            canCreate: PermissionEnum,
            canRead: PermissionEnum,
            canUpdate: PermissionEnum,
          })
        )
        .min(1)
        .describe('Array of permission entries to add or update'),
      upsert: z
        .boolean()
        .optional()
        .describe('If true (default), update existing permissions rather than duplicating'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const r = await ctx.pp.addFieldPermissions(
          params.fieldSecurityProfileId,
          params.permissions,
          params.upsert !== false
        );
        const lines = r.map(
          (p) =>
            `  - ${p.entityName}.${p.attributeLogicalName}: C=${p.canCreate} R=${p.canRead} U=${p.canUpdate}`
        );
        return ok(`Set ${r.length} field permission(s):\n${lines.join('\n')}`);
      } catch (error: any) {
        console.error('Error in add-field-permissions:', error);
        return err(`Failed to add field permissions: ${error.message}`);
      }
    }
  );

  server.tool(
    'remove-field-permission',
    'Remove a single field permission from an FSP by its fieldpermission record id.',
    {
      fieldPermissionId: z
        .string()
        .describe('GUID of the fieldpermission record to delete'),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        await ctx.pp.removeFieldPermission(params.fieldPermissionId);
        return ok(`Removed field permission ${params.fieldPermissionId}`);
      } catch (error: any) {
        console.error('Error in remove-field-permission:', error);
        return err(`Failed to remove field permission: ${error.message}`);
      }
    }
  );

  // ===== ASSIGNMENTS =====

  server.tool(
    'assign-fsp-to-team',
    'Assign a Field Security Profile to a team. Idempotent — returns alreadyAssigned=true if the team already has the profile. NOTE: Dataverse does not support direct role-to-FSP assignment; use a team to bridge.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
      teamId: z.string().describe('GUID of the team'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const r = await ctx.pp.assignFspToTeam(
          params.fieldSecurityProfileId,
          params.teamId
        );
        return ok(
          r.alreadyAssigned
            ? `Team ${params.teamId} already has FSP ${params.fieldSecurityProfileId}`
            : `Assigned FSP ${params.fieldSecurityProfileId} to team ${params.teamId}`
        );
      } catch (error: any) {
        console.error('Error in assign-fsp-to-team:', error);
        return err(`Failed to assign FSP to team: ${error.message}`);
      }
    }
  );

  server.tool(
    'unassign-fsp-from-team',
    'Remove a Field Security Profile from a team.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
      teamId: z.string().describe('GUID of the team'),
    },
    // Revokes the FSP from the team.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        await ctx.pp.unassignFspFromTeam(
          params.fieldSecurityProfileId,
          params.teamId
        );
        return ok(
          `Unassigned FSP ${params.fieldSecurityProfileId} from team ${params.teamId}`
        );
      } catch (error: any) {
        console.error('Error in unassign-fsp-from-team:', error);
        return err(`Failed to unassign FSP from team: ${error.message}`);
      }
    }
  );

  server.tool(
    'assign-fsp-to-user',
    'Assign a Field Security Profile directly to a user. Idempotent — returns alreadyAssigned=true if the user already has the profile.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
      systemUserId: z.string().describe('GUID of the system user'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params: any) => {
      try {
        const r = await ctx.pp.assignFspToUser(
          params.fieldSecurityProfileId,
          params.systemUserId
        );
        return ok(
          r.alreadyAssigned
            ? `User ${params.systemUserId} already has FSP ${params.fieldSecurityProfileId}`
            : `Assigned FSP ${params.fieldSecurityProfileId} to user ${params.systemUserId}`
        );
      } catch (error: any) {
        console.error('Error in assign-fsp-to-user:', error);
        return err(`Failed to assign FSP to user: ${error.message}`);
      }
    }
  );

  server.tool(
    'unassign-fsp-from-user',
    'Remove a Field Security Profile from a user.',
    {
      fieldSecurityProfileId: z
        .string()
        .describe('GUID of the field security profile'),
      systemUserId: z.string().describe('GUID of the system user'),
    },
    // Revokes the FSP from the user.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        await ctx.pp.unassignFspFromUser(
          params.fieldSecurityProfileId,
          params.systemUserId
        );
        return ok(
          `Unassigned FSP ${params.fieldSecurityProfileId} from user ${params.systemUserId}`
        );
      } catch (error: any) {
        console.error('Error in unassign-fsp-from-user:', error);
        return err(`Failed to unassign FSP from user: ${error.message}`);
      }
    }
  );
}
