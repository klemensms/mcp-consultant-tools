/**
 * Audit Logger for PowerPlatform Core
 *
 * Lightweight audit logging for customization operations.
 */

export interface AuditLogEntry {
  timestamp: Date;
  operation: string;
  operationType: 'CREATE' | 'UPDATE' | 'DELETE' | 'PUBLISH' | 'READ' | 'EXECUTE';
  componentType: string;
  componentName?: string;
  componentId?: string;
  solutionName?: string;
  parameters?: Record<string, unknown>;
  success: boolean;
  error?: string;
  executionTimeMs?: number;
  dryRun?: boolean;
}

export interface AuditLogOptions {
  maxEntries?: number;
  logToConsole?: boolean;
}

/**
 * Simple Audit Logger
 */
export class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxEntries: number;
  private logToConsole: boolean;
  private enabled: boolean = true;

  constructor(options: AuditLogOptions = {}) {
    this.maxEntries = options.maxEntries || 1000;
    this.logToConsole = options.logToConsole ?? true;
  }

  /**
   * Log an operation
   */
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    if (!this.enabled) return;

    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.logs.push(fullEntry);

    // Trim if needed
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries);
    }

    // Log to stderr (safe for MCP protocol)
    if (this.logToConsole) {
      const prefix = entry.success ? '✓' : '✗';
      const status = entry.success ? 'SUCCESS' : 'FAILED';
      const timeLabel = entry.executionTimeMs ? ` (${entry.executionTimeMs}ms)` : '';

      console.error(
        `[AUDIT] ${prefix} ${entry.operationType} ${entry.componentType} - ${status}${timeLabel}`
      );

      if (entry.componentName) {
        console.error(`  Name: ${entry.componentName}`);
      }

      if (entry.error) {
        console.error(`  Error: ${entry.error}`);
      }
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
   * Get all logs
   */
  getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 10): AuditLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get failed operations
   */
  getFailedOperations(): AuditLogEntry[] {
    return this.logs.filter((l) => !l.success);
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
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    successRate: number;
  } {
    const total = this.logs.length;
    const successful = this.logs.filter((l) => l.success).length;
    const failed = total - successful;

    return {
      totalOperations: total,
      successfulOperations: successful,
      failedOperations: failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger({
  maxEntries: 1000,
  logToConsole: true,
});
