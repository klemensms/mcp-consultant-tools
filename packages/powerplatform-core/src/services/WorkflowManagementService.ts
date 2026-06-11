/**
 * WorkflowManagementService
 *
 * Service for workflow state management and documentation.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import { auditLogger } from '../utils/auditLogger.js';

export interface WorkflowStateResult {
  success: boolean;
  workflowId: string;
  workflowName: string;
  previousState: string;
  newState: string;
}

export interface DescriptionUpdateResult {
  success: boolean;
  previousDescription: string;
  newDescription: string;
}

export interface AutomationAnalysis {
  tablesModified: string[];
  trigger: string;
  triggerFields: string[];
  actions: string[];
  actionCount: number;
  customApisCalled: string[];
}

export interface DocumentWorkflowSafeResult {
  success: boolean;
  workflowId: string;
  workflowName: string;
  analysis: AutomationAnalysis;
  descriptionUpdated: boolean;
  previousDescription: string;
  newDescription: string;
  stateManagement: {
    initialState: string;
    wasDeactivated: boolean;
    wasReactivated: boolean;
    finalState: string;
  };
}

export interface CreateFlowOptions {
  description?: string;
  state?: 'draft' | 'activated';
  connectionReferenceMappings?: Record<string, string>;
}

export interface CreateFlowResult {
  success: boolean;
  flowId: string;
  flowName: string;
  state: string;
  connectionReferencesUpdated: number;
  warnings: string[];
}

export interface DeleteFlowResult {
  success: boolean;
  flowId: string;
  flowName: string;
  previousState: string;
}

export interface CloneFlowOptions {
  description?: string;
  updateConnectionReferences?: boolean;
  connectionReferenceMappings?: Record<string, string>;
}

export interface CloneFlowResult {
  success: boolean;
  sourceFlowId: string;
  sourceFlowName: string;
  newFlowId: string;
  newFlowName: string;
  state: string;
  connectionReferencesUpdated: number;
}

export interface CreateFlowFromDefinitionOptions {
  description?: string;
  primaryEntity?: string;
  state?: 'draft' | 'activated';
}

export interface CreateFlowFromDefinitionResult {
  success: boolean;
  flowId: string;
  flowName: string;
  state: string;
  warnings: string[];
}

export interface FlowClientDataValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface UpdateFlowDefinitionResult {
  success: boolean;
  flowId: string;
  flowName: string;
  previousClientData: string;
  stateManagement: {
    initialState: string;
    wasDeactivated: boolean;
    wasReactivated: boolean;
    finalState: string;
  };
  validationWarnings: string[];
}

export interface UpdateFlowDefinitionOptions {
  /** Auto-reactivate flow if it was active before update (default: true) */
  reactivate?: boolean;
  /** Validate JSON structure before update (default: true) */
  validateDefinition?: boolean;
}

export type FlowTemplateType =
  | 'dataverse-on-create'
  | 'dataverse-on-update'
  | 'dataverse-on-delete'
  | 'dataverse-on-create-with-condition-and-update'
  | 'scheduled-recurrence'
  | 'manual-trigger'
  | 'http-request';

export interface FlowDefinitionTemplate {
  templateType: FlowTemplateType;
  name: string;
  description: string;
  clientData: object;
  placeholders: Array<{
    path: string;
    placeholder: string;
    description: string;
    example: string;
  }>;
  connectionReferences: Array<{
    name: string;
    apiName: string;
    description: string;
    required: boolean;
  }>;
}

export class WorkflowManagementService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Update workflow description
   */
  async updateWorkflowDescription(
    workflowId: string,
    description: string
  ): Promise<DescriptionUpdateResult> {
    const MAX_DESCRIPTION_LENGTH = 1024;
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      const overage = description.length - MAX_DESCRIPTION_LENGTH;
      throw new Error(
        `Description too long (${description.length}/${MAX_DESCRIPTION_LENGTH} chars). ` +
          `Please shorten by ${overage} character${overage === 1 ? '' : 's'}.`
      );
    }

    // Get current description
    const currentWorkflow = await this.client.makeRequest<
      Record<string, unknown>
    >(`api/data/v9.2/workflows(${workflowId})?$select=description`);

    const previousDescription = (currentWorkflow.description as string) || '';

    // Update
    await this.client.makeRequest(
      `api/data/v9.2/workflows(${workflowId})`,
      'PATCH',
      { description }
    );

    return {
      success: true,
      previousDescription,
      newDescription: description,
    };
  }

  /**
   * Update flow description (alias for updateWorkflowDescription)
   */
  async updateFlowDescription(
    flowId: string,
    description: string
  ): Promise<DescriptionUpdateResult> {
    return this.updateWorkflowDescription(flowId, description);
  }

  /**
   * Deactivate a workflow (set to Draft state)
   * Uses direct PATCH on statecode/statuscode fields (SetState action not available via Web API)
   */
  async deactivateWorkflow(workflowId: string): Promise<WorkflowStateResult> {
    const currentWorkflow = await this.client.makeRequest<
      Record<string, unknown>
    >(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode`
    );

    const previousState =
      currentWorkflow.statecode === 0
        ? 'Draft'
        : currentWorkflow.statecode === 1
          ? 'Activated'
          : 'Suspended';

    // Already Draft
    if (currentWorkflow.statecode === 0) {
      auditLogger.log({
        operation: 'deactivate-workflow',
        operationType: 'UPDATE',
        componentType: 'workflow',
        componentName: currentWorkflow.name as string,
        componentId: workflowId,
        parameters: { previousState, result: 'already-draft' },
        success: true,
      });

      return {
        success: true,
        workflowId,
        workflowName: currentWorkflow.name as string,
        previousState,
        newState: 'Draft',
      };
    }

    try {
      // Use direct PATCH on statecode/statuscode (SetState not available via Web API)
      await this.client.makeRequest(
        `api/data/v9.2/workflows(${workflowId})`,
        'PATCH',
        { statecode: 0, statuscode: 1 }  // Draft state
      );

      auditLogger.log({
        operation: 'deactivate-workflow',
        operationType: 'UPDATE',
        componentType: 'workflow',
        componentName: currentWorkflow.name as string,
        componentId: workflowId,
        parameters: { previousState, newState: 'Draft' },
        success: true,
      });

      return {
        success: true,
        workflowId,
        workflowName: currentWorkflow.name as string,
        previousState,
        newState: 'Draft',
      };
    } catch (error: unknown) {
      // Check for "already in target state" error
      const err = error as { response?: { data?: { error?: { code?: string } } } };
      if (err.response?.data?.error?.code === '0x80045003') {
        return {
          success: true,
          workflowId,
          workflowName: currentWorkflow.name as string,
          previousState,
          newState: 'Draft',
        };
      }
      throw error;
    }
  }

  /**
   * Activate a workflow (set to Activated state)
   * Uses direct PATCH on statecode/statuscode fields (SetState action not available via Web API)
   */
  async activateWorkflow(workflowId: string): Promise<WorkflowStateResult> {
    const currentWorkflow = await this.client.makeRequest<
      Record<string, unknown>
    >(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode`
    );

    const previousState =
      currentWorkflow.statecode === 0
        ? 'Draft'
        : currentWorkflow.statecode === 1
          ? 'Activated'
          : 'Suspended';

    // Already Activated
    if (currentWorkflow.statecode === 1) {
      auditLogger.log({
        operation: 'activate-workflow',
        operationType: 'UPDATE',
        componentType: 'workflow',
        componentName: currentWorkflow.name as string,
        componentId: workflowId,
        parameters: { previousState, result: 'already-activated' },
        success: true,
      });

      return {
        success: true,
        workflowId,
        workflowName: currentWorkflow.name as string,
        previousState,
        newState: 'Activated',
      };
    }

    try {
      // Use direct PATCH on statecode/statuscode (SetState not available via Web API)
      await this.client.makeRequest(
        `api/data/v9.2/workflows(${workflowId})`,
        'PATCH',
        { statecode: 1, statuscode: 2 }  // Activated state
      );

      auditLogger.log({
        operation: 'activate-workflow',
        operationType: 'UPDATE',
        componentType: 'workflow',
        componentName: currentWorkflow.name as string,
        componentId: workflowId,
        parameters: { previousState, newState: 'Activated' },
        success: true,
      });

      return {
        success: true,
        workflowId,
        workflowName: currentWorkflow.name as string,
        previousState,
        newState: 'Activated',
      };
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { code?: string } } } };
      if (err.response?.data?.error?.code === '0x80045003') {
        return {
          success: true,
          workflowId,
          workflowName: currentWorkflow.name as string,
          previousState,
          newState: 'Activated',
        };
      }
      throw error;
    }
  }

  /**
   * Generate YAML metadata block for documentation
   */
  private generateAutomationYaml(analysis: AutomationAnalysis): string {
    const today = new Date().toISOString().split('T')[0];

    return `[AUTO-DOCS:v1]
tables_modified: ${analysis.tablesModified.join(', ') || 'none'}
trigger: ${analysis.trigger}
trigger_fields: ${analysis.triggerFields.join(', ') || 'none'}
custom_apis_called: ${analysis.customApisCalled.length > 0 ? analysis.customApisCalled.join(', ') : 'none'}
action_count: ${analysis.actionCount}
analyzed: ${today}
---`;
  }

  /**
   * Merge YAML metadata with existing description
   */
  private mergeDescriptionWithYaml(
    yamlBlock: string,
    existingDescription: string
  ): string {
    // Empty description
    if (!existingDescription || existingDescription.trim() === '') {
      return `${yamlBlock}\n[Manual notes below this line are preserved on re-analysis]`;
    }

    // Has [AUTO-DOCS: tag
    const autoDocsMatch = existingDescription.match(
      /\[AUTO-DOCS:v\d+\]([\s\S]*?)^---$/m
    );
    if (autoDocsMatch) {
      const separatorIndex = existingDescription.indexOf(
        '---',
        autoDocsMatch.index!
      );
      const manualNotes = existingDescription
        .substring(separatorIndex + 3)
        .trim();

      if (manualNotes) {
        return `${yamlBlock}\n${manualNotes}`;
      } else {
        return `${yamlBlock}\n[Manual notes below this line are preserved on re-analysis]`;
      }
    }

    // No [AUTO-DOCS: tag - preserve content as manual notes
    return `${yamlBlock}\n${existingDescription.trim()}`;
  }

  /**
   * Document automation with YAML metadata
   */
  async documentAutomation(
    automationId: string,
    type: 'flow' | 'workflow' | undefined,
    parseFlowSummary: (definition: unknown) => {
      tablesModified: string[];
      triggerInfo: string;
      triggerFields: string[];
      actions: unknown[];
      customApisCalled?: string[];
    },
    parseWorkflowXamlSummary: (xaml: string) => {
      tablesModified: string[];
      triggerInfo: string;
      triggerFields: string[];
      createEntityCount: number;
      updateEntityCount: number;
      assignEntityCount: number;
      setStateCount: number;
    }
  ): Promise<{
    analysis: AutomationAnalysis;
    descriptionUpdated: boolean;
    previousDescription: string;
    newDescription: string;
  }> {
    const accessToken = await this.client.getAccessToken();
    const config = this.client.getConfig();

    const response = await fetch(
      `${config.organizationUrl}/api/data/v9.2/workflows(${automationId})?$select=category,clientdata,description`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch automation: ${response.status} ${response.statusText}`
      );
    }

    const automation = (await response.json()) as Record<string, unknown>;
    const previousDescription = (automation.description as string) || '';

    // Detect type if not provided
    const detectedType = type || (automation.category === 5 ? 'flow' : 'workflow');

    let analysis: AutomationAnalysis;

    if (detectedType === 'flow') {
      if (!automation.clientdata) {
        throw new Error('Flow has no clientdata (definition)');
      }

      const flowDefinition = JSON.parse(automation.clientdata as string);
      const summary = parseFlowSummary(flowDefinition);

      const actionNames = Array.isArray(summary.actions)
        ? summary.actions
            .map((a: unknown) => {
              const action = a as Record<string, unknown>;
              return (action.name || action.type || 'unknown') as string;
            })
            .slice(0, 10)
        : [];

      analysis = {
        tablesModified: summary.tablesModified,
        trigger: summary.triggerInfo,
        triggerFields: summary.triggerFields,
        actions: actionNames,
        actionCount: Array.isArray(summary.actions) ? summary.actions.length : 0,
        customApisCalled: summary.customApisCalled || [],
      };
    } else {
      // Fetch XAML
      const xamlResponse = await fetch(
        `${config.organizationUrl}/api/data/v9.2/workflows(${automationId})?$select=xaml`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
          },
        }
      );

      if (!xamlResponse.ok) {
        throw new Error(`Failed to fetch workflow XAML: ${xamlResponse.status}`);
      }

      const xamlData = (await xamlResponse.json()) as Record<string, unknown>;

      if (!xamlData.xaml) {
        throw new Error('Workflow has no XAML definition');
      }

      const summary = parseWorkflowXamlSummary(xamlData.xaml as string);

      const actions: string[] = [];
      if (summary.createEntityCount > 0) actions.push('create_record');
      if (summary.updateEntityCount > 0) actions.push('update_record');
      if (summary.assignEntityCount > 0) actions.push('assign_record');
      if (summary.setStateCount > 0) actions.push('set_state');

      analysis = {
        tablesModified: summary.tablesModified,
        trigger: summary.triggerInfo,
        triggerFields: summary.triggerFields,
        actions,
        actionCount: actions.length,
        customApisCalled: [],
      };
    }

    // Generate YAML and merge
    const yamlBlock = this.generateAutomationYaml(analysis);
    const newDescription = this.mergeDescriptionWithYaml(
      yamlBlock,
      previousDescription
    );

    // Update description
    const updateResult = await this.updateWorkflowDescription(
      automationId,
      newDescription
    );

    return {
      analysis,
      descriptionUpdated: updateResult.success,
      previousDescription: updateResult.previousDescription,
      newDescription: updateResult.newDescription,
    };
  }

  /**
   * Document workflow safely with deactivate/reactivate
   */
  async documentWorkflowSafe(
    workflowId: string,
    type: 'flow' | 'workflow' | undefined,
    parseFlowSummary: (definition: unknown) => {
      tablesModified: string[];
      triggerInfo: string;
      triggerFields: string[];
      actions: unknown[];
      customApisCalled?: string[];
    },
    parseWorkflowXamlSummary: (xaml: string) => {
      tablesModified: string[];
      triggerInfo: string;
      triggerFields: string[];
      createEntityCount: number;
      updateEntityCount: number;
      assignEntityCount: number;
      setStateCount: number;
    }
  ): Promise<DocumentWorkflowSafeResult> {
    // Get initial state
    const currentWorkflow = await this.client.makeRequest<
      Record<string, unknown>
    >(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode`
    );

    const initialState =
      currentWorkflow.statecode === 0
        ? 'Draft'
        : currentWorkflow.statecode === 1
          ? 'Activated'
          : 'Suspended';
    const wasInitiallyActive = currentWorkflow.statecode === 1;

    auditLogger.log({
      operation: 'document-workflow-safe-start',
      operationType: 'UPDATE',
      componentType: 'workflow',
      componentName: currentWorkflow.name as string,
      componentId: workflowId,
      parameters: { initialState },
      success: true,
    });

    let wasDeactivated = false;
    let wasReactivated = false;

    try {
      // Deactivate if needed
      if (wasInitiallyActive) {
        const deactivateResult = await this.deactivateWorkflow(workflowId);
        wasDeactivated = deactivateResult.success;

        if (!wasDeactivated) {
          throw new Error('Failed to deactivate workflow');
        }
      }

      // Document
      let documentResult;
      try {
        documentResult = await this.documentAutomation(
          workflowId,
          type,
          parseFlowSummary,
          parseWorkflowXamlSummary
        );
      } catch (documentError: unknown) {
        // Rollback on failure
        if (wasDeactivated && wasInitiallyActive) {
          try {
            await this.activateWorkflow(workflowId);
          } catch {
            // Log but continue to throw original error
          }
        }

        const errorMsg =
          documentError instanceof Error
            ? documentError.message
            : 'Unknown error';
        throw new Error(`Documentation failed: ${errorMsg}`);
      }

      // Reactivate if was initially active
      if (wasInitiallyActive) {
        try {
          const activateResult = await this.activateWorkflow(workflowId);
          wasReactivated = activateResult.success;

          if (!wasReactivated) {
            return {
              success: true,
              workflowId,
              workflowName: currentWorkflow.name as string,
              analysis: documentResult.analysis,
              descriptionUpdated: documentResult.descriptionUpdated,
              previousDescription: documentResult.previousDescription,
              newDescription: documentResult.newDescription,
              stateManagement: {
                initialState,
                wasDeactivated,
                wasReactivated: false,
                finalState: 'Draft (⚠️ Manual reactivation required)',
              },
            };
          }
        } catch {
          return {
            success: true,
            workflowId,
            workflowName: currentWorkflow.name as string,
            analysis: documentResult.analysis,
            descriptionUpdated: documentResult.descriptionUpdated,
            previousDescription: documentResult.previousDescription,
            newDescription: documentResult.newDescription,
            stateManagement: {
              initialState,
              wasDeactivated,
              wasReactivated: false,
              finalState: 'Draft (⚠️ Manual reactivation required)',
            },
          };
        }
      }

      const finalState = wasInitiallyActive ? 'Activated' : 'Draft';

      auditLogger.log({
        operation: 'document-workflow-safe-complete',
        operationType: 'UPDATE',
        componentType: 'workflow',
        componentName: currentWorkflow.name as string,
        componentId: workflowId,
        parameters: { initialState, finalState, wasDeactivated, wasReactivated },
        success: true,
      });

      return {
        success: true,
        workflowId,
        workflowName: currentWorkflow.name as string,
        analysis: documentResult.analysis,
        descriptionUpdated: documentResult.descriptionUpdated,
        previousDescription: documentResult.previousDescription,
        newDescription: documentResult.newDescription,
        stateManagement: {
          initialState,
          wasDeactivated,
          wasReactivated,
          finalState,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'document-workflow-safe-error',
        operationType: 'UPDATE',
        componentType: 'workflow',
        componentName: currentWorkflow.name as string,
        componentId: workflowId,
        success: false,
        error: errorMessage,
      });
      throw error;
    }
  }

  // =====================================================
  // FLOW MANAGEMENT METHODS
  // =====================================================

  /**
   * Create a new Power Automate flow from an existing template flow
   */
  async createFlow(
    name: string,
    templateFlowId: string,
    options: CreateFlowOptions = {}
  ): Promise<CreateFlowResult> {
    // 1. Validate template flow exists and is accessible
    const templateFlow = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/workflows(${templateFlowId})?$select=workflowid,name,clientdata,primaryentity,category`
    );

    // Verify it's a flow (category = 5)
    if (templateFlow.category !== 5) {
      throw new Error(
        `Template '${templateFlow.name}' is not a flow (category=${templateFlow.category}). Use a Power Automate cloud flow as template.`
      );
    }

    if (!templateFlow.clientdata) {
      throw new Error(`Template flow '${templateFlow.name}' has no clientdata (definition)`);
    }

    // 2. Parse clientdata JSON
    let templateDefinition: Record<string, unknown>;
    try {
      templateDefinition = JSON.parse(templateFlow.clientdata as string) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Template flow has invalid JSON definition: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. Update connection references if mappings provided
    let updatedConnectionsCount = 0;
    if (options.connectionReferenceMappings) {
      const properties = templateDefinition.properties as Record<string, unknown>;
      const connectionReferences = (properties?.connectionReferences as Record<string, unknown>) || {};

      for (const [refName, newConnectionId] of Object.entries(options.connectionReferenceMappings)) {
        const ref = connectionReferences[refName] as Record<string, unknown> | undefined;
        if (ref?.connection) {
          const connection = ref.connection as Record<string, unknown>;
          connection.connectionReferenceLogicalName = newConnectionId;
          updatedConnectionsCount++;
        }
      }
    }

    // 4. Generate new flow ID
    const newFlowId = crypto.randomUUID();

    // 5. Create new workflow record
    const createPayload = {
      workflowid: newFlowId,
      name: name,
      category: 5,                              // Cloud Flow
      type: 1,                                  // Definition
      statecode: options.state === 'activated' ? 1 : 0,
      statuscode: options.state === 'activated' ? 2 : 1,
      primaryentity: (templateFlow.primaryentity as string) || 'none',
      clientdata: JSON.stringify(templateDefinition),
      description: options.description || ''
    };

    // 6. Execute POST request
    await this.client.makeRequest(
      'api/data/v9.2/workflows',
      'POST',
      createPayload
    );

    // 7. Audit log
    auditLogger.log({
      operation: 'create-flow',
      operationType: 'CREATE',
      componentType: 'flow',
      componentName: name,
      componentId: newFlowId,
      parameters: { templateFlowId, state: options.state || 'draft' },
      success: true,
    });

    return {
      success: true,
      flowId: newFlowId,
      flowName: name,
      state: options.state || 'draft',
      connectionReferencesUpdated: updatedConnectionsCount,
      warnings: []
    };
  }

  /**
   * Delete a Power Automate flow (permanent operation)
   */
  async deleteFlow(flowId: string): Promise<DeleteFlowResult> {
    // 1. Get current flow to validate and capture name
    const flow = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/workflows(${flowId})?$select=workflowid,name,statecode,statuscode,category`
    );

    const flowName = flow.name as string;
    const previousState = flow.statecode === 0 ? 'Draft' :
                         flow.statecode === 1 ? 'Activated' : 'Suspended';

    // Verify it's a flow (category = 5)
    if (flow.category !== 5) {
      throw new Error(
        `Cannot delete '${flowName}' - it is not a flow (category=${flow.category}). This tool is for Power Automate cloud flows only.`
      );
    }

    // 2. Check if flow is activated (must deactivate first)
    if (flow.statecode === 1) {
      throw new Error(
        `Flow '${flowName}' is currently Activated. Deactivate the flow before deletion using deactivate-flow tool.`
      );
    }

    // 3. Execute DELETE request
    await this.client.makeRequest(
      `api/data/v9.2/workflows(${flowId})`,
      'DELETE'
    );

    // 4. Audit log
    auditLogger.log({
      operation: 'delete-flow',
      operationType: 'DELETE',
      componentType: 'flow',
      componentName: flowName,
      componentId: flowId,
      parameters: { previousState },
      success: true,
    });

    return {
      success: true,
      flowId,
      flowName,
      previousState
    };
  }

  /**
   * Clone an existing flow with a new name (convenience wrapper over createFlow)
   */
  async cloneFlow(
    sourceFlowId: string,
    newName: string,
    options: CloneFlowOptions = {}
  ): Promise<CloneFlowResult> {
    // 1. Get source flow metadata
    const sourceFlow = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/workflows(${sourceFlowId})?$select=workflowid,name,description,category`
    );

    // Verify it's a flow
    if (sourceFlow.category !== 5) {
      throw new Error(
        `Cannot clone '${sourceFlow.name}' - it is not a flow (category=${sourceFlow.category}). This tool is for Power Automate cloud flows only.`
      );
    }

    // 2. Use createFlow with source as template
    const createResult = await this.createFlow(
      newName,
      sourceFlowId,
      {
        description: options.description || (sourceFlow.description as string) || '',
        state: 'draft',  // Always clone as draft
        connectionReferenceMappings: options.updateConnectionReferences ? options.connectionReferenceMappings : undefined
      }
    );

    // 3. Return clone-specific result
    return {
      success: true,
      sourceFlowId,
      sourceFlowName: sourceFlow.name as string,
      newFlowId: createResult.flowId,
      newFlowName: createResult.flowName,
      state: 'draft',
      connectionReferencesUpdated: createResult.connectionReferencesUpdated
    };
  }

  // =====================================================
  // FLOW FROM DEFINITION METHODS
  // =====================================================

  /**
   * Validate flow clientdata JSON structure
   */
  validateFlowClientData(clientData: string): FlowClientDataValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate JSON parsing
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(clientData);
    } catch (error) {
      return {
        isValid: false,
        errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }

    // 2. Check for required top-level structure
    if (!parsed.properties) {
      errors.push('Missing required "properties" object');
    } else {
      const properties = parsed.properties as Record<string, unknown>;

      // 3. Check for definition
      if (!properties.definition) {
        errors.push('Missing required "properties.definition" object');
      } else {
        const definition = properties.definition as Record<string, unknown>;

        // 4. Check for triggers
        if (!definition.triggers || Object.keys(definition.triggers as object).length === 0) {
          errors.push('Flow must have at least one trigger in "properties.definition.triggers"');
        }

        // 5. Check for $schema
        if (!definition.$schema) {
          warnings.push('Missing "$schema" in definition - recommended for compatibility');
        }
      }

      // 6. Check for connection references (optional but recommended)
      if (!properties.connectionReferences) {
        warnings.push('No connectionReferences defined - flow may not work without connections');
      }
    }

    // 7. Check for schemaVersion
    if (!parsed.schemaVersion) {
      warnings.push('Missing "schemaVersion" - will use default');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a new Power Automate flow from a clientdata definition (no template required)
   */
  async createFlowFromDefinition(
    name: string,
    clientData: string | object,
    options: CreateFlowFromDefinitionOptions = {}
  ): Promise<CreateFlowFromDefinitionResult> {
    // 1. Normalize clientData to string
    const clientDataString = typeof clientData === 'string'
      ? clientData
      : JSON.stringify(clientData);

    // 2. Validate JSON structure
    const validation = this.validateFlowClientData(clientDataString);
    if (!validation.isValid) {
      throw new Error(`Invalid flow definition: ${validation.errors.join(', ')}`);
    }

    // 3. Generate new flow ID
    const newFlowId = crypto.randomUUID();

    // 4. Create workflow record
    const createPayload = {
      workflowid: newFlowId,
      name: name,
      category: 5,                              // Cloud Flow
      type: 1,                                  // Definition
      statecode: options.state === 'activated' ? 1 : 0,
      statuscode: options.state === 'activated' ? 2 : 1,
      primaryentity: options.primaryEntity || 'none',
      clientdata: clientDataString,
      description: options.description || ''
    };

    // 5. Execute POST request
    await this.client.makeRequest(
      'api/data/v9.2/workflows',
      'POST',
      createPayload
    );

    // 6. Audit log
    auditLogger.log({
      operation: 'create-flow-from-definition',
      operationType: 'CREATE',
      componentType: 'flow',
      componentName: name,
      componentId: newFlowId,
      parameters: { state: options.state || 'draft' },
      success: true,
    });

    return {
      success: true,
      flowId: newFlowId,
      flowName: name,
      state: options.state || 'draft',
      warnings: validation.warnings
    };
  }

  /**
   * Get a pre-built flow definition template
   */
  getFlowDefinitionTemplate(templateType: FlowTemplateType): FlowDefinitionTemplate {
    const templates: Record<FlowTemplateType, FlowDefinitionTemplate> = {
      'dataverse-on-create': {
        templateType: 'dataverse-on-create',
        name: 'Dataverse On Create',
        description: 'Triggers when a new record is created in a Dataverse table',
        clientData: {
          properties: {
            connectionReferences: {
              shared_commondataserviceforapps: {
                runtimeSource: 'embedded',
                connection: {},
                api: { name: 'shared_commondataserviceforapps' }
              }
            },
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                When_a_row_is_added: {
                  type: 'OpenApiConnectionWebhook',
                  inputs: {
                    host: {
                      connectionName: 'shared_commondataserviceforapps',
                      operationId: 'SubscribeWebhookTrigger',
                      apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
                    },
                    parameters: {
                      'subscriptionRequest/message': 1,
                      'subscriptionRequest/entityname': '{{ENTITY_NAME}}',
                      'subscriptionRequest/scope': 4
                    },
                    authentication: '@parameters(\'$authentication\')'
                  }
                }
              },
              actions: {}
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [
          {
            path: 'properties.definition.triggers.When_a_row_is_added.inputs.parameters["subscriptionRequest/entityname"]',
            placeholder: '{{ENTITY_NAME}}',
            description: 'Logical name of the Dataverse table to trigger on',
            example: 'new_strikeaction'
          }
        ],
        connectionReferences: [
          {
            name: 'shared_commondataserviceforapps',
            apiName: 'shared_commondataserviceforapps',
            description: 'Microsoft Dataverse connection',
            required: true
          }
        ]
      },

      'dataverse-on-update': {
        templateType: 'dataverse-on-update',
        name: 'Dataverse On Update',
        description: 'Triggers when an existing record is updated in a Dataverse table',
        clientData: {
          properties: {
            connectionReferences: {
              shared_commondataserviceforapps: {
                runtimeSource: 'embedded',
                connection: {},
                api: { name: 'shared_commondataserviceforapps' }
              }
            },
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                When_a_row_is_modified: {
                  type: 'OpenApiConnectionWebhook',
                  inputs: {
                    host: {
                      connectionName: 'shared_commondataserviceforapps',
                      operationId: 'SubscribeWebhookTrigger',
                      apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
                    },
                    parameters: {
                      'subscriptionRequest/message': 3,
                      'subscriptionRequest/entityname': '{{ENTITY_NAME}}',
                      'subscriptionRequest/scope': 4,
                      'subscriptionRequest/filteringattributes': '{{FILTER_ATTRIBUTES}}'
                    },
                    authentication: '@parameters(\'$authentication\')'
                  }
                }
              },
              actions: {}
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [
          {
            path: 'properties.definition.triggers.When_a_row_is_modified.inputs.parameters["subscriptionRequest/entityname"]',
            placeholder: '{{ENTITY_NAME}}',
            description: 'Logical name of the Dataverse table to trigger on',
            example: 'new_strikeaction'
          },
          {
            path: 'properties.definition.triggers.When_a_row_is_modified.inputs.parameters["subscriptionRequest/filteringattributes"]',
            placeholder: '{{FILTER_ATTRIBUTES}}',
            description: 'Comma-separated list of attributes to monitor for changes (or remove parameter for all attributes)',
            example: 'new_status,new_name'
          }
        ],
        connectionReferences: [
          {
            name: 'shared_commondataserviceforapps',
            apiName: 'shared_commondataserviceforapps',
            description: 'Microsoft Dataverse connection',
            required: true
          }
        ]
      },

      'dataverse-on-delete': {
        templateType: 'dataverse-on-delete',
        name: 'Dataverse On Delete',
        description: 'Triggers when a record is deleted from a Dataverse table',
        clientData: {
          properties: {
            connectionReferences: {
              shared_commondataserviceforapps: {
                runtimeSource: 'embedded',
                connection: {},
                api: { name: 'shared_commondataserviceforapps' }
              }
            },
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                When_a_row_is_deleted: {
                  type: 'OpenApiConnectionWebhook',
                  inputs: {
                    host: {
                      connectionName: 'shared_commondataserviceforapps',
                      operationId: 'SubscribeWebhookTrigger',
                      apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
                    },
                    parameters: {
                      'subscriptionRequest/message': 2,
                      'subscriptionRequest/entityname': '{{ENTITY_NAME}}',
                      'subscriptionRequest/scope': 4
                    },
                    authentication: '@parameters(\'$authentication\')'
                  }
                }
              },
              actions: {}
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [
          {
            path: 'properties.definition.triggers.When_a_row_is_deleted.inputs.parameters["subscriptionRequest/entityname"]',
            placeholder: '{{ENTITY_NAME}}',
            description: 'Logical name of the Dataverse table to trigger on',
            example: 'new_strikeaction'
          }
        ],
        connectionReferences: [
          {
            name: 'shared_commondataserviceforapps',
            apiName: 'shared_commondataserviceforapps',
            description: 'Microsoft Dataverse connection',
            required: true
          }
        ]
      },

      'dataverse-on-create-with-condition-and-update': {
        templateType: 'dataverse-on-create-with-condition-and-update',
        name: 'Dataverse On Create with Condition and Update',
        description: 'Triggers on create, checks if a field is empty, and updates it with a default value',
        clientData: {
          properties: {
            connectionReferences: {
              shared_commondataserviceforapps: {
                runtimeSource: 'embedded',
                connection: {},
                api: { name: 'shared_commondataserviceforapps' }
              }
            },
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                When_a_row_is_added: {
                  type: 'OpenApiConnectionWebhook',
                  inputs: {
                    host: {
                      connectionName: 'shared_commondataserviceforapps',
                      operationId: 'SubscribeWebhookTrigger',
                      apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
                    },
                    parameters: {
                      'subscriptionRequest/message': 1,
                      'subscriptionRequest/entityname': '{{ENTITY_NAME}}',
                      'subscriptionRequest/scope': 4
                    },
                    authentication: '@parameters(\'$authentication\')'
                  }
                }
              },
              actions: {
                'Condition_-_Check_if_field_is_empty': {
                  type: 'If',
                  expression: {
                    equals: [
                      '@triggerOutputs()?[\'body/{{FIELD_LOGICAL_NAME}}\']',
                      '@null'
                    ]
                  },
                  actions: {
                    'Update_row_-_Set_field_value': {
                      type: 'OpenApiConnection',
                      inputs: {
                        host: {
                          connectionName: 'shared_commondataserviceforapps',
                          operationId: 'UpdateRecord',
                          apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
                        },
                        parameters: {
                          entityName: '{{ENTITY_NAME_PLURAL}}',
                          recordId: '@triggerOutputs()?[\'body/{{PRIMARY_ID_FIELD}}\']',
                          'item/{{FIELD_LOGICAL_NAME}}': '{{DEFAULT_VALUE}}'
                        },
                        authentication: '@parameters(\'$authentication\')'
                      }
                    }
                  },
                  else: {
                    actions: {}
                  },
                  runAfter: {}
                }
              }
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [
          {
            path: 'properties.definition.triggers.When_a_row_is_added.inputs.parameters["subscriptionRequest/entityname"]',
            placeholder: '{{ENTITY_NAME}}',
            description: 'Logical name of the Dataverse table (singular)',
            example: 'new_strikeaction'
          },
          {
            path: 'properties.definition.actions["Condition_-_Check_if_field_is_empty"].actions["Update_row_-_Set_field_value"].inputs.parameters.entityName',
            placeholder: '{{ENTITY_NAME_PLURAL}}',
            description: 'Plural name of the table for API calls',
            example: 'new_strikeactions'
          },
          {
            path: 'properties.definition.actions["Condition_-_Check_if_field_is_empty"].expression.equals[0]',
            placeholder: '{{FIELD_LOGICAL_NAME}}',
            description: 'Logical name of the field to check and update',
            example: 'new_teststring'
          },
          {
            path: 'properties.definition.actions["Condition_-_Check_if_field_is_empty"].actions["Update_row_-_Set_field_value"].inputs.parameters.recordId',
            placeholder: '{{PRIMARY_ID_FIELD}}',
            description: 'Primary ID field of the table',
            example: 'new_strikeactionid'
          },
          {
            path: 'properties.definition.actions["Condition_-_Check_if_field_is_empty"].actions["Update_row_-_Set_field_value"].inputs.parameters["item/{{FIELD_LOGICAL_NAME}}"]',
            placeholder: '{{DEFAULT_VALUE}}',
            description: 'Default value to set if field is empty',
            example: 'Set by automation'
          }
        ],
        connectionReferences: [
          {
            name: 'shared_commondataserviceforapps',
            apiName: 'shared_commondataserviceforapps',
            description: 'Microsoft Dataverse connection',
            required: true
          }
        ]
      },

      'scheduled-recurrence': {
        templateType: 'scheduled-recurrence',
        name: 'Scheduled Recurrence',
        description: 'Triggers on a recurring schedule (daily, weekly, hourly, etc.)',
        clientData: {
          properties: {
            connectionReferences: {},
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                Recurrence: {
                  type: 'Recurrence',
                  recurrence: {
                    frequency: '{{FREQUENCY}}',
                    interval: '{{INTERVAL}}',
                    timeZone: '{{TIMEZONE}}'
                  }
                }
              },
              actions: {}
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [
          {
            path: 'properties.definition.triggers.Recurrence.recurrence.frequency',
            placeholder: '{{FREQUENCY}}',
            description: 'Schedule frequency: Second, Minute, Hour, Day, Week, Month',
            example: 'Day'
          },
          {
            path: 'properties.definition.triggers.Recurrence.recurrence.interval',
            placeholder: '{{INTERVAL}}',
            description: 'Interval between runs (number)',
            example: '1'
          },
          {
            path: 'properties.definition.triggers.Recurrence.recurrence.timeZone',
            placeholder: '{{TIMEZONE}}',
            description: 'Time zone for schedule (Windows time zone ID)',
            example: 'W. Europe Standard Time'
          }
        ],
        connectionReferences: []
      },

      'manual-trigger': {
        templateType: 'manual-trigger',
        name: 'Manual Trigger',
        description: 'Triggers manually when run by user or called from another flow',
        clientData: {
          properties: {
            connectionReferences: {},
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                manual: {
                  type: 'Request',
                  kind: 'PowerAppV2',
                  inputs: {
                    schema: {
                      type: 'object',
                      properties: {},
                      required: []
                    }
                  }
                }
              },
              actions: {}
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [],
        connectionReferences: []
      },

      'http-request': {
        templateType: 'http-request',
        name: 'HTTP Request Trigger',
        description: 'Triggers when an HTTP request is received at the flow URL',
        clientData: {
          properties: {
            connectionReferences: {},
            definition: {
              $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                $connections: { defaultValue: {}, type: 'Object' },
                $authentication: { defaultValue: {}, type: 'SecureObject' }
              },
              triggers: {
                When_a_HTTP_request_is_received: {
                  type: 'Request',
                  kind: 'Http',
                  inputs: {
                    schema: {
                      type: 'object',
                      properties: {
                        '{{REQUEST_PROPERTY}}': {
                          type: '{{REQUEST_PROPERTY_TYPE}}'
                        }
                      }
                    },
                    method: '{{HTTP_METHOD}}'
                  }
                }
              },
              actions: {
                Response: {
                  type: 'Response',
                  inputs: {
                    statusCode: 200,
                    body: {
                      status: 'success'
                    }
                  },
                  runAfter: {}
                }
              }
            }
          },
          schemaVersion: '1.0.0.0'
        },
        placeholders: [
          {
            path: 'properties.definition.triggers.When_a_HTTP_request_is_received.inputs.method',
            placeholder: '{{HTTP_METHOD}}',
            description: 'HTTP method to accept: GET, POST, PUT, DELETE, PATCH',
            example: 'POST'
          },
          {
            path: 'properties.definition.triggers.When_a_HTTP_request_is_received.inputs.schema.properties',
            placeholder: '{{REQUEST_PROPERTY}}',
            description: 'Name of a property expected in the request body',
            example: 'message'
          },
          {
            path: 'properties.definition.triggers.When_a_HTTP_request_is_received.inputs.schema.properties.{{REQUEST_PROPERTY}}.type',
            placeholder: '{{REQUEST_PROPERTY_TYPE}}',
            description: 'Type of the request property: string, integer, boolean, object, array',
            example: 'string'
          }
        ],
        connectionReferences: []
      }
    };

    const template = templates[templateType];
    if (!template) {
      throw new Error(`Unknown template type: ${templateType}. Available: ${Object.keys(templates).join(', ')}`);
    }

    return template;
  }

  /**
   * Update an existing Power Automate flow's clientdata definition
   * Handles state management: deactivates if active, updates, then reactivates if requested
   */
  async updateFlowDefinition(
    flowId: string,
    clientData: string | object,
    options: UpdateFlowDefinitionOptions = {}
  ): Promise<UpdateFlowDefinitionResult> {
    const { reactivate = true, validateDefinition = true } = options;

    // 1. Normalize clientData to string
    const clientDataString = typeof clientData === 'string'
      ? clientData
      : JSON.stringify(clientData);

    // 2. Validate JSON structure if requested
    const validationWarnings: string[] = [];
    if (validateDefinition) {
      const validation = this.validateFlowClientData(clientDataString);
      if (!validation.isValid) {
        throw new Error(`Invalid flow definition: ${validation.errors.join(', ')}`);
      }
      validationWarnings.push(...validation.warnings);
    }

    // 3. Get current flow state and verify it's a flow (category=5)
    const currentFlow = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/workflows(${flowId})?$select=workflowid,name,statecode,statuscode,category,clientdata`
    );

    if (currentFlow.category !== 5) {
      throw new Error(
        `Cannot update '${currentFlow.name}' - it is not a flow (category=${currentFlow.category}). ` +
        'This tool is for Power Automate cloud flows only.'
      );
    }

    const flowName = currentFlow.name as string;
    const previousClientData = (currentFlow.clientdata as string) || '';
    const initialState = currentFlow.statecode === 0 ? 'Draft' :
                         currentFlow.statecode === 1 ? 'Activated' : 'Suspended';
    const wasInitiallyActive = currentFlow.statecode === 1;

    let wasDeactivated = false;
    let wasReactivated = false;

    try {
      // 4. Deactivate if active
      if (wasInitiallyActive) {
        const deactivateResult = await this.deactivateWorkflow(flowId);
        wasDeactivated = deactivateResult.success;

        if (!wasDeactivated) {
          throw new Error('Failed to deactivate flow before update');
        }
      }

      // 5. PATCH clientdata field
      try {
        await this.client.makeRequest(
          `api/data/v9.2/workflows(${flowId})`,
          'PATCH',
          { clientdata: clientDataString }
        );
      } catch (updateError: unknown) {
        // Rollback: reactivate if we deactivated
        if (wasDeactivated && wasInitiallyActive) {
          try {
            await this.activateWorkflow(flowId);
          } catch {
            // Log but continue to throw original error
          }
        }
        throw updateError;
      }

      // 6. Reactivate if was active and reactivate=true
      let finalState = 'Draft';
      if (wasInitiallyActive && reactivate) {
        try {
          const activateResult = await this.activateWorkflow(flowId);
          wasReactivated = activateResult.success;
          finalState = wasReactivated ? 'Activated' : 'Draft';

          if (!wasReactivated) {
            validationWarnings.push(
              'Flow update succeeded but reactivation failed. Manual activation required.'
            );
          }
        } catch (activateError: unknown) {
          const errorMsg = activateError instanceof Error ? activateError.message : 'Unknown error';
          validationWarnings.push(
            `Flow update succeeded but reactivation failed: ${errorMsg}. Manual activation required.`
          );
          finalState = 'Draft (reactivation failed)';
        }
      } else if (wasInitiallyActive && !reactivate) {
        finalState = 'Draft (reactivation skipped)';
      }

      // 7. Audit log
      auditLogger.log({
        operation: 'update-flow-definition',
        operationType: 'UPDATE',
        componentType: 'flow',
        componentName: flowName,
        componentId: flowId,
        parameters: { initialState, finalState, wasDeactivated, wasReactivated },
        success: true,
      });

      return {
        success: true,
        flowId,
        flowName,
        previousClientData,
        stateManagement: {
          initialState,
          wasDeactivated,
          wasReactivated,
          finalState,
        },
        validationWarnings,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'update-flow-definition-error',
        operationType: 'UPDATE',
        componentType: 'flow',
        componentName: flowName,
        componentId: flowId,
        success: false,
        error: errorMessage,
      });
      throw error;
    }
  }
}
