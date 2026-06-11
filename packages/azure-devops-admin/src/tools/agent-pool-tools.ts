/**
 * Agent pool tools - read-only, upsert (Tier 2), and disable (Tier 3).
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';
import { descWithExamples, POOL_TYPE_EXAMPLES, AGENT_STATUS_EXAMPLES } from '../tool-examples.js';

export function registerAgentPoolTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;
  let deleteCount = 0;

  // ========================================
  // AGENT POOL READ-ONLY TOOLS
  // ========================================
  server.tool(
    "list-agent-pools",
    "List all agent pools in the organization. Shows pool type (automation for build/release, deployment for environment groups), size, hosted status, and auto-provision settings.",
    {
      poolType: z.enum(["automation", "deployment"]).optional().describe(
        descWithExamples("Filter by pool type", POOL_TYPE_EXAMPLES)
      ),
    },
    async ({ poolType }: any) => {
      try {
        const result = await ctx.agentPools.listAgentPools(poolType);
        return { content: [{ type: "text", text: `Agent pools:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing agent pools:", error);
        return { content: [{ type: "text", text: `Failed to list agent pools: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-agent-pool",
    "Get detailed agent pool configuration including auto-provision, auto-update, auto-size settings, and owner information.",
    {
      poolId: zCoerceNumber().describe("The agent pool ID"),
    },
    async ({ poolId }: any) => {
      try {
        const result = await ctx.agentPools.getAgentPool(poolId);
        return { content: [{ type: "text", text: `Agent pool ${poolId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting agent pool:", error);
        return { content: [{ type: "text", text: `Failed to get agent pool: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "list-agents",
    "List all agents in a pool. Shows agent name, version, OS, enabled status, and current status (online/offline).",
    {
      poolId: zCoerceNumber().describe("The agent pool ID"),
      includeCapabilities: z.boolean().optional().describe("Include system and user capabilities (default: false)"),
    },
    async ({ poolId, includeCapabilities }: any) => {
      try {
        const result = await ctx.agentPools.listAgents(poolId, includeCapabilities || false);
        return { content: [{ type: "text", text: `Agents in pool ${poolId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error listing agents:", error);
        return { content: [{ type: "text", text: `Failed to list agents: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-agent",
    "Get detailed agent information including capabilities, current assignment, and last completed request.",
    {
      poolId: zCoerceNumber().describe("The agent pool ID"),
      agentId: zCoerceNumber().describe("The agent ID"),
    },
    async ({ poolId, agentId }: any) => {
      try {
        const result = await ctx.agentPools.getAgent(poolId, agentId);
        return { content: [{ type: "text", text: `Agent ${agentId} in pool ${poolId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting agent:", error);
        return { content: [{ type: "text", text: `Failed to get agent: ${error.message}` }] };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // AGENT POOL UPSERT TOOLS (Tier 2)
  // ========================================
  if (ctx.tierFlags.enableAgentPoolUpsert) {
    server.tool(
      "update-agent-pool",
      "Update agent pool settings (auto-provision, auto-update, auto-size, target size). (requires AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT=true)",
      {
        poolId: zCoerceNumber().describe("The agent pool ID"),
        autoProvision: z.boolean().optional().describe("Auto-provision pool to new projects"),
        autoUpdate: z.boolean().optional().describe("Auto-update agents"),
        autoSize: z.boolean().optional().describe("Auto-size pool based on demand"),
        targetSize: zCoerceNumber().optional().describe("Target pool size for auto-scaling"),
      },
      async ({ poolId, autoProvision, autoUpdate, autoSize, targetSize }: any) => {
        try {
          const updates: any = {};
          if (autoProvision !== undefined) updates.autoProvision = autoProvision;
          if (autoUpdate !== undefined) updates.autoUpdate = autoUpdate;
          if (autoSize !== undefined) updates.autoSize = autoSize;
          if (targetSize !== undefined) updates.targetSize = targetSize;
          const result = await ctx.agentPools.updateAgentPool(poolId, updates);
          return { content: [{ type: "text", text: `Updated agent pool ${poolId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error updating agent pool:", error);
          return { content: [{ type: "text", text: `Failed to update agent pool: ${error.message}` }] };
        }
      }
    );
    upsertCount++;

    server.tool(
      "enable-agent",
      "Enable a disabled agent to accept new jobs. (requires AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT=true)",
      {
        poolId: zCoerceNumber().describe("The agent pool ID"),
        agentId: zCoerceNumber().describe("The agent ID"),
      },
      async ({ poolId, agentId }: any) => {
        try {
          const result = await ctx.agentPools.enableAgent(poolId, agentId);
          return { content: [{ type: "text", text: `Enabled agent ${agentId} in pool ${poolId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error enabling agent:", error);
          return { content: [{ type: "text", text: `Failed to enable agent: ${error.message}` }] };
        }
      }
    );
    upsertCount++;
  }

  // ========================================
  // AGENT POOL DISABLE TOOLS (Tier 3)
  // ========================================
  if (ctx.tierFlags.enableAgentPoolDisable) {
    server.tool(
      "disable-agent",
      "Disable an agent. It will complete current job then stop accepting new jobs. (requires AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE=true)",
      {
        poolId: zCoerceNumber().describe("The agent pool ID"),
        agentId: zCoerceNumber().describe("The agent ID to disable"),
      },
      async ({ poolId, agentId }: any) => {
        try {
          const result = await ctx.agentPools.disableAgent(poolId, agentId);
          return { content: [{ type: "text", text: `Disabled agent ${agentId} in pool ${poolId}:\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error disabling agent:", error);
          return { content: [{ type: "text", text: `Failed to disable agent: ${error.message}` }] };
        }
      }
    );
    deleteCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: deleteCount };
}
