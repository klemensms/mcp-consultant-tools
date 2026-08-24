/**
 * Audit subsystem error classes.
 * AuditRefuseToStartError - config validation / startup failure (server exits).
 * AuditWriteError - mid-session write failure (tool call fails).
 * AuditChainError - chain integrity violation (refuse-to-start, requires quarantine).
 */

export class AuditRefuseToStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditRefuseToStartError';
  }
}

export class AuditWriteError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AuditWriteError';
  }
}

export class AuditChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditChainError';
  }
}

export class AuditEngagementUnsetError extends Error {
  constructor(toolName: string) {
    super(
      `Audit engagement not set. Call set-audit-engagement(workItemIds, reason) first ` +
        `to declare which work item this access relates to. ` +
        `Tool '${toolName}' refused.`
    );
    this.name = 'AuditEngagementUnsetError';
  }
}
