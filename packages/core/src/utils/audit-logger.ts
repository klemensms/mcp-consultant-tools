/**
 * Audit Logger Module
 *
 * Logs all customization operations for audit trail and debugging.
 * Captures operation type, parameters, success/failure, and execution time.
 */

export interface AuditLogEntry {
  timestamp: Date;
  operation: string;
  operationType: 'CREATE' | 'UPDATE' | 'DELETE' | 'PUBLISH' | 'READ';
  componentType: string;
  componentName?: string;
  componentId?: string;
  solutionName?: string;
  parameters?: Record<string, any>;
  success: boolean;
  error?: string;
  executionTimeMs?: number;
  dryRun?: boolean;
}

export interface AuditLogOptions {
  maxEntries?: number;
  logToConsole?: boolean;
  logToFile?: boolean;
  filePath?: string;
}

/**
 * Audit Logger Class
 */
export class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private options: Required<AuditLogOptions>;
  private enabled: boolean = true;

  constructor(options: AuditLogOptions = {}) {
    this.options = {
      maxEntries: options.maxEntries || 1000,
      logToConsole: options.logToConsole !== undefined ? options.logToConsole : true,
      logToFile: options.logToFile || false,
      filePath: options.filePath || './mcp-audit.log'
    };
  }

  /**
   * Log a customization operation
   */
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    if (!this.enabled) {
      return;
    }

    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date()
    };

    // Add to in-memory log
    this.logs.push(fullEntry);

    // Trim logs if exceeding max entries
    if (this.logs.length > this.options.maxEntries) {
      this.logs = this.logs.slice(-this.options.maxEntries);
    }

    // Log to console if enabled
    if (this.options.logToConsole) {
      this.logToConsole(fullEntry);
    }

    // Log to file if enabled (async, don't wait)
    if (this.options.logToFile) {
      this.logToFile(fullEntry).catch(err => {
        console.error('Failed to write audit log to file:', err);
      });
    }
  }

  /**
   * Log to console with formatting
   */
  private logToConsole(entry: AuditLogEntry): void {
    const prefix = entry.success ? '✓' : '✗';
    const status = entry.success ? 'SUCCESS' : 'FAILED';
    const dryRunLabel = entry.dryRun ? ' [DRY-RUN]' : '';
    const timeLabel = entry.executionTimeMs ? ` (${entry.executionTimeMs}ms)` : '';

    console.error(
      `[AUDIT] ${prefix} ${entry.operationType} ${entry.componentType}${dryRunLabel} - ${status}${timeLabel}`
    );

    if (entry.componentName) {
      console.error(`  Name: ${entry.componentName}`);
    }

    if (entry.error) {
      console.error(`  Error: ${entry.error}`);
    }
  }

  /**
   * Log to file (async)
   */
  private async logToFile(entry: AuditLogEntry): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.options.filePath, logLine, 'utf-8');
    } catch (error) {
      // Silently fail - don't interrupt operations due to logging failures
    }
  }

  /**
   * Start timing an operation
   */
  startTimer(): () => number {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }

  /**
   * Get all audit logs
   */
  getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by criteria
   */
  getFilteredLogs(filter: {
    operation?: string;
    operationType?: string;
    componentType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    solutionName?: string;
  }): AuditLogEntry[] {
    return this.logs.filter(entry => {
      if (filter.operation && entry.operation !== filter.operation) return false;
      if (filter.operationType && entry.operationType !== filter.operationType) return false;
      if (filter.componentType && entry.componentType !== filter.componentType) return false;
      if (filter.success !== undefined && entry.success !== filter.success) return false;
      if (filter.solutionName && entry.solutionName !== filter.solutionName) return false;
      if (filter.startDate && entry.timestamp < filter.startDate) return false;
      if (filter.endDate && entry.timestamp > filter.endDate) return false;
      return true;
    });
  }

  /**
   * Get operation statistics
   */
  getStats(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    successRate: number;
    byOperationType: Record<string, number>;
    byComponentType: Record<string, number>;
    averageExecutionTime?: number;
  } {
    const total = this.logs.length;
    const successful = this.logs.filter(l => l.success).length;
    const failed = total - successful;

    const byOperationType: Record<string, number> = {};
    const byComponentType: Record<string, number> = {};
    let totalExecutionTime = 0;
    let executionTimeCount = 0;

    for (const log of this.logs) {
      byOperationType[log.operationType] = (byOperationType[log.operationType] || 0) + 1;
      byComponentType[log.componentType] = (byComponentType[log.componentType] || 0) + 1;

      if (log.executionTimeMs) {
        totalExecutionTime += log.executionTimeMs;
        executionTimeCount++;
      }
    }

    return {
      totalOperations: total,
      successfulOperations: successful,
      failedOperations: failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      byOperationType,
      byComponentType,
      averageExecutionTime: executionTimeCount > 0 ? totalExecutionTime / executionTimeCount : undefined
    };
  }

  /**
   * Get recent operations (last N)
   */
  getRecentLogs(count: number = 10): AuditLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get failed operations
   */
  getFailedOperations(): AuditLogEntry[] {
    return this.logs.filter(l => !l.success);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Export logs to JSON
   */
  exportToJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Export logs to CSV
   */
  exportToCsv(): string {
    const headers = [
      'Timestamp',
      'Operation',
      'Operation Type',
      'Component Type',
      'Component Name',
      'Component ID',
      'Solution Name',
      'Success',
      'Error',
      'Execution Time (ms)',
      'Dry Run'
    ];

    const rows = this.logs.map(log => [
      log.timestamp.toISOString(),
      log.operation,
      log.operationType,
      log.componentType,
      log.componentName || '',
      log.componentId || '',
      log.solutionName || '',
      log.success ? 'Yes' : 'No',
      log.error || '',
      log.executionTimeMs?.toString() || '',
      log.dryRun ? 'Yes' : 'No'
    ]);

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Generate audit report
   */
  generateReport(): string {
    const stats = this.getStats();
    const failed = this.getFailedOperations();

    let report = `# Audit Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `## Summary\n\n`;
    report += `- Total Operations: ${stats.totalOperations}\n`;
    report += `- Successful: ${stats.successfulOperations}\n`;
    report += `- Failed: ${stats.failedOperations}\n`;
    report += `- Success Rate: ${stats.successRate.toFixed(2)}%\n`;

    if (stats.averageExecutionTime) {
      report += `- Average Execution Time: ${stats.averageExecutionTime.toFixed(2)}ms\n`;
    }

    report += `\n## Operations by Type\n\n`;
    for (const [type, count] of Object.entries(stats.byOperationType)) {
      report += `- ${type}: ${count}\n`;
    }

    report += `\n## Components by Type\n\n`;
    for (const [type, count] of Object.entries(stats.byComponentType)) {
      report += `- ${type}: ${count}\n`;
    }

    if (failed.length > 0) {
      report += `\n## Failed Operations\n\n`;
      for (const log of failed) {
        report += `- ${log.timestamp.toISOString()} - ${log.operationType} ${log.componentType}`;
        if (log.componentName) {
          report += ` (${log.componentName})`;
        }
        report += `\n  Error: ${log.error}\n`;
      }
    }

    return report;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger({
  maxEntries: 1000,
  logToConsole: true,
  logToFile: false
});

/**
 * Helper function for wrapping operations with audit logging
 */
export async function auditOperation<T>(
  params: {
    operation: string;
    operationType: AuditLogEntry['operationType'];
    componentType: string;
    componentName?: string;
    componentId?: string;
    solutionName?: string;
    parameters?: Record<string, any>;
    dryRun?: boolean;
  },
  fn: () => Promise<T>
): Promise<T> {
  const timer = auditLogger.startTimer();

  try {
    const result = await fn();

    auditLogger.log({
      ...params,
      success: true,
      executionTimeMs: timer()
    });

    return result;
  } catch (error) {
    auditLogger.log({
      ...params,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs: timer()
    });

    throw error;
  }
}
