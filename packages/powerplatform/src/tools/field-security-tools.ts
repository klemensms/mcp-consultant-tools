/**
 * Field Security Tools (read-only) - 3 tools
 *
 * Tools: list-field-security-profiles, get-field-security-profile, get-secured-columns
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES } from '../tool-examples.js';

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
  server.tool(
    'list-field-security-profiles',
    'List all Field Security Profiles in the environment, with optional name substring filter. Returns id, name, description, and managed flag for each.',
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

  server.tool(
    'get-secured-columns',
    'List all secured columns on an entity (columns with IsSecured=true on metadata) plus the Field Security Profiles that grant access to each. Useful for auditing field security coverage.',
    {
      entityLogicalName: z
        .string()
        .describe(
          descWithExamples('Entity logical name', ENTITY_NAME_EXAMPLES)
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        const cols = await ctx.pp.getSecuredColumns(params.entityLogicalName);
        if (cols.length === 0) {
          return ok(`No secured columns on ${params.entityLogicalName}.`);
        }
        const lines = cols.map((c) => {
          const fspLines = c.fieldSecurityProfiles.length
            ? c.fieldSecurityProfiles
                .map(
                  (f) =>
                    `    · ${f.name} (${f.fieldSecurityProfileId}): C=${f.canCreate} R=${f.canRead} U=${f.canUpdate}`
                )
                .join('\n')
            : '    (no FSP grants access — column is fully locked down)';
          return `- ${c.attributeLogicalName} [${c.attributeType}]\n${fspLines}`;
        });
        return ok(
          `Secured columns on ${params.entityLogicalName} (${cols.length}):\n${lines.join('\n')}`
        );
      } catch (error: any) {
        console.error('Error in get-secured-columns:', error);
        return err(`Failed to get secured columns: ${error.message}`);
      }
    }
  );
}
