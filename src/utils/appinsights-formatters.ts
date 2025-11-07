/**
 * Utility functions for formatting Application Insights query results
 */

/**
 * Format Application Insights table result as markdown table
 */
export function formatTableAsMarkdown(table: {
  columns: { name: string; type: string }[];
  rows: any[][];
}): string {
  if (!table || !table.rows || table.rows.length === 0) {
    return '*No results*';
  }

  // Create header row
  const header = '| ' + table.columns.map(c => c.name).join(' | ') + ' |';
  const separator = '| ' + table.columns.map(() => '---').join(' | ') + ' |';

  // Create data rows
  const rows = table.rows.map(row => {
    return '| ' + row.map(cell => {
      if (cell === null || cell === undefined) return '';
      if (typeof cell === 'object') return JSON.stringify(cell);
      return String(cell);
    }).join(' | ') + ' |';
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Convert Application Insights query result to CSV
 */
export function formatTableAsCSV(table: {
  columns: { name: string; type: string }[];
  rows: any[][];
}): string {
  if (!table || !table.rows || table.rows.length === 0) {
    return '';
  }

  // Create header row
  const header = table.columns.map(c => c.name).join(',');

  // Create data rows
  const rows = table.rows.map(row => {
    return row.map(cell => {
      if (cell === null || cell === undefined) return '';
      if (typeof cell === 'object') return JSON.stringify(cell);
      const str = String(cell);
      // Escape CSV values
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Extract key insights from exception data
 */
export function analyzeExceptions(exceptionsTable: any): string {
  if (!exceptionsTable || !exceptionsTable.rows || exceptionsTable.rows.length === 0) {
    return 'No exceptions found in the specified time range.';
  }

  const insights: string[] = [];

  // Count unique exception types
  const typeIndex = exceptionsTable.columns.findIndex((c: any) => c.name === 'type');
  if (typeIndex >= 0) {
    const types = new Set(exceptionsTable.rows.map((r: any) => r[typeIndex]));
    insights.push(`- Found ${types.size} unique exception type(s)`);
  }

  // Count total exceptions
  insights.push(`- Total exceptions: ${exceptionsTable.rows.length}`);

  // Identify most common operation
  const operationIndex = exceptionsTable.columns.findIndex((c: any) => c.name === 'operation_Name');
  if (operationIndex >= 0) {
    const operations: Record<string, number> = {};
    exceptionsTable.rows.forEach((r: any) => {
      const op = r[operationIndex];
      operations[op] = (operations[op] || 0) + 1;
    });
    const mostCommon = Object.entries(operations).sort((a, b) => b[1] - a[1])[0];
    if (mostCommon) {
      insights.push(`- Most affected operation: ${mostCommon[0]} (${mostCommon[1]} exceptions)`);
    }
  }

  return insights.join('\n');
}

/**
 * Extract key insights from performance data
 */
export function analyzePerformance(performanceTable: any): string {
  if (!performanceTable || !performanceTable.rows || performanceTable.rows.length === 0) {
    return 'No performance data found in the specified time range.';
  }

  const insights: string[] = [];

  // Find slowest operation
  const avgDurationIndex = performanceTable.columns.findIndex((c: any) => c.name === 'AvgDuration');
  const operationIndex = performanceTable.columns.findIndex((c: any) => c.name === 'operation_Name');

  if (avgDurationIndex >= 0 && operationIndex >= 0) {
    const sorted = [...performanceTable.rows].sort((a, b) => b[avgDurationIndex] - a[avgDurationIndex]);
    const slowest = sorted[0];
    insights.push(`- Slowest operation: ${slowest[operationIndex]} (avg: ${Math.round(slowest[avgDurationIndex])}ms)`);
  }

  // Find operation with most failures
  const failureIndex = performanceTable.columns.findIndex((c: any) => c.name === 'FailureCount');
  if (failureIndex >= 0 && operationIndex >= 0) {
    const sorted = [...performanceTable.rows].sort((a, b) => b[failureIndex] - a[failureIndex]);
    const mostFailed = sorted[0];
    if (mostFailed[failureIndex] > 0) {
      insights.push(`- Operation with most failures: ${mostFailed[operationIndex]} (${mostFailed[failureIndex]} failures)`);
    }
  }

  return insights.join('\n');
}

/**
 * Extract key insights from dependency data
 */
export function analyzeDependencies(dependenciesTable: any): string {
  if (!dependenciesTable || !dependenciesTable.rows || dependenciesTable.rows.length === 0) {
    return 'No dependency failures found in the specified time range.';
  }

  const insights: string[] = [];

  // Count unique targets
  const targetIndex = dependenciesTable.columns.findIndex((c: any) => c.name === 'target');
  if (targetIndex >= 0) {
    const targets = new Set(dependenciesTable.rows.map((r: any) => r[targetIndex]));
    insights.push(`- Affected targets: ${targets.size}`);
  }

  // Count total failures
  insights.push(`- Total failed dependency calls: ${dependenciesTable.rows.length}`);

  // Identify most failing target
  if (targetIndex >= 0) {
    const targets: Record<string, number> = {};
    dependenciesTable.rows.forEach((r: any) => {
      const target = r[targetIndex];
      targets[target] = (targets[target] || 0) + 1;
    });
    const mostFailing = Object.entries(targets).sort((a, b) => b[1] - a[1])[0];
    if (mostFailing) {
      insights.push(`- Most failing target: ${mostFailing[0]} (${mostFailing[1]} failures)`);
    }
  }

  return insights.join('\n');
}

/**
 * Sanitize error messages to remove sensitive information
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove potential connection strings
  message = message.replace(/Server=.+?;/gi, 'Server=***;');
  message = message.replace(/Password=.+?;/gi, 'Password=***;');
  message = message.replace(/ApiKey=.+?;/gi, 'ApiKey=***;');

  // Remove potential API keys and tokens
  message = message.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***');
  message = message.replace(/[A-Za-z0-9]{32,}/g, '***'); // Remove long alphanumeric strings

  return message;
}

/**
 * Parse and validate ISO 8601 duration strings
 */
export function parseTimespan(timespan: string): { valid: boolean; error?: string } {
  const iso8601Pattern = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
  const match = timespan.match(iso8601Pattern);

  if (!match) {
    return {
      valid: false,
      error: 'Invalid timespan format. Use ISO 8601 duration (e.g., PT1H, P1D, PT30M)',
    };
  }

  return { valid: true };
}

/**
 * Get common timespan presets
 */
export function getTimespanPresets(): Record<string, string> {
  return {
    '15min': 'PT15M',
    '30min': 'PT30M',
    '1hour': 'PT1H',
    '6hours': 'PT6H',
    '12hours': 'PT12H',
    '1day': 'P1D',
    '7days': 'P7D',
    '30days': 'P30D',
  };
}
