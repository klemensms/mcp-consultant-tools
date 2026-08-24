import fs from 'fs/promises';
import path from 'path';
import { auditLogger } from '@mcp-consultant-tools/core';
import type { PiiProtectionPipeline } from '@mcp-consultant-tools/core';
import type { ConnectionService } from './connection-service.js';

export interface WriteResult {
  success: boolean;
  message: string;
  objectName?: string;
  rowsAffected?: number;
}

export interface UnrestrictedBatchResult {
  batchIndex: number;
  sql: string;
  success: boolean;
  rowsAffected?: number;
  resultSet?: any[];
  error?: string;
}

export interface UnrestrictedResult {
  batches: UnrestrictedBatchResult[];
  totalBatches: number;
  completedBatches: number;
}

/**
 * Regex for valid SQL identifiers - prevents SQL injection on object names.
 */
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Patterns that are forbidden in user-provided DML queries.
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(drop|create|alter|truncate)\b/i, name: 'schema modifications' },
  { pattern: /\b(exec|execute|sp_executesql)\b/i, name: 'command execution' },
  { pattern: /\bxp_\w+/i, name: 'xp_ system procedures' },
  { pattern: /\bsp_\w+/i, name: 'sp_ system procedures' },
  { pattern: /\b(grant|revoke|deny)\b/i, name: 'permission changes' },
  { pattern: /\b(openquery|openrowset|opendatasource)\b/i, name: 'linked server queries' },
];

/**
 * WriteService handles all write operations against Azure SQL databases:
 * view management, stored procedure management/execution, and DML (INSERT/UPDATE/DELETE).
 *
 * Depends on ConnectionService for connection pooling.
 */
export class WriteService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly piiPipeline?: PiiProtectionPipeline
  ) {}

  private redactRows<T>(rows: T[]): T[] {
    if (!this.piiPipeline?.isEnabled || rows.length === 0) return rows;
    return this.piiPipeline.redactResponse('row', rows).data;
  }

  /**
   * Validate that a string is a safe SQL identifier (schema name, table name, etc.).
   * Prevents SQL injection on object names.
   */
  private validateIdentifier(name: string, label: string): void {
    if (!VALID_IDENTIFIER.test(name)) {
      throw new Error(
        `Invalid ${label}: '${name}'. ` +
        `Only alphanumeric characters and underscores are allowed, ` +
        `and it must start with a letter or underscore.`
      );
    }
  }

  /**
   * Strip SQL comments and normalize whitespace for validation.
   */
  private cleanSql(query: string): string {
    return query
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validate a DML query starts with the expected keyword and contains no dangerous patterns.
   */
  private validateDmlQuery(query: string, expectedKeyword: string): void {
    const cleaned = this.cleanSql(query).toLowerCase();

    if (!cleaned.startsWith(expectedKeyword.toLowerCase())) {
      throw new Error(
        `Query must start with ${expectedKeyword}. ` +
        `Got: '${cleaned.substring(0, 50)}...'`
      );
    }

    for (const { pattern, name } of DANGEROUS_PATTERNS) {
      if (pattern.test(cleaned)) {
        throw new Error(
          `Query contains forbidden pattern (${name}). ` +
          `Only ${expectedKeyword} statements are allowed in this operation.`
        );
      }
    }
  }

  /**
   * Create or alter a view.
   */
  async manageView(
    serverId: string,
    database: string,
    schemaName: string,
    viewName: string,
    selectBody: string
  ): Promise<WriteResult> {
    this.validateIdentifier(schemaName, 'schema name');
    this.validateIdentifier(viewName, 'view name');

    const timer = auditLogger.startTimer();
    const fullName = `[${schemaName}].[${viewName}]`;

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const sql = `CREATE OR ALTER VIEW ${fullName} AS ${selectBody}`;
      await pool.request().query(sql);

      const result: WriteResult = {
        success: true,
        message: `View ${fullName} created or updated successfully.`,
        objectName: `${schemaName}.${viewName}`,
      };

      auditLogger.log({
        operation: 'manage-view',
        operationType: 'CREATE',
        componentType: 'View',
        componentName: `${serverId}/${database}/${fullName}`,
        success: true,
        parameters: { schemaName, viewName, selectBodyLength: selectBody.length },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'manage-view',
        operationType: 'CREATE',
        componentType: 'View',
        componentName: `${serverId}/${database}/${fullName}`,
        success: false,
        error: errorMsg,
        parameters: { schemaName, viewName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to create/alter view ${fullName}: ${errorMsg}`);
    }
  }

  /**
   * Deploy a view from a local .sql file.
   * Reads the file and executes its contents as-is against the database.
   * The file must contain a valid CREATE OR ALTER VIEW statement.
   */
  async deployViewFromFile(
    serverId: string,
    database: string,
    filePath: string
  ): Promise<WriteResult> {
    const timer = auditLogger.startTimer();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const resolvedPath = path.resolve(normalizedPath);

    if (!resolvedPath.toLowerCase().endsWith('.sql')) {
      throw new Error(`File must have a .sql extension. Got: '${path.basename(resolvedPath)}'`);
    }

    let sql: string;
    try {
      sql = await fs.readFile(resolvedPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: '${resolvedPath}'`);
      }
      throw new Error(`Failed to read file '${resolvedPath}': ${error.message}`);
    }

    const trimmedSql = this.stripGoBatchSeparators(sql);
    if (!trimmedSql) {
      throw new Error(`File is empty: '${resolvedPath}'`);
    }

    const cleanedForValidation = this.cleanSql(trimmedSql).toLowerCase();
    if (!cleanedForValidation.startsWith('create or alter view')) {
      throw new Error(
        `File must contain a CREATE OR ALTER VIEW statement. ` +
        `Got: '${cleanedForValidation.substring(0, 60)}...'`
      );
    }

    let viewDisplayName = 'unknown';
    const nameMatch = cleanedForValidation.match(
      /create\s+or\s+alter\s+view\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?/i
    );
    if (nameMatch) {
      const schema = nameMatch[1] || 'dbo';
      const name = nameMatch[2];
      viewDisplayName = `[${schema}].[${name}]`;
    }

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      await pool.request().query(trimmedSql);

      const result: WriteResult = {
        success: true,
        message: `View ${viewDisplayName} deployed successfully from file '${path.basename(resolvedPath)}'.`,
        objectName: viewDisplayName,
      };

      auditLogger.log({
        operation: 'deploy-view-file',
        operationType: 'CREATE',
        componentType: 'View',
        componentName: `${serverId}/${database}/${viewDisplayName}`,
        success: true,
        parameters: { filePath: resolvedPath, fileSize: trimmedSql.length, viewName: viewDisplayName },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'deploy-view-file',
        operationType: 'CREATE',
        componentType: 'View',
        componentName: `${serverId}/${database}/${viewDisplayName}`,
        success: false,
        error: errorMsg,
        parameters: { filePath: resolvedPath, viewName: viewDisplayName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to deploy view from file '${path.basename(resolvedPath)}': ${errorMsg}`);
    }
  }

  /**
   * Drop a view if it exists.
   */
  async dropView(
    serverId: string,
    database: string,
    schemaName: string,
    viewName: string
  ): Promise<WriteResult> {
    this.validateIdentifier(schemaName, 'schema name');
    this.validateIdentifier(viewName, 'view name');

    const timer = auditLogger.startTimer();
    const fullName = `[${schemaName}].[${viewName}]`;

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      await pool.request().query(`DROP VIEW IF EXISTS ${fullName}`);

      const result: WriteResult = {
        success: true,
        message: `View ${fullName} dropped successfully (if it existed).`,
        objectName: `${schemaName}.${viewName}`,
      };

      auditLogger.log({
        operation: 'drop-view',
        operationType: 'DELETE',
        componentType: 'View',
        componentName: `${serverId}/${database}/${fullName}`,
        success: true,
        parameters: { schemaName, viewName },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'drop-view',
        operationType: 'DELETE',
        componentType: 'View',
        componentName: `${serverId}/${database}/${fullName}`,
        success: false,
        error: errorMsg,
        parameters: { schemaName, viewName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to drop view ${fullName}: ${errorMsg}`);
    }
  }

  /**
   * Create or alter a stored procedure.
   */
  async manageSproc(
    serverId: string,
    database: string,
    schemaName: string,
    sprocName: string,
    definition: string
  ): Promise<WriteResult> {
    this.validateIdentifier(schemaName, 'schema name');
    this.validateIdentifier(sprocName, 'procedure name');

    const timer = auditLogger.startTimer();
    const fullName = `[${schemaName}].[${sprocName}]`;

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const sql = `CREATE OR ALTER PROCEDURE ${fullName} ${definition}`;
      await pool.request().query(sql);

      const result: WriteResult = {
        success: true,
        message: `Stored procedure ${fullName} created or updated successfully.`,
        objectName: `${schemaName}.${sprocName}`,
      };

      auditLogger.log({
        operation: 'manage-sproc',
        operationType: 'CREATE',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${fullName}`,
        success: true,
        parameters: { schemaName, sprocName, definitionLength: definition.length },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'manage-sproc',
        operationType: 'CREATE',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${fullName}`,
        success: false,
        error: errorMsg,
        parameters: { schemaName, sprocName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to create/alter procedure ${fullName}: ${errorMsg}`);
    }
  }

  /**
   * Deploy a stored procedure from a local .sql file.
   * Reads the file and executes its contents as-is against the database.
   * The file must contain a valid CREATE OR ALTER PROCEDURE statement.
   */
  async deploySprocFromFile(
    serverId: string,
    database: string,
    filePath: string
  ): Promise<WriteResult> {
    const timer = auditLogger.startTimer();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const resolvedPath = path.resolve(normalizedPath);

    // Validate file extension
    if (!resolvedPath.toLowerCase().endsWith('.sql')) {
      throw new Error(`File must have a .sql extension. Got: '${path.basename(resolvedPath)}'`);
    }

    // Read file
    let sql: string;
    try {
      sql = await fs.readFile(resolvedPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: '${resolvedPath}'`);
      }
      throw new Error(`Failed to read file '${resolvedPath}': ${error.message}`);
    }

    const trimmedSql = this.stripGoBatchSeparators(sql);
    if (!trimmedSql) {
      throw new Error(`File is empty: '${resolvedPath}'`);
    }

    // Validate content starts with CREATE OR ALTER PROCEDURE (ignoring leading comments)
    const cleanedForValidation = this.cleanSql(trimmedSql).toLowerCase();
    if (!cleanedForValidation.startsWith('create or alter procedure')) {
      throw new Error(
        `File must contain a CREATE OR ALTER PROCEDURE statement. ` +
        `Got: '${cleanedForValidation.substring(0, 60)}...'`
      );
    }

    // Extract procedure name for audit logging (lightweight regex on cleaned SQL)
    let procDisplayName = 'unknown';
    const nameMatch = cleanedForValidation.match(
      /create\s+or\s+alter\s+procedure\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?/i
    );
    if (nameMatch) {
      const schema = nameMatch[1] || 'dbo';
      const name = nameMatch[2];
      procDisplayName = `[${schema}].[${name}]`;
    }

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      await pool.request().query(trimmedSql);

      const result: WriteResult = {
        success: true,
        message: `Stored procedure ${procDisplayName} deployed successfully from file '${path.basename(resolvedPath)}'.`,
        objectName: procDisplayName,
      };

      auditLogger.log({
        operation: 'deploy-sproc-file',
        operationType: 'CREATE',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${procDisplayName}`,
        success: true,
        parameters: { filePath: resolvedPath, fileSize: trimmedSql.length, procName: procDisplayName },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'deploy-sproc-file',
        operationType: 'CREATE',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${procDisplayName}`,
        success: false,
        error: errorMsg,
        parameters: { filePath: resolvedPath, procName: procDisplayName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to deploy procedure from file '${path.basename(resolvedPath)}': ${errorMsg}`);
    }
  }

  /**
   * Drop a stored procedure if it exists.
   */
  async dropSproc(
    serverId: string,
    database: string,
    schemaName: string,
    sprocName: string
  ): Promise<WriteResult> {
    this.validateIdentifier(schemaName, 'schema name');
    this.validateIdentifier(sprocName, 'procedure name');

    const timer = auditLogger.startTimer();
    const fullName = `[${schemaName}].[${sprocName}]`;

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      await pool.request().query(`DROP PROCEDURE IF EXISTS ${fullName}`);

      const result: WriteResult = {
        success: true,
        message: `Stored procedure ${fullName} dropped successfully (if it existed).`,
        objectName: `${schemaName}.${sprocName}`,
      };

      auditLogger.log({
        operation: 'drop-sproc',
        operationType: 'DELETE',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${fullName}`,
        success: true,
        parameters: { schemaName, sprocName },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'drop-sproc',
        operationType: 'DELETE',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${fullName}`,
        success: false,
        error: errorMsg,
        parameters: { schemaName, sprocName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to drop procedure ${fullName}: ${errorMsg}`);
    }
  }

  /**
   * Execute a stored procedure using mssql request.execute() (not raw SQL).
   * Parameters are passed via request.input() for safety.
   */
  async executeSproc(
    serverId: string,
    database: string,
    schemaName: string,
    sprocName: string,
    parameters?: Record<string, any>
  ): Promise<{ rows: any[]; rowCount: number; returnValue: number }> {
    this.validateIdentifier(schemaName, 'schema name');
    this.validateIdentifier(sprocName, 'procedure name');

    const timer = auditLogger.startTimer();
    const fullName = `${schemaName}.${sprocName}`;

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const request = pool.request();

      if (parameters) {
        for (const [key, value] of Object.entries(parameters)) {
          request.input(key, value);
        }
      }

      const result = await request.execute(fullName);

      const rawRows = result.recordset || [];
      const rows = this.redactRows(rawRows);
      const sprocResult = {
        rows,
        rowCount: rows.length,
        returnValue: result.returnValue,
      };

      auditLogger.log({
        operation: 'execute-sproc',
        operationType: 'READ',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${fullName}`,
        success: true,
        parameters: {
          schemaName,
          sprocName,
          parameterCount: parameters ? Object.keys(parameters).length : 0,
          rowCount: sprocResult.rowCount,
        },
        executionTimeMs: timer(),
      });

      return sprocResult;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'execute-sproc',
        operationType: 'READ',
        componentType: 'StoredProcedure',
        componentName: `${serverId}/${database}/${fullName}`,
        success: false,
        error: errorMsg,
        parameters: { schemaName, sprocName },
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to execute procedure ${fullName}: ${errorMsg}`);
    }
  }

  /**
   * Execute an INSERT query with safety validation.
   */
  async executeInsert(
    serverId: string,
    database: string,
    query: string
  ): Promise<WriteResult> {
    const timer = auditLogger.startTimer();

    try {
      this.validateDmlQuery(query, 'INSERT');
    } catch (error: any) {
      auditLogger.log({
        operation: 'execute-insert',
        operationType: 'CREATE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: error.message,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw error;
    }

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const result = await pool.request().query(query);

      const writeResult: WriteResult = {
        success: true,
        message: `INSERT executed successfully. Rows affected: ${result.rowsAffected?.[0] ?? 0}.`,
        rowsAffected: result.rowsAffected?.[0] ?? 0,
      };

      auditLogger.log({
        operation: 'execute-insert',
        operationType: 'CREATE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: true,
        parameters: {
          query: query.substring(0, 500),
          rowsAffected: writeResult.rowsAffected,
        },
        executionTimeMs: timer(),
      });

      return writeResult;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'execute-insert',
        operationType: 'CREATE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: errorMsg,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw new Error(`INSERT execution failed: ${errorMsg}`);
    }
  }

  /**
   * Execute an UPDATE query with safety validation.
   */
  async executeUpdate(
    serverId: string,
    database: string,
    query: string
  ): Promise<WriteResult> {
    const timer = auditLogger.startTimer();

    try {
      this.validateDmlQuery(query, 'UPDATE');
    } catch (error: any) {
      auditLogger.log({
        operation: 'execute-update',
        operationType: 'UPDATE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: error.message,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw error;
    }

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const result = await pool.request().query(query);

      const writeResult: WriteResult = {
        success: true,
        message: `UPDATE executed successfully. Rows affected: ${result.rowsAffected?.[0] ?? 0}.`,
        rowsAffected: result.rowsAffected?.[0] ?? 0,
      };

      auditLogger.log({
        operation: 'execute-update',
        operationType: 'UPDATE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: true,
        parameters: {
          query: query.substring(0, 500),
          rowsAffected: writeResult.rowsAffected,
        },
        executionTimeMs: timer(),
      });

      return writeResult;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'execute-update',
        operationType: 'UPDATE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: errorMsg,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw new Error(`UPDATE execution failed: ${errorMsg}`);
    }
  }

  /**
   * Execute a DELETE query with safety validation.
   * REQUIRES a WHERE clause to prevent accidental full-table deletes.
   */
  async executeDelete(
    serverId: string,
    database: string,
    query: string
  ): Promise<WriteResult> {
    const timer = auditLogger.startTimer();

    try {
      this.validateDmlQuery(query, 'DELETE');
    } catch (error: any) {
      auditLogger.log({
        operation: 'execute-delete',
        operationType: 'DELETE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: error.message,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw error;
    }

    // Require WHERE clause for DELETE operations
    const cleaned = this.cleanSql(query).toLowerCase();
    if (!cleaned.includes('where')) {
      const error = 'DELETE queries must include a WHERE clause to prevent accidental full-table deletion. ' +
        'If you truly need to delete all rows, use DELETE FROM table WHERE 1=1.';
      auditLogger.log({
        operation: 'execute-delete',
        operationType: 'DELETE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw new Error(error);
    }

    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const result = await pool.request().query(query);

      const writeResult: WriteResult = {
        success: true,
        message: `DELETE executed successfully. Rows affected: ${result.rowsAffected?.[0] ?? 0}.`,
        rowsAffected: result.rowsAffected?.[0] ?? 0,
      };

      auditLogger.log({
        operation: 'execute-delete',
        operationType: 'DELETE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: true,
        parameters: {
          query: query.substring(0, 500),
          rowsAffected: writeResult.rowsAffected,
        },
        executionTimeMs: timer(),
      });

      return writeResult;
    } catch (error: any) {
      const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);
      auditLogger.log({
        operation: 'execute-delete',
        operationType: 'DELETE',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: errorMsg,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer(),
      });
      throw new Error(`DELETE execution failed: ${errorMsg}`);
    }
  }

  /**
   * Strip GO batch separators from SQL file contents.
   * GO is a client-tool directive (SSMS, sqlcmd) not understood by the mssql/tedious driver.
   */
  private stripGoBatchSeparators(sql: string): string {
    return sql.replace(/^\s*GO\s*$/gim, '').trim();
  }

  /**
   * Split T-SQL on GO batch separators.
   * Matches lines containing only GO (case-insensitive, optional whitespace).
   */
  private splitBatches(sql: string): string[] {
    return sql
      .split(/^\s*GO\s*$/im)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);
  }

  /**
   * Detect the primary operation type from a SQL batch for audit logging.
   */
  private detectOperationType(sql: string): 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' {
    const cleaned = this.cleanSql(sql).toLowerCase();
    if (cleaned.startsWith('select')) return 'READ';
    if (cleaned.startsWith('insert') || cleaned.startsWith('create')) return 'CREATE';
    if (cleaned.startsWith('update') || cleaned.startsWith('alter')) return 'UPDATE';
    if (cleaned.startsWith('delete') || cleaned.startsWith('drop') || cleaned.startsWith('truncate')) return 'DELETE';
    return 'UPDATE'; // default for EXEC, etc.
  }

  /**
   * Execute any T-SQL without restrictions. Supports multi-batch scripts with GO separators.
   * This is the "break glass" method - no validation, no keyword restrictions.
   * The caller (MCP tool / CLI) is responsible for gating behind SQL_ENABLE_UNRESTRICTED.
   */
  async executeUnrestricted(
    serverId: string,
    database: string,
    sql: string
  ): Promise<UnrestrictedResult> {
    const batches = this.splitBatches(sql);
    const results: UnrestrictedBatchResult[] = [];

    if (batches.length === 0) {
      throw new Error('No SQL batches to execute. The input was empty or contained only GO separators.');
    }

    const pool = await this.connectionService.getPool(serverId, database);

    for (let i = 0; i < batches.length; i++) {
      const batchSql = batches[i];
      const timer = auditLogger.startTimer();
      const opType = this.detectOperationType(batchSql);

      try {
        const request = pool.request();
        const result = await request.query(batchSql);

        const batchResult: UnrestrictedBatchResult = {
          batchIndex: i,
          sql: batchSql.substring(0, 200),
          success: true,
          rowsAffected: result.rowsAffected?.reduce((a, b) => a + b, 0) ?? 0,
        };

        // Include result set if there are rows (SELECT-like statements)
        if (result.recordset && result.recordset.length > 0) {
          batchResult.resultSet = this.redactRows(result.recordset);
        }

        results.push(batchResult);

        auditLogger.log({
          operation: 'execute-unrestricted',
          operationType: opType,
          componentType: 'Query',
          componentName: `${serverId}/${database}`,
          success: true,
          parameters: {
            batchIndex: i,
            totalBatches: batches.length,
            sql: batchSql.substring(0, 500),
            rowsAffected: batchResult.rowsAffected,
          },
          executionTimeMs: timer(),
        });
      } catch (error: any) {
        const errorMsg = this.connectionService.sanitizeErrorMessage(error.message);

        results.push({
          batchIndex: i,
          sql: batchSql.substring(0, 200),
          success: false,
          error: errorMsg,
        });

        auditLogger.log({
          operation: 'execute-unrestricted',
          operationType: opType,
          componentType: 'Query',
          componentName: `${serverId}/${database}`,
          success: false,
          error: errorMsg,
          parameters: {
            batchIndex: i,
            totalBatches: batches.length,
            sql: batchSql.substring(0, 500),
          },
          executionTimeMs: timer(),
        });

        // Stop on first failure
        break;
      }
    }

    return {
      batches: results,
      totalBatches: batches.length,
      completedBatches: results.filter(r => r.success).length,
    };
  }
}
