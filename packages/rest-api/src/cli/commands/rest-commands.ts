/**
 * REST API CLI Commands - 6 commands mapping to REST API MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import type { RequestOptions } from '../../models/index.js';
import { outputResult } from '../output.js';

export function registerRestCommands(program: Command, ctx: ServiceContext): void {
  // Command: request (maps to rest-request tool)
  program
    .command('request')
    .description('Execute a REST API request with automatic authentication')
    .argument('<method>', 'HTTP method (GET, POST, PUT, DELETE, PATCH)')
    .argument('<endpoint>', 'Endpoint path (e.g., /api/users)')
    .option('-b, --body <json>', 'Request body as JSON string')
    .option('-H, --header <key=value...>', 'Additional headers (repeatable)', collectHeaders, {})
    .option('--host <url>', 'Override base URL for this request')
    .action(async (method: string, endpoint: string, opts: any) => {
      try {
        const upperMethod = method.toUpperCase();
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(upperMethod)) {
          throw new Error(`Invalid HTTP method: ${method}. Use GET, POST, PUT, DELETE, or PATCH.`);
        }

        // Validate endpoint doesn't contain full URL
        const urlPattern = /^(https?:\/\/|www\.)/i;
        if (urlPattern.test(endpoint)) {
          throw new Error(
            'Invalid endpoint format. Do not include full URLs. Use just the path (e.g., "/api/users") and optionally specify --host to override the base URL.'
          );
        }

        let body: any;
        if (opts.body) {
          try {
            body = JSON.parse(opts.body);
          } catch {
            body = opts.body;
          }
        }

        const options: RequestOptions = {
          method: upperMethod as RequestOptions['method'],
          endpoint,
          body,
          headers: Object.keys(opts.header).length > 0 ? opts.header : undefined,
          host: opts.host,
        };

        const result = await ctx.restApi.request(options);
        outputResult(
          {
            fileName: `request-${upperMethod}-${endpoint.replace(/\//g, '-').replace(/^-/, '')}`,
            data: result,
            summary: `${upperMethod} ${endpoint} => ${result.response.statusCode} ${result.response.statusText} (${result.response.timing})`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'REST request'); }
    });

  // Command: config (maps to rest-config tool)
  program
    .command('config')
    .description('Get the current REST API service configuration summary')
    .action(async () => {
      try {
        const summary = ctx.restApi.getConfigSummary();
        outputResult(
          {
            fileName: 'rest-config',
            data: summary,
            summary: `Base URL: ${summary.baseUrl}\nAuth method: ${summary.authMethod}\nSSL verification: ${summary.sslVerification}\nResponse size limit: ${summary.responseSizeLimit}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get config'); }
    });

  // Command: refresh-token (maps to rest-refresh-token tool)
  program
    .command('refresh-token')
    .description('Force refresh the OAuth2 access token')
    .action(async () => {
      try {
        const authMethod = ctx.restApi.getAuthMethod();

        if (authMethod !== 'oauth2') {
          throw new Error(
            `Token refresh only available for OAuth2 authentication. Current auth method: ${authMethod}`
          );
        }

        ctx.restApi.clearTokenCache();
        outputResult(
          { persist: false,
            fileName: 'refresh-token',
            data: { message: 'OAuth2 token cache cleared. A new token will be acquired on the next request.' },
            summary: 'OAuth2 token cache cleared successfully.',
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'refresh token'); }
    });

  // Command: batch (maps to rest-batch-request tool)
  program
    .command('batch')
    .description('Execute multiple REST API requests sequentially from a JSON file or string')
    .argument('<requests-json>', 'JSON array of request objects, or path to JSON file')
    .option('--stop-on-error', 'Stop executing remaining requests if one fails', false)
    .action(async (requestsJson: string, opts: any) => {
      try {
        let requests: RequestOptions[];

        // Try parsing as JSON string first
        try {
          requests = JSON.parse(requestsJson);
        } catch {
          // Try reading as file
          const { readFileSync } = await import('node:fs');
          const content = readFileSync(requestsJson, 'utf-8');
          requests = JSON.parse(content);
        }

        if (!Array.isArray(requests)) {
          throw new Error('Requests must be a JSON array of request objects');
        }

        const results: {
          index: number;
          endpoint: string;
          success: boolean;
          result?: any;
          error?: string;
        }[] = [];

        for (let i = 0; i < requests.length; i++) {
          const req = requests[i];

          try {
            const result = await ctx.restApi.request(req);
            results.push({
              index: i,
              endpoint: req.endpoint,
              success: !result.validation.isError,
              result,
            });

            if (opts.stopOnError && result.validation.isError) {
              break;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.push({
              index: i,
              endpoint: req.endpoint,
              success: false,
              error: errorMessage,
            });

            if (opts.stopOnError) {
              break;
            }
          }
        }

        const data = {
          totalRequests: requests.length,
          executedRequests: results.length,
          successfulRequests: results.filter((r) => r.success).length,
          results,
        };

        outputResult(
          {
            fileName: 'batch-request',
            data,
            summary: `Batch: ${data.successfulRequests}/${data.executedRequests} successful (${data.totalRequests} total)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'batch request'); }
    });

  // Command: list-endpoints (maps to rest-list-endpoints tool)
  program
    .command('list-endpoints')
    .description('List available REST API endpoints from OpenAPI spec')
    .option('-f, --filter <text>', 'Filter endpoint paths (case-insensitive contains match)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.restApi.listEndpointsAsync(opts.filter);
        outputResult(
          {
            fileName: `endpoints${opts.filter ? `-${opts.filter}` : ''}`,
            data: result,
            summary: `Found ${result.endpointCount} endpoint(s) at ${result.baseUrl}${opts.filter ? ` (filter: '${opts.filter}')` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list endpoints'); }
    });

  // Command: get-schema (maps to rest-get-schema tool)
  program
    .command('get-schema')
    .description('Get schema/field definitions for a specific entity from OpenAPI spec')
    .argument('<entity>', 'Entity name (singular or plural)')
    .action(async (entity: string) => {
      try {
        if (!ctx.restApi.hasOpenApiConfig()) {
          throw new Error(
            "No schema configuration available. Configure REST_OPENAPI_URL pointing to your API's OpenAPI/Swagger spec."
          );
        }

        const schema = await ctx.restApi.getSchemaAsync(entity);

        if (!schema) {
          throw new Error(
            `Entity '${entity}' not found. Use 'list-endpoints' to see available entities.`
          );
        }

        outputResult(
          {
            fileName: `schema-${entity}`,
            data: schema,
            summary: `Entity: ${schema.entityName} (${schema.pluralName})\nEndpoint: ${schema.endpoint}\nPrimary key: ${schema.primaryKey}\nFields: ${schema.fields.length}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get schema'); }
    });
}

/**
 * Commander option collector for repeatable --header key=value options
 */
function collectHeaders(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, ...valueParts] = value.split('=');
  if (!key || valueParts.length === 0) {
    throw new Error(`Invalid header format: '${value}'. Use key=value format.`);
  }
  previous[key.trim()] = valueParts.join('=').trim();
  return previous;
}
