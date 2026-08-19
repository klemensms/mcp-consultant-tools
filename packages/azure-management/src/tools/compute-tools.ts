import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, RESOURCE_GROUP_EXAMPLES } from '../tool-examples.js';

export function registerComputeTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-virtual-machines',
    'List Azure virtual machines in the subscription or resource group. Runtime power state is NOT collected by default: every VM lands in the "not collected" bucket and no row carries powerState, so a deallocated VM is indistinguishable from a running one until you pass includeStatus (one extra ARM call per VM). summary.note always says what was and was not collected, and a refused instanceView goes to the "unavailable" bucket rather than to any power state.',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
      includeStatus: z
        .boolean()
        .optional()
        .describe(
          'Collect runtime power state per VM via VirtualMachines_InstanceView (default: false, costs one extra ARM call per VM)'
        ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const result = await ctx.management.compute.listVirtualMachines(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing virtual machines:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
