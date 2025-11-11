import {
  SqlApiCollectionResponse,
  TableInfo,
  ViewInfo,
  StoredProcedureInfo,
  TriggerInfo,
  FunctionInfo,
  TableSchema,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
} from '../AzureSqlService.js';

/**
 * Format SQL query results as markdown table
 */
export function formatSqlResultsAsMarkdown(result: SqlApiCollectionResponse<any>): string {
  if (!result.rows || result.rows.length === 0) {
    return '*No results*';
  }

  // Column headers
  const header = '| ' + result.columns.join(' | ') + ' |';
  const separator = '| ' + result.columns.map(() => '---').join(' | ') + ' |';

  // Data rows
  const rows = result.rows.map(row => {
    const values = result.columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      if (typeof value === 'string' && value.length > 100) {
        return value.substring(0, 97) + '...';
      }
      return String(value);
    });
    return '| ' + values.join(' | ') + ' |';
  });

  let markdown = [header, separator, ...rows].join('\n');

  if (result.truncated) {
    markdown += `\n\n⚠️ **Results truncated to ${result.rowCount} rows.**`;
  }

  return markdown;
}

/**
 * Format table list as markdown
 */
export function formatTableList(tables: TableInfo[]): string {
  if (!tables || tables.length === 0) {
    return '*No tables found*';
  }

  const header = '| Schema | Table Name | Rows | Size (MB) |';
  const separator = '| --- | --- | ---: | ---: |';

  const rows = tables.map(table => {
    const rowCount = table.rowCount?.toLocaleString() || '0';
    const sizeMB = table.sizeMB?.toFixed(2) || '0.00';
    return `| ${table.schemaName} | ${table.tableName} | ${rowCount} | ${sizeMB} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format view list as markdown
 */
export function formatViewList(views: ViewInfo[]): string {
  if (!views || views.length === 0) {
    return '*No views found*';
  }

  const items = views.map(view => {
    return `- **${view.schemaName}.${view.viewName}**`;
  });

  return items.join('\n');
}

/**
 * Format stored procedure list as markdown
 */
export function formatProcedureList(procedures: StoredProcedureInfo[]): string {
  if (!procedures || procedures.length === 0) {
    return '*No stored procedures found*';
  }

  const items = procedures.map(proc => {
    const modified = new Date(proc.modifiedDate).toLocaleDateString();
    return `- **${proc.schemaName}.${proc.procedureName}** *(modified: ${modified})*`;
  });

  return items.join('\n');
}

/**
 * Format trigger list as markdown
 */
export function formatTriggerList(triggers: TriggerInfo[]): string {
  if (!triggers || triggers.length === 0) {
    return '*No triggers found*';
  }

  const items = triggers.map(trigger => {
    const status = trigger.isDisabled ? '⚠️ Disabled' : '✅ Enabled';
    return `- **${trigger.schemaName}.${trigger.triggerName}** on ${trigger.objectName} (${trigger.triggerEvent}) - ${status}`;
  });

  return items.join('\n');
}

/**
 * Format function list as markdown
 */
export function formatFunctionList(functions: FunctionInfo[]): string {
  if (!functions || functions.length === 0) {
    return '*No functions found*';
  }

  const items = functions.map(func => {
    return `- **${func.schemaName}.${func.functionName}** → ${func.returnType}`;
  });

  return items.join('\n');
}

/**
 * Format columns as markdown table
 */
export function formatColumnsAsMarkdown(columns: ColumnInfo[]): string {
  if (!columns || columns.length === 0) {
    return '*No columns found*';
  }

  const header = '| Column Name | Data Type | Max Length | Nullable | Default | Identity |';
  const separator = '| --- | --- | ---: | --- | --- | --- |';

  const rows = columns.map(col => {
    const maxLength = col.maxLength !== null ? String(col.maxLength) : 'N/A';
    const nullable = col.isNullable === 'YES' ? '✓' : '';
    const defaultValue = col.defaultValue || '';
    const identity = col.isIdentity === 1 ? '✓' : '';

    return `| ${col.columnName} | ${col.dataType} | ${maxLength} | ${nullable} | ${defaultValue} | ${identity} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format indexes as markdown table
 */
export function formatIndexesAsMarkdown(indexes: IndexInfo[]): string {
  if (!indexes || indexes.length === 0) {
    return '*No indexes found*';
  }

  const header = '| Index Name | Type | Columns | Unique | Primary Key |';
  const separator = '| --- | --- | --- | --- | --- |';

  const rows = indexes.map(idx => {
    const unique = idx.isUnique ? '✓' : '';
    const pk = idx.isPrimaryKey ? '✓' : '';

    return `| ${idx.indexName} | ${idx.indexType} | ${idx.columns} | ${unique} | ${pk} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format foreign keys as markdown table
 */
export function formatForeignKeysAsMarkdown(foreignKeys: ForeignKeyInfo[]): string {
  if (!foreignKeys || foreignKeys.length === 0) {
    return '*No foreign keys found*';
  }

  const header = '| Foreign Key | Column | References |';
  const separator = '| --- | --- | --- |';

  const rows = foreignKeys.map(fk => {
    const references = `${fk.referencedSchema}.${fk.referencedTable}(${fk.referencedColumn})`;
    return `| ${fk.foreignKeyName} | ${fk.columnName} | ${references} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format table schema as comprehensive markdown
 */
export function formatTableSchemaAsMarkdown(schema: TableSchema): string {
  let md = `# Table: ${schema.schemaName}.${schema.tableName}\n\n`;

  md += `## Columns (${schema.columns.length})\n\n`;
  md += formatColumnsAsMarkdown(schema.columns);

  md += `\n\n## Indexes (${schema.indexes.length})\n\n`;
  md += formatIndexesAsMarkdown(schema.indexes);

  if (schema.foreignKeys && schema.foreignKeys.length > 0) {
    md += `\n\n## Foreign Keys (${schema.foreignKeys.length})\n\n`;
    md += formatForeignKeysAsMarkdown(schema.foreignKeys);
  }

  return md;
}

/**
 * Format database overview as markdown
 */
export function formatDatabaseOverview(
  tables: TableInfo[],
  views: ViewInfo[],
  procedures: StoredProcedureInfo[],
  triggers: TriggerInfo[],
  functions: FunctionInfo[]
): string {
  let md = `## Azure SQL Database Overview\n\n`;

  md += `This is a comprehensive overview of the connected Azure SQL Database:\n\n`;

  md += `### Tables (${tables.length})\n\n`;
  md += formatTableList(tables);

  md += `\n\n### Views (${views.length})\n\n`;
  md += formatViewList(views);

  md += `\n\n### Stored Procedures (${procedures.length})\n\n`;
  md += formatProcedureList(procedures);

  md += `\n\n### Triggers (${triggers.length})\n\n`;
  md += formatTriggerList(triggers);

  md += `\n\n### Functions (${functions.length})\n\n`;
  md += formatFunctionList(functions);

  md += `\n\nYou can query tables and views using the sql-execute-query tool.`;

  return md;
}

/**
 * Format server list as markdown
 */
export function formatServerListAsMarkdown(servers: any[]): string {
  if (servers.length === 0) {
    return 'No SQL servers configured.';
  }

  let md = `# Configured SQL Servers\n\n`;
  md += `**Total Servers:** ${servers.length}\n`;
  md += `**Active Servers:** ${servers.filter(s => s.active).length}\n\n`;

  md += `| Server ID | Name | Server | Port | Status | Databases | Auth Method | Description |\n`;
  md += `|-----------|------|--------|------|--------|-----------|-------------|-------------|\n`;

  for (const server of servers) {
    const status = server.active ? '✅ Active' : '❌ Inactive';
    const dbCount = server.databaseCount || 0;
    const description = server.description || '-';

    md += `| ${server.id} | ${server.name} | ${server.server} | ${server.port} | ${status} | ${dbCount} | ${server.authMethod} | ${description} |\n`;
  }

  md += `\n\n**Usage:**\n`;
  md += `- Use \`sql-list-databases\` to see databases on a server\n`;
  md += `- Use \`sql-test-connection\` to test connectivity to a specific database\n`;
  md += `- Use \`sql-list-tables\` and other schema tools to explore database objects\n`;

  return md;
}

/**
 * Format database list as markdown
 */
export function formatDatabaseListAsMarkdown(serverId: string, databases: any[]): string {
  if (databases.length === 0) {
    return `No databases configured on server '${serverId}'.`;
  }

  let md = `# Databases on Server: ${serverId}\n\n`;
  md += `**Total Databases:** ${databases.length}\n`;
  md += `**Active Databases:** ${databases.filter(d => d.active).length}\n\n`;

  md += `| Database Name | Status | Description |\n`;
  md += `|---------------|--------|-------------|\n`;

  for (const db of databases) {
    const status = db.active ? '✅ Active' : '❌ Inactive';
    const description = db.description || '-';

    md += `| ${db.name} | ${status} | ${description} |\n`;
  }

  md += `\n\n**Next Steps:**\n`;
  md += `- Use \`sql-test-connection\` to verify connectivity to a database\n`;
  md += `- Use \`sql-list-tables\` to see tables in a database\n`;
  md += `- Use \`sql-execute-query\` to run queries against a database\n`;

  return md;
}
