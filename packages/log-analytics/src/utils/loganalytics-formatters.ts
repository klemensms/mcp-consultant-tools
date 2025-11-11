/**
 * Utility functions for formatting Log Analytics query results
 */

/**
 * Format Log Analytics table result as markdown table
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
      // Truncate very long strings for readability
      const str = String(cell);
      if (str.length > 200) {
        return str.substring(0, 197) + '...';
      }
      return str;
    }).join(' | ') + ' |';
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Convert Log Analytics query result to CSV
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
 * Extract key insights from generic log data
 */
export function analyzeLogs(logsTable: any, tableName?: string): string {
  if (!logsTable || !logsTable.rows || logsTable.rows.length === 0) {
    return 'No logs found in the specified time range.';
  }

  const insights: string[] = [];

  // Count total entries
  insights.push(`- Total log entries: ${logsTable.rows.length}`);

  // Analyze severity level distribution if available
  const severityIndex = logsTable.columns.findIndex((c: any) =>
    c.name === 'SeverityLevel' || c.name === 'Level' || c.name === 'severity'
  );
  if (severityIndex >= 0) {
    const severityCounts: Record<string, number> = {};
    logsTable.rows.forEach((r: any) => {
      const severity = r[severityIndex];
      const key = getSeverityLabel(severity);
      severityCounts[key] = (severityCounts[key] || 0) + 1;
    });

    if (Object.keys(severityCounts).length > 0) {
      insights.push('- Severity distribution:');
      Object.entries(severityCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([severity, count]) => {
          insights.push(`  - ${severity}: ${count}`);
        });
    }
  }

  // Identify time range
  const timeIndex = logsTable.columns.findIndex((c: any) =>
    c.name === 'TimeGenerated' || c.name === 'timestamp'
  );
  if (timeIndex >= 0 && logsTable.rows.length > 0) {
    const timestamps = logsTable.rows
      .map((r: any) => new Date(r[timeIndex]))
      .filter((d: Date) => !isNaN(d.getTime()));

    if (timestamps.length > 0) {
      const earliest = new Date(Math.min(...timestamps.map((d: Date) => d.getTime())));
      const latest = new Date(Math.max(...timestamps.map((d: Date) => d.getTime())));
      insights.push(`- Time range: ${earliest.toISOString()} to ${latest.toISOString()}`);
    }
  }

  return insights.join('\n');
}

/**
 * Extract key insights from Azure Function logs
 */
export function analyzeFunctionLogs(logsTable: any): string {
  if (!logsTable || !logsTable.rows || logsTable.rows.length === 0) {
    return 'No function logs found in the specified time range.';
  }

  const insights: string[] = [];

  // Count total entries
  insights.push(`- Total function log entries: ${logsTable.rows.length}`);

  // Count unique function names
  const functionIndex = logsTable.columns.findIndex((c: any) => c.name === 'FunctionName');
  if (functionIndex >= 0) {
    const functions = new Set(logsTable.rows.map((r: any) => r[functionIndex]));
    insights.push(`- Unique functions: ${functions.size}`);
  }

  // Count errors (ExceptionDetails present)
  const exceptionIndex = logsTable.columns.findIndex((c: any) => c.name === 'ExceptionDetails');
  if (exceptionIndex >= 0) {
    const errorCount = logsTable.rows.filter((r: any) => r[exceptionIndex] && r[exceptionIndex] !== '').length;
    insights.push(`- Error count: ${errorCount}`);
    if (errorCount > 0) {
      const successCount = logsTable.rows.length - errorCount;
      const successRate = ((successCount / logsTable.rows.length) * 100).toFixed(2);
      insights.push(`- Success rate: ${successRate}%`);
    }
  }

  // Severity distribution
  const severityIndex = logsTable.columns.findIndex((c: any) => c.name === 'SeverityLevel');
  if (severityIndex >= 0) {
    const severityCounts: Record<string, number> = {};
    logsTable.rows.forEach((r: any) => {
      const severity = r[severityIndex];
      const key = getSeverityLabel(severity);
      severityCounts[key] = (severityCounts[key] || 0) + 1;
    });

    if (Object.keys(severityCounts).length > 0) {
      insights.push('- Severity distribution:');
      Object.entries(severityCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([severity, count]) => {
          insights.push(`  - ${severity}: ${count}`);
        });
    }
  }

  // Count unique hosts
  const hostIndex = logsTable.columns.findIndex((c: any) => c.name === 'HostInstanceId');
  if (hostIndex >= 0) {
    const hosts = new Set(logsTable.rows.map((r: any) => r[hostIndex]));
    insights.push(`- Unique host instances: ${hosts.size}`);
  }

  return insights.join('\n');
}

/**
 * Extract key insights from Azure Function errors
 */
export function analyzeFunctionErrors(errorsTable: any): string {
  if (!errorsTable || !errorsTable.rows || errorsTable.rows.length === 0) {
    return 'No function errors found in the specified time range.';
  }

  const insights: string[] = [];

  // Count total errors
  insights.push(`- Total errors: ${errorsTable.rows.length}`);

  // Identify most affected function
  const functionIndex = errorsTable.columns.findIndex((c: any) => c.name === 'FunctionName');
  if (functionIndex >= 0) {
    const functionCounts: Record<string, number> = {};
    errorsTable.rows.forEach((r: any) => {
      const func = r[functionIndex];
      functionCounts[func] = (functionCounts[func] || 0) + 1;
    });

    const mostAffected = Object.entries(functionCounts).sort((a, b) => b[1] - a[1])[0];
    if (mostAffected) {
      insights.push(`- Most affected function: ${mostAffected[0]} (${mostAffected[1]} errors)`);
    }

    // Show distribution
    if (Object.keys(functionCounts).length > 1) {
      insights.push('- Error distribution by function:');
      Object.entries(functionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Top 5
        .forEach(([func, count]) => {
          insights.push(`  - ${func}: ${count}`);
        });
    }
  }

  // Analyze exception patterns (if ExceptionDetails is JSON or structured)
  const exceptionIndex = errorsTable.columns.findIndex((c: any) => c.name === 'ExceptionDetails');
  if (exceptionIndex >= 0) {
    const exceptionTypes: Record<string, number> = {};
    errorsTable.rows.forEach((r: any) => {
      const details = r[exceptionIndex];
      if (details) {
        // Try to extract exception type from the details string
        const typeMatch = String(details).match(/Exception:\s*([A-Za-z.]+Exception)/);
        if (typeMatch) {
          const type = typeMatch[1];
          exceptionTypes[type] = (exceptionTypes[type] || 0) + 1;
        }
      }
    });

    if (Object.keys(exceptionTypes).length > 0) {
      insights.push('- Common exception types:');
      Object.entries(exceptionTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([type, count]) => {
          insights.push(`  - ${type}: ${count}`);
        });
    }
  }

  return insights.join('\n');
}

/**
 * Analyze function execution statistics
 */
export function analyzeFunctionStats(statsTable: any): string {
  if (!statsTable || !statsTable.rows || statsTable.rows.length === 0) {
    return 'No function statistics available.';
  }

  const insights: string[] = [];

  // Get column indices
  const functionIndex = statsTable.columns.findIndex((c: any) => c.name === 'FunctionName');
  const totalIndex = statsTable.columns.findIndex((c: any) => c.name === 'TotalExecutions');
  const errorIndex = statsTable.columns.findIndex((c: any) => c.name === 'ErrorCount');
  const successRateIndex = statsTable.columns.findIndex((c: any) => c.name === 'SuccessRate');

  if (statsTable.rows.length === 1 && functionIndex === -1) {
    // Single function stats (aggregated)
    const row = statsTable.rows[0];
    if (totalIndex >= 0) insights.push(`- Total executions: ${row[totalIndex]}`);
    if (errorIndex >= 0) insights.push(`- Error count: ${row[errorIndex]}`);
    if (successRateIndex >= 0) insights.push(`- Success rate: ${row[successRateIndex]}%`);
  } else if (functionIndex >= 0) {
    // Multiple functions
    insights.push(`- Functions analyzed: ${statsTable.rows.length}`);

    // Find function with most errors
    if (errorIndex >= 0) {
      const sorted = [...statsTable.rows].sort((a, b) => b[errorIndex] - a[errorIndex]);
      const mostErrors = sorted[0];
      if (mostErrors[errorIndex] > 0) {
        insights.push(`- Function with most errors: ${mostErrors[functionIndex]} (${mostErrors[errorIndex]} errors)`);
      }
    }

    // Find function with lowest success rate
    if (successRateIndex >= 0) {
      const sorted = [...statsTable.rows].sort((a, b) => a[successRateIndex] - b[successRateIndex]);
      const lowestSuccess = sorted[0];
      insights.push(`- Lowest success rate: ${lowestSuccess[functionIndex]} (${lowestSuccess[successRateIndex]}%)`);
    }
  }

  return insights.join('\n');
}

/**
 * Generate recommendations based on log analysis
 */
export function generateRecommendations(analysis: {
  errorCount?: number;
  successRate?: number;
  severityDistribution?: Record<string, number>;
  exceptionTypes?: Record<string, number>;
}): string[] {
  const recommendations: string[] = [];

  if (analysis.errorCount && analysis.errorCount > 0) {
    recommendations.push('🔍 Investigate error patterns to identify root causes');

    if (analysis.successRate !== undefined && analysis.successRate < 95) {
      recommendations.push('⚠️ Success rate below 95% - consider implementing retry logic and better error handling');
    }

    if (analysis.successRate !== undefined && analysis.successRate < 80) {
      recommendations.push('🚨 Critical: Success rate below 80% - immediate investigation required');
    }
  }

  if (analysis.severityDistribution) {
    const warnings = analysis.severityDistribution['Warning'] || 0;
    const errors = analysis.severityDistribution['Error'] || 0;
    const critical = analysis.severityDistribution['Critical'] || 0;

    if (critical > 0) {
      recommendations.push(`🚨 ${critical} critical-level log(s) - immediate action required`);
    }

    if (errors > warnings * 2) {
      recommendations.push('⚠️ High error-to-warning ratio - consider adding more defensive logging');
    }
  }

  if (analysis.exceptionTypes) {
    const types = Object.keys(analysis.exceptionTypes);
    if (types.length > 5) {
      recommendations.push('📊 Multiple exception types detected - consider exception handling consolidation');
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ No critical issues detected in the analyzed timeframe');
  }

  return recommendations;
}

/**
 * Convert numeric severity level to label
 */
function getSeverityLabel(severity: any): string {
  const level = typeof severity === 'number' ? severity : parseInt(severity, 10);

  if (isNaN(level)) return 'Unknown';

  switch (level) {
    case 0:
      return 'Verbose';
    case 1:
      return 'Information';
    case 2:
      return 'Warning';
    case 3:
      return 'Error';
    case 4:
      return 'Critical';
    default:
      return `Level ${level}`;
  }
}

/**
 * Sanitize error messages to remove sensitive information
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove potential connection strings
  message = message.replace(/Server=.+?;/gi, 'Server=***;');
  message = message.replace(/Password=.+?;/gi, 'Password=***;');
  message = message.replace(/ApiKey=.+?;/gi, 'ApiKey=***;');
  message = message.replace(/workspaceId=.+?;/gi, 'workspaceId=***;');

  // Remove potential API keys and tokens
  message = message.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***');
  message = message.replace(/[A-Za-z0-9]{32,}/g, '***'); // Remove long alphanumeric strings

  // Remove potential workspace IDs (GUIDs)
  message = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '***-***-***-***-***');

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

/**
 * Format a single log entry for display
 */
export function formatLogEntry(
  timestamp: string,
  severity: number | string,
  message: string,
  additionalFields?: Record<string, any>
): string {
  const severityLabel = typeof severity === 'number' ? getSeverityLabel(severity) : severity;
  const time = new Date(timestamp).toISOString();

  let formatted = `**${time}** [${severityLabel}] ${message}`;

  if (additionalFields && Object.keys(additionalFields).length > 0) {
    formatted += '\n  ' + Object.entries(additionalFields)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  return formatted;
}
