#!/usr/bin/env node

/**
 * mcp-consultant-tools Meta CLI
 *
 * Discovery CLI that lists all available service CLIs and their packages.
 * This does NOT wrap individual CLIs - it serves as a directory to help
 * users find the right CLI for their integration.
 */

import { createRequire } from 'node:module';
import { createCliProgram } from '@mcp-consultant-tools/core';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

interface ServiceCliInfo {
  package: string;
  binary: string;
  description: string;
  toolCount: string;
}

const SERVICE_CLIS: ServiceCliInfo[] = [
  {
    package: '@mcp-consultant-tools/powerplatform',
    binary: 'mcp-pp-cli',
    description: 'PowerPlatform read-only (metadata, flows, apps, views)',
    toolCount: '46',
  },
  {
    package: '@mcp-consultant-tools/powerplatform-customization',
    binary: 'mcp-pp-custom-cli',
    description: 'PowerPlatform schema changes (entities, fields, solutions)',
    toolCount: '70',
  },
  {
    package: '@mcp-consultant-tools/powerplatform-data',
    binary: 'mcp-pp-data-cli',
    description: 'PowerPlatform data CRUD (records, batch operations)',
    toolCount: '10',
  },
  {
    package: '@mcp-consultant-tools/azure-devops',
    binary: 'mcp-ado-cli',
    description: 'Azure DevOps (wikis, work items, PRs, builds, sync)',
    toolCount: '46',
  },
  {
    package: '@mcp-consultant-tools/azure-devops-admin',
    binary: 'mcp-ado-admin-cli',
    description: 'Azure DevOps admin (pipelines, agents, environments)',
    toolCount: '60',
  },
  {
    package: '@mcp-consultant-tools/azure-management',
    binary: 'mcp-azure-mgmt-cli',
    description: 'Azure ARM API (resource groups, deployments, RBAC)',
    toolCount: '26',
  },
  {
    package: '@mcp-consultant-tools/azure-data-factory',
    binary: 'mcp-adf-cli',
    description: 'Azure Data Factory (pipelines, datasets, triggers)',
    toolCount: '24',
  },
  {
    package: '@mcp-consultant-tools/azure-storage',
    binary: 'mcp-storage-cli',
    description: 'Azure Storage (blobs, queues, tables, file shares)',
    toolCount: '47',
  },
  {
    package: '@mcp-consultant-tools/azure-sql',
    binary: 'mcp-sql-cli',
    description: 'Azure SQL (queries, schema, stored procedures)',
    toolCount: '11',
  },
  {
    package: '@mcp-consultant-tools/azure-b2c',
    binary: 'mcp-azure-b2c-cli',
    description: 'Azure AD B2C (users, policies, applications)',
    toolCount: '11',
  },
  {
    package: '@mcp-consultant-tools/application-insights',
    binary: 'mcp-appins-cli',
    description: 'Application Insights (telemetry, queries, metrics)',
    toolCount: '10',
  },
  {
    package: '@mcp-consultant-tools/log-analytics',
    binary: 'mcp-loganalytics-cli',
    description: 'Log Analytics (KQL queries, workspaces, alerts)',
    toolCount: '13',
  },
  {
    package: '@mcp-consultant-tools/service-bus',
    binary: 'mcp-sb-cli',
    description: 'Service Bus (queues, topics, messages)',
    toolCount: '8',
  },
  {
    package: '@mcp-consultant-tools/sharepoint',
    binary: 'mcp-spo-cli',
    description: 'SharePoint Online (lists, documents, sites)',
    toolCount: '16',
  },
  {
    package: '@mcp-consultant-tools/fabric',
    binary: 'mcp-fabric-cli',
    description: 'Microsoft Fabric (workspaces, capacities, items, shortcuts, domains, admin)',
    toolCount: '27',
  },
  {
    package: '@mcp-consultant-tools/figma',
    binary: 'mcp-figma-cli',
    description: 'Figma (design data, semantic extract, ADO stories)',
    toolCount: '4',
  },
  {
    package: '@mcp-consultant-tools/github-enterprise',
    binary: 'mcp-ghe-cli',
    description: 'GitHub Enterprise (repos, issues, PRs, actions)',
    toolCount: '22',
  },
  {
    package: '@mcp-consultant-tools/rest-api',
    binary: 'mcp-rest-api-cli',
    description: 'Generic REST API (HTTP requests with auth)',
    toolCount: '4',
  },
  {
    package: '@mcp-consultant-tools/teams',
    binary: 'mcp-teams-cli',
    description: 'Microsoft Teams (channels, messages, chats)',
    toolCount: '7',
  },
];

const program = createCliProgram({
  name: 'mcp-tools-cli',
  description:
    'MCP Consultant Tools - discovery CLI for all available service packages',
  version: pkg.version,
});

program
  .command('list')
  .description('List all available service CLI packages')
  .action(() => {
    console.log('');
    console.log('Available MCP Consultant Tools CLI packages:');
    console.log('='.repeat(95));
    console.log('');
    console.log(
      padRight('Binary', 24) +
        padRight('Tools', 7) +
        'Description',
    );
    console.log('-'.repeat(95));

    for (const svc of SERVICE_CLIS) {
      console.log(
        padRight(svc.binary, 24) +
          padRight(svc.toolCount, 7) +
          svc.description,
      );
    }

    console.log('');
    console.log('-'.repeat(95));
    console.log(`Total: ${SERVICE_CLIS.length} packages`);
    console.log('');
    console.log('Usage:');
    console.log('  npx --package=<package> <binary> --help');
    console.log('');
    console.log('Example:');
    console.log(
      '  npx --package=@mcp-consultant-tools/azure-devops mcp-ado-cli --help',
    );
    console.log(
      '  npx --package=@mcp-consultant-tools/powerplatform mcp-pp-cli --help',
    );
    console.log('');
  });

program.parseAsync(process.argv).catch((error: any) => {
  console.error('CLI error:', error.message);
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function padRight(str: string, len: number): string {
  return str.length >= len ? str + ' ' : str + ' '.repeat(len - str.length);
}
