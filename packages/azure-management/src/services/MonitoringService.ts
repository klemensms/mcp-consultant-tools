import { ArmClient } from '../client/ArmClient.js';
import type {
  MetricAlertRule,
  ActionGroup,
  SmartDetectorAlertRule,
  ScheduledQueryRule,
} from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * Processed Alert Rule summary.
 */
export interface AlertRuleSummary {
  id: string;
  name: string;
  resourceGroup: string;
  description?: string;
  severity?: number;
  enabled?: boolean;
  scopes?: string[];
  criteria?: {
    allOf?: Array<{
      metricName: string;
      metricNamespace?: string;
      operator: string;
      threshold?: number;
      timeAggregation: string;
    }>;
  };
  actions?: Array<{
    actionGroupId: string;
  }>;
  windowSize?: string;
  evaluationFrequency?: string;
}

/**
 * Processed Action Group summary.
 */
export interface ActionGroupSummary {
  id: string;
  name: string;
  resourceGroup: string;
  enabled?: boolean;
  shortName?: string;
  emailReceivers?: Array<{
    name: string;
    emailAddress: string;
    useCommonAlertSchema?: boolean;
  }>;
  smsReceivers?: Array<{
    name: string;
    countryCode: string;
    phoneNumber: string;
  }>;
  webhookReceivers?: Array<{
    name: string;
    serviceUri: string;
    useCommonAlertSchema?: boolean;
  }>;
  azureFunctionReceivers?: Array<{
    name: string;
    functionAppResourceId: string;
    functionName: string;
  }>;
  logicAppReceivers?: Array<{
    name: string;
    resourceId: string;
  }>;
  armRoleReceivers?: Array<{
    name: string;
    roleId: string;
  }>;
}

/**
 * Processed Smart Detector Alert summary.
 */
export interface SmartDetectorAlertSummary {
  id: string;
  name: string;
  resourceGroup: string;
  description?: string;
  state?: string;
  severity?: string;
  frequency?: string;
  detectorId?: string;
  scope?: string[];
  actionGroupIds?: string[];
}

/**
 * Processed scheduled query (log-search) alert rule summary.
 */
export interface ScheduledQueryRuleSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  /** `LogAlert` or `LogToMetric`. A `LogToMetric` rule emits a metric; it never alerts. */
  kind?: string;
  displayName?: string;
  description?: string;
  severity?: number;
  enabled?: boolean;
  scopes?: string[];
  targetResourceTypes?: string[];
  evaluationFrequency?: string;
  windowSize?: string;
  /** The KQL each condition runs. The query is what makes a rule reviewable. */
  queries?: string[];
  /** Empty array when the rule has no action group, which means it alerts nowhere. */
  actionGroupIds?: string[];
  autoMitigate?: boolean;
  muteActionsDuration?: string;
  /** True for a rule created through the legacy `2018-04-16` Log Search Alert v1 API. */
  isLegacyLogAnalyticsRule?: boolean;
  createdWithApiVersion?: string;
  /**
   * The `properties` block as ARM returned it, unfiltered. Passed through whole
   * rather than mapped field by field: a documentation-derived allowlist has
   * discarded live payload three times in this repo.
   */
  properties?: Record<string, unknown>;
}

export interface ListScheduledQueryRulesResult {
  rules: ScheduledQueryRuleSummary[];
  summary: {
    total: number;
    /**
     * Rules that can actually raise an alert: `kind: LogAlert` and enabled.
     * This is the number a coverage claim should quote, never `total`.
     */
    alerting: number;
    byEnabled: { enabled: number; disabled: number };
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
    /** Rules with no action group. They evaluate, then have nowhere to send the result. */
    withoutActionGroup: number;
    /** Rules created through the legacy Log Search Alert v1 API. */
    legacyRules: number;
    /** What the counts do and do not cover, in words. */
    note?: string;
  };
}

/**
 * Service for Azure Monitoring operations.
 */
export class MonitoringService {
  constructor(private client: ArmClient) {}

  /**
   * List all metric alert rules.
   */
  async listAlertRules(options: {
    resourceGroup?: string;
    targetResourceId?: string;
  } = {}): Promise<{
    alerts: AlertRuleSummary[];
    summary: {
      total: number;
      bySeverity: Record<string, number>;
      byEnabled: { enabled: number; disabled: number };
    };
  }> {
    const { resourceGroup, targetResourceId } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Insights/metricAlerts')
      : this.client.subscriptionPath('/providers/Microsoft.Insights/metricAlerts');

    let alerts = await this.client.paginate<MetricAlertRule>(
      path,
      getApiVersion('Microsoft.Insights/metricAlerts')
    );

    // Filter by target resource if specified
    if (targetResourceId) {
      alerts = alerts.filter((alert) =>
        alert.properties?.scopes?.some((scope) =>
          scope.toLowerCase() === targetResourceId.toLowerCase()
        )
      );
    }

    const results: AlertRuleSummary[] = [];
    const summary = {
      total: alerts.length,
      bySeverity: {} as Record<string, number>,
      byEnabled: { enabled: 0, disabled: 0 },
    };

    for (const alert of alerts) {
      const processed = this.processAlertRule(alert);
      results.push(processed);

      const severity = `Sev${processed.severity ?? 'Unknown'}`;
      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;

      if (processed.enabled) {
        summary.byEnabled.enabled++;
      } else {
        summary.byEnabled.disabled++;
      }
    }

    return { alerts: results, summary };
  }

  /**
   * List all action groups.
   */
  async listActionGroups(options: { resourceGroup?: string } = {}): Promise<{
    actionGroups: ActionGroupSummary[];
    summary: {
      total: number;
      byReceiverType: Record<string, number>;
      byEnabled: { enabled: number; disabled: number };
    };
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Insights/actionGroups')
      : this.client.subscriptionPath('/providers/Microsoft.Insights/actionGroups');

    const groups = await this.client.paginate<ActionGroup>(
      path,
      getApiVersion('Microsoft.Insights/actionGroups')
    );

    const results: ActionGroupSummary[] = [];
    const summary = {
      total: groups.length,
      byReceiverType: {} as Record<string, number>,
      byEnabled: { enabled: 0, disabled: 0 },
    };

    for (const group of groups) {
      const processed = this.processActionGroup(group);
      results.push(processed);

      // Count receiver types
      if (processed.emailReceivers?.length) {
        summary.byReceiverType['email'] =
          (summary.byReceiverType['email'] || 0) + processed.emailReceivers.length;
      }
      if (processed.smsReceivers?.length) {
        summary.byReceiverType['sms'] =
          (summary.byReceiverType['sms'] || 0) + processed.smsReceivers.length;
      }
      if (processed.webhookReceivers?.length) {
        summary.byReceiverType['webhook'] =
          (summary.byReceiverType['webhook'] || 0) + processed.webhookReceivers.length;
      }
      if (processed.azureFunctionReceivers?.length) {
        summary.byReceiverType['azureFunction'] =
          (summary.byReceiverType['azureFunction'] || 0) + processed.azureFunctionReceivers.length;
      }
      if (processed.logicAppReceivers?.length) {
        summary.byReceiverType['logicApp'] =
          (summary.byReceiverType['logicApp'] || 0) + processed.logicAppReceivers.length;
      }

      if (processed.enabled) {
        summary.byEnabled.enabled++;
      } else {
        summary.byEnabled.disabled++;
      }
    }

    return { actionGroups: results, summary };
  }

  /**
   * List smart detector alert rules.
   */
  async listSmartDetectorAlerts(options: { resourceGroup?: string } = {}): Promise<{
    alerts: SmartDetectorAlertSummary[];
    summary: {
      total: number;
      byState: Record<string, number>;
      bySeverity: Record<string, number>;
    };
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(
          resourceGroup,
          '/providers/Microsoft.AlertsManagement/smartDetectorAlertRules'
        )
      : this.client.subscriptionPath(
          '/providers/Microsoft.AlertsManagement/smartDetectorAlertRules'
        );

    const alerts = await this.client.paginate<SmartDetectorAlertRule>(
      path,
      getApiVersion('Microsoft.AlertsManagement/smartDetectorAlertRules')
    );

    const results: SmartDetectorAlertSummary[] = [];
    const summary = {
      total: alerts.length,
      byState: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
    };

    for (const alert of alerts) {
      const processed = this.processSmartDetectorAlert(alert);
      results.push(processed);

      const state = processed.state || 'Unknown';
      summary.byState[state] = (summary.byState[state] || 0) + 1;

      const severity = processed.severity || 'Unknown';
      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;
    }

    return { alerts: results, summary };
  }

  /**
   * List log-search alert rules (`Microsoft.Insights/scheduledQueryRules`).
   *
   * A different provider surface from {@link listAlertRules}, which reads
   * `Microsoft.Insights/metricAlerts`. Neither is a superset of the other, so
   * neither count on its own is "the alerting configuration" - which is what made
   * this surface's absence overstate an alerting gap rather than merely omit rules.
   *
   * `summary.alerting` exists because `total` is the wrong number to quote as
   * coverage: a disabled rule fires nothing, and a `LogToMetric` rule emits a metric
   * instead of alerting.
   */
  async listScheduledQueryRules(
    options: { resourceGroup?: string } = {}
  ): Promise<ListScheduledQueryRulesResult> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(
          resourceGroup,
          '/providers/Microsoft.Insights/scheduledQueryRules'
        )
      : this.client.subscriptionPath('/providers/Microsoft.Insights/scheduledQueryRules');

    const rules = await this.client.paginate<ScheduledQueryRule>(
      path,
      getApiVersion('Microsoft.Insights/scheduledQueryRules')
    );

    const results: ScheduledQueryRuleSummary[] = [];
    const summary = {
      total: rules.length,
      alerting: 0,
      byEnabled: { enabled: 0, disabled: 0 },
      byKind: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      withoutActionGroup: 0,
      legacyRules: 0,
      note: undefined as string | undefined,
    };

    for (const raw of rules) {
      const processed = this.processScheduledQueryRule(raw);
      results.push(processed);

      const kind = processed.kind || 'LogAlert';
      summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;

      if (processed.enabled) {
        summary.byEnabled.enabled++;
      } else {
        summary.byEnabled.disabled++;
      }

      // Only a rule that is both enabled and of the alerting kind can raise one.
      if (processed.enabled && kind === 'LogAlert') {
        summary.alerting++;
      }

      const severity = `Sev${processed.severity ?? 'Unknown'}`;
      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;

      if (!processed.actionGroupIds || processed.actionGroupIds.length === 0) {
        summary.withoutActionGroup++;
      }

      if (processed.isLegacyLogAnalyticsRule) {
        summary.legacyRules++;
      }
    }

    summary.note = buildScheduledQueryRuleNote(summary, Boolean(resourceGroup));

    return { rules: results, summary };
  }

  /**
   * Process a ScheduledQueryRule into a summary, reading the fields a triage needs
   * off the raw `properties` block and passing that block through alongside them.
   */
  private processScheduledQueryRule(raw: ScheduledQueryRule): ScheduledQueryRuleSummary {
    const props = raw.properties || {};

    const rgMatch = raw.id.match(/\/resourceGroups\/([^/]+)/i);

    return {
      id: raw.id,
      name: raw.name,
      resourceGroup: rgMatch ? rgMatch[1] : '',
      location: raw.location,
      kind: raw.kind,
      displayName: props.displayName,
      description: props.description,
      severity: props.severity,
      enabled: props.enabled,
      scopes: props.scopes,
      targetResourceTypes: props.targetResourceTypes,
      evaluationFrequency: props.evaluationFrequency,
      windowSize: props.windowSize,
      queries: props.criteria?.allOf
        ?.map((c) => c.query)
        .filter((q): q is string => typeof q === 'string'),
      actionGroupIds: props.actions?.actionGroups ?? [],
      autoMitigate: props.autoMitigate,
      muteActionsDuration: props.muteActionsDuration,
      isLegacyLogAnalyticsRule: props.isLegacyLogAnalyticsRule,
      createdWithApiVersion: props.createdWithApiVersion,
      properties: raw.properties as Record<string, unknown> | undefined,
    };
  }

  /**
   * Process a MetricAlertRule into an AlertRuleSummary.
   */
  private processAlertRule(alert: MetricAlertRule): AlertRuleSummary {
    const props = alert.properties || {};

    const rgMatch = alert.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    return {
      id: alert.id,
      name: alert.name,
      resourceGroup,
      description: props.description,
      severity: props.severity,
      enabled: props.enabled,
      scopes: props.scopes,
      criteria: props.criteria
        ? {
            allOf: props.criteria.allOf?.map((c) => ({
              metricName: c.metricName,
              metricNamespace: c.metricNamespace,
              operator: c.operator,
              threshold: c.threshold,
              timeAggregation: c.timeAggregation,
            })),
          }
        : undefined,
      actions: props.actions?.map((a) => ({
        actionGroupId: a.actionGroupId,
      })),
      windowSize: props.windowSize,
      evaluationFrequency: props.evaluationFrequency,
    };
  }

  /**
   * Process an ActionGroup into an ActionGroupSummary.
   */
  private processActionGroup(group: ActionGroup): ActionGroupSummary {
    const props = group.properties || {};

    const rgMatch = group.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    return {
      id: group.id,
      name: group.name,
      resourceGroup,
      enabled: props.enabled,
      shortName: props.groupShortName,
      emailReceivers: props.emailReceivers?.map((r) => ({
        name: r.name,
        emailAddress: r.emailAddress,
        useCommonAlertSchema: r.useCommonAlertSchema,
      })),
      smsReceivers: props.smsReceivers?.map((r) => ({
        name: r.name,
        countryCode: r.countryCode,
        phoneNumber: r.phoneNumber,
      })),
      webhookReceivers: props.webhookReceivers?.map((r) => ({
        name: r.name,
        serviceUri: r.serviceUri,
        useCommonAlertSchema: r.useCommonAlertSchema,
      })),
      azureFunctionReceivers: props.azureFunctionReceivers?.map((r) => ({
        name: r.name,
        functionAppResourceId: r.functionAppResourceId,
        functionName: r.functionName,
      })),
      logicAppReceivers: props.logicAppReceivers?.map((r) => ({
        name: r.name,
        resourceId: r.resourceId,
      })),
      armRoleReceivers: props.armRoleReceivers?.map((r) => ({
        name: r.name,
        roleId: r.roleId,
      })),
    };
  }

  /**
   * Process a SmartDetectorAlertRule into a SmartDetectorAlertSummary.
   */
  private processSmartDetectorAlert(alert: SmartDetectorAlertRule): SmartDetectorAlertSummary {
    const props = alert.properties || {};

    const rgMatch = alert.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    return {
      id: alert.id,
      name: alert.name,
      resourceGroup,
      description: props.description,
      state: props.state,
      severity: props.severity,
      frequency: props.frequency,
      detectorId: props.detector?.id,
      scope: props.scope,
      actionGroupIds: props.actionGroups?.groupIds,
    };
  }
}

/**
 * The note that stops the counts being misread.
 *
 * The measured failure this guards against is not a wrong row, it is a right count
 * read as the wrong thing: "19 log alert rules" quoted as 19 alerts that will fire,
 * and "0 log alert rules" quoted as an estate with no alerting. Both need a sentence
 * that a reader who only skims the summary will still see.
 */
function buildScheduledQueryRuleNote(
  summary: {
    total: number;
    alerting: number;
    byEnabled: { enabled: number; disabled: number };
    byKind: Record<string, number>;
    withoutActionGroup: number;
    legacyRules: number;
  },
  scopedToResourceGroup: boolean
): string {
  const parts: string[] = [];

  if (summary.total === 0) {
    parts.push(
      scopedToResourceGroup
        ? 'No log-search alert rules in this resource group.'
        : 'No log-search alert rules in this subscription.'
    );
  }

  // Always said, on an empty result and a full one alike. This surface and
  // metricAlerts are disjoint, so neither count is the alerting configuration.
  parts.push(
    'This command reads Microsoft.Insights/scheduledQueryRules only. Metric alerts live on Microsoft.Insights/metricAlerts (list-alert-rules) and smart detectors on Microsoft.AlertsManagement/smartDetectorAlertRules (list-smart-detector-alerts). No one of the three is the whole alerting configuration.'
  );

  if (summary.total > 0) {
    parts.push(
      `${summary.alerting} of ${summary.total} rule(s) can actually raise an alert; quote that number as coverage rather than the total.`
    );
  }

  if (summary.byEnabled.disabled > 0) {
    parts.push(`${summary.byEnabled.disabled} rule(s) are disabled and fire nothing.`);
  }

  const logToMetric = summary.byKind['LogToMetric'] ?? 0;
  if (logToMetric > 0) {
    parts.push(
      `${logToMetric} rule(s) are kind LogToMetric: they emit a metric from a log query and never raise an alert.`
    );
  }

  if (summary.withoutActionGroup > 0) {
    parts.push(
      `${summary.withoutActionGroup} rule(s) have no action group, so an alert they raise notifies nobody.`
    );
  }

  if (summary.legacyRules > 0) {
    parts.push(
      `${summary.legacyRules} rule(s) are legacy Log Search Alert v1 rules, created through the 2018-04-16 API. They appear here but are managed on that older surface.`
    );
  }

  return parts.join(' ');
}
