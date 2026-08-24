/**
 * Utils module exports
 */

// Audit logging
export {
  AuditLogger,
  auditLogger,
  type AuditLogEntry,
  type AuditLogOptions,
} from './auditLogger.js';

// Best practices validation
export {
  BEST_PRACTICES,
  BestPracticesValidator,
  bestPracticesValidator,
  type RequiredColumn,
  type ValidationResult,
} from './bestPractices.js';

// Best practices formatters
export {
  formatBestPracticesReport,
  formatCompliantEntities,
  formatExecutionStats,
  formatQuickSummary,
  formatViolationsBySeverity,
  validationFanOutSuffix,
} from './best-practices-formatters.js';

// Icon management
export {
  IconManager,
  iconManager,
  type IconSuggestion,
  type IconUploadResult,
} from './iconManager.js';

// Rate limiting
export {
  batchExecute,
  RateLimiter,
  rateLimiter,
  type RateLimiterOptions,
  type RequestQueueItem,
  withRateLimit,
} from './rate-limiter.js';

// Prompt templates
export {
  ATTRIBUTE_DETAILS,
  ENTITY_OVERVIEW,
  QUERY_TEMPLATE,
  RELATIONSHIP_MAP,
} from './prompt-templates.js';

// Publisher configuration
export {
  getPublisherPrefix,
  initializePublisherPrefix,
  isPublisherPrefixConfigured,
  normalizePrefix,
  resetPublisherPrefix,
} from './publisherConfig.js';

// Flow complexity calculator
export {
  calculateFlowComplexity,
  calculateComplexityScore,
  extractComplexityFactors,
  extractComplexityFlags,
  getRiskLevel,
  type FlowComplexityBreakdown,
  type FlowComplexityFlags,
  type FlowComplexityResult,
  type RiskLevel,
} from './complexity-calculator.js';

// Flow URL extraction and secret detection
export {
  extractUrlsFromFlowDefinition,
  detectHardcodedSecrets,
  type FlowUrlReference,
  type SecretWarning,
} from './flow-url-extractor.js';

// Audit report formatter
export {
  generateAuditMarkdownReport,
  type AuditReportData,
} from './audit-report-formatter.js';

// OOTB filters for integration audit
export {
  isOotbWebhook,
  isOotbEnvVar,
  isOotbServiceEndpoint,
  filterOotb,
  type FilterOotbResult,
} from './ootb-filters.js';
