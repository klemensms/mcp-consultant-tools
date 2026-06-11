/**
 * Vault tools — 8 tools (2 read, 2 write, 1 delete, 3 admin)
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  VAULT_NAME_EXAMPLES,
  PERMISSION_EXAMPLES,
} from '../tool-examples.js';

export function registerVaultTools(server: any, ctx: ServiceContext): void {

  // ── Read tools (always enabled) ────────────────────────────────

  server.tool(
    "list-vaults",
    "List accessible 1Password vaults (filtered by OP_ALLOWED_VAULTS). Always enabled.",
    {},
    async () => {
      try {
        const vaults = await ctx.vaults.listVaults();
        return {
          content: [{ type: "text", text: JSON.stringify(vaults, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error listing vaults: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-vault",
    "Get vault details by name or ID. Always enabled.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or UUID", VAULT_NAME_EXAMPLES)),
      includeAccessors: z.boolean().optional().describe("Include accessor details (groups with access)"),
    },
    async ({ vaultId, includeAccessors }: any) => {
      try {
        const vault = await ctx.vaults.getVault(vaultId, includeAccessors);
        return {
          content: [{ type: "text", text: JSON.stringify(vault, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error getting vault: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Write tools (require OP_ENABLE_WRITE=true) ─────────────────

  server.tool(
    "create-vault",
    "Create a new 1Password vault. Requires OP_ENABLE_WRITE=true.",
    {
      name: z.string().describe("Vault name"),
      description: z.string().optional().describe("Vault description"),
    },
    async ({ name, description }: any) => {
      try {
        ctx.checkWriteEnabled();
        const vault = await ctx.vaults.createVault(name, description);
        return {
          content: [{ type: "text", text: `Vault created: ${vault.name} (${vault.id})\n\n${JSON.stringify(vault, null, 2)}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error creating vault: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update-vault",
    "Update vault name or description. Requires OP_ENABLE_WRITE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or UUID", VAULT_NAME_EXAMPLES)),
      name: z.string().optional().describe("New vault name"),
      description: z.string().optional().describe("New vault description"),
    },
    async ({ vaultId, name, description }: any) => {
      try {
        ctx.checkWriteEnabled();
        const vault = await ctx.vaults.updateVault(vaultId, { name, description });
        return {
          content: [{ type: "text", text: `Vault updated: ${vault.name}\n\n${JSON.stringify(vault, null, 2)}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error updating vault: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Delete tools (require OP_ENABLE_DELETE=true) ───────────────

  server.tool(
    "delete-vault",
    "Permanently delete a vault and all its items. This cannot be undone. Requires OP_ENABLE_DELETE=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or UUID", VAULT_NAME_EXAMPLES)),
    },
    async ({ vaultId }: any) => {
      try {
        ctx.checkDeleteEnabled();
        await ctx.vaults.deleteVault(vaultId);
        return {
          content: [{ type: "text", text: `Vault deleted: ${vaultId}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error deleting vault: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Admin tools (require OP_ENABLE_VAULT_ADMIN=true) ───────────

  server.tool(
    "grant-vault-permissions",
    "Grant group(s) access to a vault. Requires OP_ENABLE_VAULT_ADMIN=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or UUID", VAULT_NAME_EXAMPLES)),
      groupPermissions: z.array(z.object({
        groupId: z.string().describe("Group UUID"),
        permissions: z.array(z.enum(["read", "create", "update", "delete", "share", "manage"])).describe(
          descWithExamples("Permission names", PERMISSION_EXAMPLES)
        ),
      })).describe("Array of group permission grants"),
    },
    async ({ vaultId, groupPermissions }: any) => {
      try {
        ctx.checkVaultAdminEnabled();
        await ctx.vaults.grantPermissions(vaultId, groupPermissions);
        return {
          content: [{ type: "text", text: `Permissions granted on vault ${vaultId} for ${groupPermissions.length} group(s)` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error granting permissions: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update-vault-permissions",
    "Update group vault permissions. Each entry includes its own vaultId, allowing cross-vault updates. Requires OP_ENABLE_VAULT_ADMIN=true.",
    {
      groupPermissions: z.array(z.object({
        vaultId: z.string().describe("Vault name or UUID"),
        groupId: z.string().describe("Group UUID"),
        permissions: z.array(z.enum(["read", "create", "update", "delete", "share", "manage"])).describe(
          descWithExamples("Permission names", PERMISSION_EXAMPLES)
        ),
      })).describe("Array of group vault permission updates"),
    },
    async ({ groupPermissions }: any) => {
      try {
        ctx.checkVaultAdminEnabled();
        await ctx.vaults.updatePermissions(groupPermissions);
        return {
          content: [{ type: "text", text: `Permissions updated for ${groupPermissions.length} group-vault pair(s)` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error updating permissions: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "revoke-vault-permissions",
    "Remove group(s) access from a vault. Requires OP_ENABLE_VAULT_ADMIN=true.",
    {
      vaultId: z.string().describe(descWithExamples("Vault name or UUID", VAULT_NAME_EXAMPLES)),
      groupIds: z.array(z.string()).describe("Array of group UUIDs to revoke access for"),
    },
    async ({ vaultId, groupIds }: any) => {
      try {
        ctx.checkVaultAdminEnabled();
        await ctx.vaults.revokePermissions(vaultId, groupIds);
        return {
          content: [{ type: "text", text: `Permissions revoked on vault ${vaultId} for ${groupIds.length} group(s)` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error revoking permissions: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
