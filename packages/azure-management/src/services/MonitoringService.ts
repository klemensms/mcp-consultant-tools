import { ArmClient } from '../client/ArmClient.js';
import type { MetricAlertRule, ActionGroup, SmartDetectorAlertRule } from '../types/arm-types.js';
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
