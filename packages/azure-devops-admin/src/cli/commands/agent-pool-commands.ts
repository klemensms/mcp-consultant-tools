/**
 * Agent Pool CLI Commands - list, get, agents, update, enable/disable
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerAgentPoolCommands(program: Command, ctx: ServiceContext): void {
  const agentPool = program.command('agent-pool').alias('ap').description('Agent pool operations');

  agentPool
    .command('list')
    .description('List all agent pools in the organization')
    .option('--pool-type <type>', 'Filter by pool type (e.g., automation, deployment)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.agentPools.listAgentPools(opts.poolType);
        outputResult(
          { fileName: 'agent-pools', data: result, summary: `Agent pools` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list agent pools'); }
    });

  agentPool
    .command('get')
    .description('Get detailed agent pool information')
    .argument('<poolId>', 'Agent pool ID')
    .action(async (poolId: string) => {
      try {
        const result = await ctx.agentPools.getAgentPool(parseInt(poolId));
        outputResult(
          { fileName: `agent-pool-${poolId}`, data: result, summary: `Agent pool #${poolId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get agent pool'); }
    });

  agentPool
    .command('agents')
    .description('List agents in an agent pool')
    .argument('<poolId>', 'Agent pool ID')
    .option('-c, --capabilities', 'Include agent capabilities')
    .action(async (poolId: string, opts: any) => {
      try {
        const result = await ctx.agentPools.listAgents(parseInt(poolId), opts.capabilities || false);
        outputResult(
          { fileName: `agents-pool-${poolId}`, data: result, summary: `Agents in pool #${poolId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list agents'); }
    });

  agentPool
    .command('agent')
    .description('Get detailed agent information')
    .argument('<poolId>', 'Agent pool ID')
    .argument('<agentId>', 'Agent ID')
    .action(async (poolId: string, agentId: string) => {
      try {
        const result = await ctx.agentPools.getAgent(parseInt(poolId), parseInt(agentId));
        outputResult(
          { fileName: `agent-${poolId}-${agentId}`, data: result, summary: `Agent #${agentId} in pool #${poolId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get agent'); }
    });

  agentPool
    .command('update')
    .description('Update agent pool settings')
    .argument('<poolId>', 'Agent pool ID')
    .option('--auto-provision <bool>', 'Enable auto-provisioning')
    .option('--auto-update <bool>', 'Enable auto-update')
    .option('--auto-size <bool>', 'Enable auto-sizing')
    .option('--target-size <n>', 'Target pool size')
    .action(async (poolId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.autoProvision !== undefined) updates.autoProvision = opts.autoProvision === 'true';
        if (opts.autoUpdate !== undefined) updates.autoUpdate = opts.autoUpdate === 'true';
        if (opts.autoSize !== undefined) updates.autoSize = opts.autoSize === 'true';
        if (opts.targetSize !== undefined) updates.targetSize = parseInt(opts.targetSize);
        const result = await ctx.agentPools.updateAgentPool(parseInt(poolId), updates);
        outputResult(
          { fileName: `agent-pool-updated-${poolId}`, data: result, summary: `Updated agent pool #${poolId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update agent pool'); }
    });

  agentPool
    .command('enable-agent')
    .description('Enable an agent in a pool')
    .argument('<poolId>', 'Agent pool ID')
    .argument('<agentId>', 'Agent ID')
    .action(async (poolId: string, agentId: string) => {
      try {
        const result = await ctx.agentPools.enableAgent(parseInt(poolId), parseInt(agentId));
        outputResult(
          { fileName: `agent-enabled-${poolId}-${agentId}`, data: result, summary: `Enabled agent #${agentId} in pool #${poolId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'enable agent'); }
    });

  agentPool
    .command('disable-agent')
    .description('Disable an agent in a pool')
    .argument('<poolId>', 'Agent pool ID')
    .argument('<agentId>', 'Agent ID')
    .action(async (poolId: string, agentId: string) => {
      try {
        const result = await ctx.agentPools.disableAgent(parseInt(poolId), parseInt(agentId));
        outputResult(
          { fileName: `agent-disabled-${poolId}-${agentId}`, data: result, summary: `Disabled agent #${agentId} in pool #${poolId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'disable agent'); }
    });
}
