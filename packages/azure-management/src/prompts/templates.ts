import { z } from 'zod';
import type { ServiceContext } from '../types.js';

export function registerManagementPrompts(server: any, _ctx: ServiceContext): void {
  server.prompt(
    'azure-resource-discovery',
    'Guide through discovering resources in an Azure subscription',
    {},
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help me discover and understand the Azure resources in this subscription.

Start by:
1. List all resource groups using list-resource-groups
2. Get an overview of all resources using list-resources
3. Based on what you find, drill into specific resource types of interest

Focus on identifying:
- Function Apps and App Services
- Key Vaults and their secrets
- Storage accounts
- SQL servers and databases
- Monitoring/alerting setup`,
          },
        },
      ],
    })
  );

  server.prompt(
    'function-app-troubleshooting',
    'Diagnose issues with an Azure Function App',
    {
      functionAppName: z.string().describe('Name of the Function App to troubleshoot'),
    },
    async ({ functionAppName }: { functionAppName: string }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help me troubleshoot the Function App: ${functionAppName}

Use these tools to investigate:
1. get-function-app with includeConfiguration=true to check settings
2. list-functions to see all functions and their triggers
3. Check if the app is running (state)
4. Review app settings for any obvious configuration issues
5. Check if there are related alerts using list-alert-rules

Look for common issues:
- Missing or incorrect app settings
- Functions that are disabled
- Connection string problems
- Scaling/plan issues`,
          },
        },
      ],
    })
  );

  server.prompt(
    'alert-investigation',
    'Investigate triggered alerts and their targets',
    {},
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help me understand the alerting setup in this subscription.

1. Use list-alert-rules to see all configured alerts
2. Use list-action-groups to see notification targets
3. Use list-smart-detector-alerts for AI-based anomaly detection

For each critical alert, explain:
- What metric/condition triggers it
- What resources it monitors
- Who gets notified
- Recommended thresholds`,
          },
        },
      ],
    })
  );

  server.prompt(
    'infrastructure-overview',
    'Generate a comprehensive infrastructure summary report',
    {},
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a comprehensive infrastructure report for this Azure subscription.

Collect data using:
1. list-resource-groups - to understand organization
2. list-resources - for overall resource inventory
3. list-function-apps - compute resources
4. list-app-services - web apps
5. list-key-vaults - security
6. list-storage-accounts - storage
7. list-sql-servers - databases
8. list-alert-rules - monitoring

Generate a report with:
- Executive summary
- Resource count by type and location
- Compute resources (functions, web apps)
- Data stores (storage, SQL)
- Security posture (Key Vaults, network rules)
- Monitoring coverage`,
          },
        },
      ],
    })
  );
}
