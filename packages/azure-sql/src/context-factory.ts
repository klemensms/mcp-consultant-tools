/**
 * Shared ServiceContext factory for Azure SQL.
 * Used by both MCP server (index.ts) and CLI (cli.ts).
 */

import { createPiiPipelineFromEnv } from '@mcp-consultant-tools/core';
import { ConnectionService } from './services/connection-service.js';
import { QueryService } from './services/query-service.js';
import { WriteService } from './services/write-service.js';
import { PerformanceService } from './services/performance-service.js';
import { SessionService } from './services/session-service.js';
import { SpaceService } from './services/space-service.js';
import type { AzureSqlConfig } from './services/connection-service.js';
import type { ServiceContext } from './types.js';

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function pickEnvironmentIdentifier(): string | undefined {
  if (process.env.AZURE_SQL_SERVER) return process.env.AZURE_SQL_SERVER;
  const serversJson = process.env.AZURE_SQL_SERVERS;
  if (!serversJson) return undefined;
  try {
    const parsed = JSON.parse(serversJson);
    if (Array.isArray(parsed) && typeof parsed[0]?.server === 'string') {
      return parsed[0].server as string;
    }
  } catch {
    // fall through
  }
  return undefined;
}

export function createServiceContext(): ServiceContext {
  const piiPipeline = createPiiPipelineFromEnv({
    environmentIdentifier: pickEnvironmentIdentifier(),
  });
  let connection: ConnectionService | null = null;
  let query: QueryService | null = null;
  let write: WriteService | null = null;
  let performance: PerformanceService | null = null;
  let session: SessionService | null = null;
  let space: SpaceService | null = null;

  function getConnection(): ConnectionService {
    if (!connection) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.AZURE_SQL_SERVERS) {
        try {
          resources = JSON.parse(process.env.AZURE_SQL_SERVERS);
        } catch (error) {
          throw new Error("Failed to parse AZURE_SQL_SERVERS JSON");
        }
      } else if (process.env.AZURE_SQL_SERVER && process.env.AZURE_SQL_DATABASE) {
        resources = [{
          id: 'default',
          name: 'Default SQL Server',
          server: process.env.AZURE_SQL_SERVER,
          port: parseInt(process.env.AZURE_SQL_PORT || "1433"),
          active: true,
          databases: [{
            name: process.env.AZURE_SQL_DATABASE,
            active: true,
          }],
          username: process.env.AZURE_SQL_USERNAME || '',
          password: process.env.AZURE_SQL_PASSWORD || '',
        }];
      } else {
        missingConfig.push("AZURE_SQL_SERVERS or AZURE_SQL_SERVER/AZURE_SQL_DATABASE");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure SQL configuration: ${missingConfig.join(", ")}`);
      }

      const config: AzureSqlConfig = {
        resources,
        queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
        maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
        maxResponseSizeMb: parseInt(process.env.AZURE_SQL_MAX_RESPONSE_SIZE_MB || "10"),
      };

      connection = new ConnectionService(config);
      console.error("Azure SQL service initialized");
    }
    return connection;
  }

  function getQuery(): QueryService {
    return query ??= new QueryService(getConnection(), piiPipeline);
  }

  return {
    get connection() { return getConnection(); },
    get query() { return getQuery(); },
    get write() { return write ??= new WriteService(getConnection(), piiPipeline); },
    get performance() { return performance ??= new PerformanceService(getQuery()); },
    get session() { return session ??= new SessionService(getQuery()); },
    get space() { return space ??= new SpaceService(getQuery()); },
    checkViewManageEnabled() {
      if (process.env.SQL_ENABLE_VIEW_MANAGE !== 'true') {
        throw new Error('View management is disabled. Set SQL_ENABLE_VIEW_MANAGE=true to enable CREATE OR ALTER VIEW.');
      }
    },
    checkViewDropEnabled() {
      if (process.env.SQL_ENABLE_VIEW_DROP !== 'true') {
        throw new Error('View drop is disabled. Set SQL_ENABLE_VIEW_DROP=true to enable DROP VIEW.');
      }
    },
    checkSprocManageEnabled() {
      if (process.env.SQL_ENABLE_SPROC_MANAGE !== 'true') {
        throw new Error('Stored procedure management is disabled. Set SQL_ENABLE_SPROC_MANAGE=true to enable CREATE OR ALTER PROCEDURE.');
      }
    },
    checkSprocDropEnabled() {
      if (process.env.SQL_ENABLE_SPROC_DROP !== 'true') {
        throw new Error('Stored procedure drop is disabled. Set SQL_ENABLE_SPROC_DROP=true to enable DROP PROCEDURE.');
      }
    },
    checkSprocExecuteEnabled() {
      if (process.env.SQL_ENABLE_SPROC_EXECUTE !== 'true') {
        throw new Error('Stored procedure execution is disabled. Set SQL_ENABLE_SPROC_EXECUTE=true to enable EXEC.');
      }
    },
    checkInsertEnabled() {
      if (process.env.SQL_ENABLE_INSERT !== 'true') {
        throw new Error('INSERT operations are disabled. Set SQL_ENABLE_INSERT=true to enable.');
      }
    },
    checkUpdateEnabled() {
      if (process.env.SQL_ENABLE_UPDATE !== 'true') {
        throw new Error('UPDATE operations are disabled. Set SQL_ENABLE_UPDATE=true to enable.');
      }
    },
    checkDeleteEnabled() {
      if (process.env.SQL_ENABLE_DELETE !== 'true') {
        throw new Error('DELETE operations are disabled. Set SQL_ENABLE_DELETE=true to enable.');
      }
    },
  };
}
