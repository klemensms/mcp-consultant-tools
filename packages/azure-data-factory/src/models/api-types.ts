/**
 * Azure Data Factory MCP Server Types
 */

// ========================================
// Configuration Types
// ========================================

export interface AdfFactoryConfig {
  id: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  factoryName: string;
  active: boolean;
  description?: string;
}

export interface AdfConfig {
  factories: AdfFactoryConfig[];
  tenantId: string;
  clientId: string;
  clientSecret: string;
  enableWrite: boolean;
  enableTriggerControl: boolean;
}

// ========================================
// Pipeline Types
// ========================================

export interface Pipeline {
  id: string;
  name: string;
  type: string;
  etag: string;
  properties: {
    description?: string;
    activities?: Activity[];
    parameters?: Record<string, PipelineParameter>;
    variables?: Record<string, PipelineVariable>;
    annotations?: string[];
    folder?: { name: string };
  };
}

export interface PipelineParameter {
  type: string;
  defaultValue?: any;
}

export interface PipelineVariable {
  type: string;
  defaultValue?: any;
}

export interface Activity {
  name: string;
  type: string;
  description?: string;
  dependsOn?: { activity: string; dependencyConditions: string[] }[];
  policy?: ActivityPolicy;
  typeProperties?: Record<string, any>;
}

export interface ActivityPolicy {
  timeout?: string;
  retry?: number;
  retryIntervalInSeconds?: number;
  secureOutput?: boolean;
  secureInput?: boolean;
}

// ========================================
// Pipeline Run Types
// ========================================

export interface CreateRunResponse {
  runId: string;
}

export interface PipelineRun {
  runId: string;
  pipelineName: string;
  parameters?: Record<string, any>;
  invokedBy?: {
    name: string;
    id?: string;
    invokedByType?: string;
  };
  lastUpdated?: string;
  runStart?: string;
  runEnd?: string;
  durationInMs?: number;
  status: PipelineRunStatus;
  message?: string;
  isLatest?: boolean;
  annotations?: string[];
  runGroupId?: string;
}

export type PipelineRunStatus =
  | 'Queued'
  | 'InProgress'
  | 'Succeeded'
  | 'Failed'
  | 'Canceling'
  | 'Cancelled';

export interface QueryPipelineRunsRequest {
  lastUpdatedAfter: string;
  lastUpdatedBefore: string;
  filters?: PipelineRunFilter[];
  orderBy?: PipelineRunOrderBy[];
}

export interface PipelineRunFilter {
  operand: 'PipelineName' | 'RunStart' | 'RunEnd' | 'RunGroupId' | 'Status';
  operator: 'Equals' | 'NotEquals' | 'In' | 'NotIn';
  values: string[];
}

export interface PipelineRunOrderBy {
  orderBy: 'RunStart' | 'RunEnd';
  order: 'ASC' | 'DESC';
}

export interface QueryPipelineRunsResponse {
  value: PipelineRun[];
  continuationToken?: string;
}

// ========================================
// Activity Run Types
// ========================================

export interface ActivityRun {
  activityRunId: string;
  activityName: string;
  activityType: string;
  linkedServiceName?: string;
  status: ActivityRunStatus;
  activityRunStart?: string;
  activityRunEnd?: string;
  durationInMs?: number;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: ActivityError;
  pipelineName?: string;
  pipelineRunId?: string;
}

export type ActivityRunStatus =
  | 'Queued'
  | 'InProgress'
  | 'Succeeded'
  | 'Failed'
  | 'Cancelled';

export interface ActivityError {
  errorCode: string;
  message: string;
  failureType: 'UserError' | 'SystemError' | 'BadRequest';
  target?: string;
  details?: string;
}

export interface QueryActivityRunsRequest {
  lastUpdatedAfter: string;
  lastUpdatedBefore: string;
  filters?: ActivityRunFilter[];
  orderBy?: ActivityRunOrderBy[];
}

export interface ActivityRunFilter {
  operand: 'ActivityName' | 'Status' | 'ActivityRunStart' | 'ActivityRunEnd' | 'ActivityType';
  operator: 'Equals' | 'NotEquals' | 'In' | 'NotIn';
  values: string[];
}

export interface ActivityRunOrderBy {
  orderBy: 'ActivityRunStart' | 'ActivityRunEnd';
  order: 'ASC' | 'DESC';
}

export interface QueryActivityRunsResponse {
  value: ActivityRun[];
  continuationToken?: string;
}

// ========================================
// Dataset Types
// ========================================

export interface Dataset {
  id: string;
  name: string;
  type: string;
  etag: string;
  properties: {
    type: string;
    description?: string;
    linkedServiceName?: { referenceName: string; type: string };
    parameters?: Record<string, PipelineParameter>;
    annotations?: string[];
    folder?: { name: string };
    typeProperties?: Record<string, any>;
    schema?: DatasetSchemaColumn[];
  };
}

export interface DatasetSchemaColumn {
  name: string;
  type?: string;
  precision?: number;
  scale?: number;
}

// ========================================
// Linked Service Types
// ========================================

export interface LinkedService {
  id: string;
  name: string;
  type: string;
  etag: string;
  properties: {
    type: string;
    description?: string;
    annotations?: string[];
    typeProperties?: Record<string, any>;
    connectVia?: { referenceName: string; type: string };
    parameters?: Record<string, PipelineParameter>;
  };
}

// ========================================
// Data Flow Types
// ========================================

export interface DataFlow {
  id: string;
  name: string;
  type: string;
  etag: string;
  properties: {
    type: string;
    description?: string;
    annotations?: string[];
    folder?: { name: string };
    typeProperties?: DataFlowTypeProperties;
  };
}

export interface DataFlowTypeProperties {
  sources?: DataFlowSource[];
  sinks?: DataFlowSink[];
  transformations?: DataFlowTransformation[];
  script?: string;
  scriptLines?: string[];
}

export interface DataFlowSource {
  name: string;
  description?: string;
  dataset?: { referenceName: string; type: string };
  linkedService?: { referenceName: string; type: string };
  schemaLinkedService?: { referenceName: string; type: string };
}

export interface DataFlowSink {
  name: string;
  description?: string;
  dataset?: { referenceName: string; type: string };
  linkedService?: { referenceName: string; type: string };
  schemaLinkedService?: { referenceName: string; type: string };
}

export interface DataFlowTransformation {
  name: string;
  description?: string;
}

// ========================================
// Trigger Types
// ========================================

export interface Trigger {
  id: string;
  name: string;
  type: string;
  etag: string;
  properties: {
    type: string;
    description?: string;
    runtimeState?: TriggerRuntimeState;
    annotations?: string[];
    pipelines?: TriggerPipelineReference[];
    typeProperties?: Record<string, any>;
  };
}

export type TriggerRuntimeState =
  | 'Started'
  | 'Stopped'
  | 'Disabled';

export interface TriggerPipelineReference {
  pipelineReference: {
    referenceName: string;
    type: string;
  };
  parameters?: Record<string, any>;
}

export interface TriggerRun {
  triggerRunId: string;
  triggerName: string;
  triggerType: string;
  triggerRunTimestamp: string;
  status: TriggerRunStatus;
  message?: string;
  properties?: Record<string, any>;
  triggeredPipelines?: Record<string, string>;
}

export type TriggerRunStatus =
  | 'Succeeded'
  | 'Failed'
  | 'Inprogress';

export interface QueryTriggerRunsRequest {
  lastUpdatedAfter: string;
  lastUpdatedBefore: string;
  filters?: TriggerRunFilter[];
  orderBy?: TriggerRunOrderBy[];
}

export interface TriggerRunFilter {
  operand: 'TriggerName' | 'TriggerRunTimestamp' | 'Status' | 'TriggerType';
  operator: 'Equals' | 'NotEquals' | 'In' | 'NotIn';
  values: string[];
}

export interface TriggerRunOrderBy {
  orderBy: 'TriggerRunTimestamp';
  order: 'ASC' | 'DESC';
}

export interface QueryTriggerRunsResponse {
  value: TriggerRun[];
  continuationToken?: string;
}

// ========================================
// Integration Runtime Types
// ========================================

export interface IntegrationRuntime {
  id: string;
  name: string;
  type: string;
  etag: string;
  properties: {
    type: IntegrationRuntimeType;
    description?: string;
    state?: IntegrationRuntimeState;
    typeProperties?: Record<string, any>;
  };
}

export type IntegrationRuntimeType =
  | 'Managed'
  | 'SelfHosted';

export type IntegrationRuntimeState =
  | 'Initial'
  | 'Stopped'
  | 'Started'
  | 'Starting'
  | 'Stopping'
  | 'NeedRegistration'
  | 'Online'
  | 'Limited'
  | 'Offline'
  | 'AccessDenied';

export interface IntegrationRuntimeStatus {
  name: string;
  type: IntegrationRuntimeType;
  state?: IntegrationRuntimeState;
  properties: Record<string, any>;
}

// ========================================
// API Response Types
// ========================================

export interface AdfListResponse<T> {
  value: T[];
  nextLink?: string;
}

export interface AdfErrorResponse {
  error: {
    code: string;
    message: string;
    details?: { code: string; message: string }[];
  };
}
