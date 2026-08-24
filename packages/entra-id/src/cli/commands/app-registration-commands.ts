/**
 * App registration CLI commands - 2 commands mapping 1:1 to the entra-* MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import {
  parsePositiveInt,
  parseNonNegativeInt,
  parseEnum,
  truncationNote,
  APP_FILTERS,
  CREDENTIAL_TYPES,
} from './helpers.js';
import { DEFAULT_EXPIRY_DAYS } from '../../services/app-registration-service.js';
import type { AppRegistrationSummary } from '../../models/entra-types.js';

/** One line per app, leading with what an operator has to act on. */
function summariseApp(app: AppRegistrationSummary): string[] {
  const counts = app.credentialCounts;
  const lines = [
    `${app.displayName ?? '(no display name)'}`,
    `  App ID: ${app.appId}`,
    `  Credentials: ${counts.secrets} secret(s), ${counts.certificates} certificate(s)` +
      ` | expired: ${counts.expired}, expiring: ${counts.expiring}, active: ${counts.active}` +
      (counts.unknown > 0 ? `, unknown: ${counts.unknown}` : ''),
  ];

  for (const secret of app.secrets) {
    lines.push(
      `  Secret: ${secret.displayName ?? 'unnamed'} | ${secret.status} | expires ${secret.endDateTime ?? 'unknown'} (${secret.daysUntilExpiry ?? '?'}d)`
    );
  }
  for (const cert of app.certificates) {
    lines.push(
      `  Certificate: ${cert.displayName ?? 'unnamed'} | ${cert.status} | expires ${cert.endDateTime ?? 'unknown'} (${cert.daysUntilExpiry ?? '?'}d)`
    );
  }

  return [...lines, ''];
}

export function registerAppRegistrationCommands(program: Command, ctx: ServiceContext): void {
  const app = program.command('app').description('Entra ID app registration audit');

  app
    .command('list-app-registrations')
    .description('List app registrations with secret and certificate expiry status')
    .option('-f, --filter <filter>', `Filter: ${APP_FILTERS.join(', ')}`)
    .option('-c, --credential-type <type>', `Narrow the filter: ${CREDENTIAL_TYPES.join(', ')}`)
    .option('-d, --expiry-days <days>', `Days that count as expiring (default: ${DEFAULT_EXPIRY_DAYS})`)
    .option('-n, --name-contains <text>', 'Case-insensitive substring match on display name')
    .option('-m, --max-results <count>', 'Maximum app registrations to return')
    .action(
      async (opts: {
        filter?: string;
        credentialType?: string;
        expiryDays?: string;
        nameContains?: string;
        maxResults?: string;
      }) => {
        try {
          const result = await ctx.appRegistration.listAppRegistrations({
            filter: parseEnum(opts.filter, APP_FILTERS, '--filter'),
            credentialType: parseEnum(opts.credentialType, CREDENTIAL_TYPES, '--credential-type'),
            expiryDays: parseNonNegativeInt(opts.expiryDays, '--expiry-days'),
            nameContains: opts.nameContains,
            maxResults: parsePositiveInt(opts.maxResults, '--max-results'),
          });

          outputResult(
            {
              fileName: 'entra-app-registrations',
              data: result,
              summary: [
                `Found ${result.total} app registration(s) | expiring threshold: ${result.expiryDays} day(s)`,
                truncationNote(result.truncated),
                '',
                ...result.applications.flatMap(summariseApp),
              ]
                .filter((line) => line !== undefined)
                .join('\n'),
            },
            getGlobalFlags(program)
          );
        } catch (error) {
          handleCliError(error, 'list app registrations');
        }
      }
    );

  app
    .command('get-app-registration <appIdOrObjectId>')
    .description('Full detail for one app registration (object ID or application/client ID)')
    .option('-d, --expiry-days <days>', `Days that count as expiring (default: ${DEFAULT_EXPIRY_DAYS})`)
    .action(async (appIdOrObjectId: string, opts: { expiryDays?: string }) => {
      try {
        const expiryDays = parseNonNegativeInt(opts.expiryDays, '--expiry-days');
        const detail = await ctx.appRegistration.getAppRegistration(appIdOrObjectId, expiryDays);

        const lines: string[] = [
          `${detail.displayName ?? '(no display name)'}`,
          `  Object ID: ${detail.objectId}`,
          `  App ID:    ${detail.appId}`,
          `  Audience:  ${detail.signInAudience ?? 'unknown'}`,
          '',
          ...summariseApp(detail),
          `Redirect URIs (${detail.redirectUris.length}):`,
          ...(detail.redirectUris.length === 0
            ? ['  (none)']
            : detail.redirectUris.map((r) => `  - [${r.platform}] ${r.uri}`)),
          '',
          `API Permissions (${detail.apiPermissions.length}):`,
          ...(detail.apiPermissions.length === 0
            ? ['  (none)']
            : detail.apiPermissions.map(
                (p) =>
                  `  - ${p.resourceDisplayName}: ${p.permissionName} (${p.permissionType})` +
                  (p.unresolved ? ' [unresolved GUID]' : '')
              )),
          '',
          `Exposed Scopes (${detail.exposedScopes.length}):`,
          ...(detail.exposedScopes.length === 0
            ? ['  (none)']
            : detail.exposedScopes.map(
                (s) => `  - ${s.value ?? s.id} (${s.isEnabled ? 'enabled' : 'disabled'})`
              )),
        ];

        outputResult(
          {
            fileName: `entra-app-registration-${detail.appId}`,
            data: detail,
            summary: lines.join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get app registration');
      }
    });
}
