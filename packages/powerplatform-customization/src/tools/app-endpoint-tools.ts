/**
 * App & Endpoint Tools - 7 tools for app management and service endpoints
 *
 * Tools: add-entities-to-app, validate-app, publish-app,
 *        create-service-endpoint, update-service-endpoint, delete-service-endpoint,
 *        register-webhook
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, SDK_MESSAGE_EXAMPLES } from '../tool-examples.js';

export function registerAppEndpointTools(server: any, ctx: ServiceContext): void {

const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

server.tool(
  "add-entities-to-app",
  "Add entities to a model-driven app (automatically adds them to navigation). Use get-apps and get-app-components (read-only package) to find app IDs.",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid). Get from get-apps in the read-only package."),
    entityNames: z.array(z.string()).describe(
      descWithExamples("Array of entity logical names to add", ENTITY_NAME_EXAMPLES)
    ),
  },
  async ({ appId, entityNames }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.addEntitiesToApp(appId, entityNames);
      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: `Entities added successfully:\n\n${resultStr}` }],
      };
    } catch (error: any) {
      console.error("Error adding entities to app:", error);
      return { content: [{ type: "text", text: `Failed to add entities to app: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "validate-app",
  "Validate a model-driven app before publishing (checks for missing components and configuration issues)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.validateApp(appId);
      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: `App validation result:\n\n${resultStr}` }],
      };
    } catch (error: any) {
      console.error("Error validating app:", error);
      return { content: [{ type: "text", text: `Failed to validate app: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "publish-app",
  "Publish a model-driven app to make it available to users (automatically validates first)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.publishApp(appId);
      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: `App published successfully:\n\n${resultStr}` }],
      };
    } catch (error: any) {
      console.error("Error publishing app:", error);
      return { content: [{ type: "text", text: `Failed to publish app: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-service-endpoint",
  "Create a new service endpoint (webhook, Service Bus queue/topic, Event Hub, Event Grid, REST). " +
  "Required before registering SDK message processing steps for external integrations.",
  {
    name: z.string().describe("Friendly name for the service endpoint"),
    url: z.string().describe("Endpoint URL (must be HTTPS for webhooks)"),
    contract: z.enum(['Webhook', 'Queue', 'Topic', 'EventHub', 'EventGrid', 'REST', 'OneWay', 'TwoWay'])
      .describe("Contract type determining the integration pattern"),
    authType: z.enum(['Anonymous', 'HttpHeader', 'HttpQueryString', 'WebKey', 'SASKey', 'AzureKey', 'Certificate'])
      .describe("Authentication type for the endpoint"),
    authValue: z.string().optional()
      .describe("Authentication value (API key, token, header value). Required when authType is not Anonymous"),
    description: z.string().optional().describe("Description of the endpoint"),
    messageFormat: z.enum(['Json', 'BinaryXML', 'TextXML']).optional()
      .describe("Message serialization format (default: Json for webhooks)"),
    path: z.string().optional()
      .describe("Service Bus queue/topic path (required for Queue and Topic contracts)"),
    saskeyname: z.string().optional().describe("Service Bus SAS key name"),
    saskey: z.string().optional().describe("Service Bus SAS key value"),
    solutionUniqueName: z.string().optional(),
  },
  async (params: any) => {
    try {
      const service = ctx.pp;
      const result = await service.createServiceEndpoint({
        name: params.name,
        url: params.url,
        contract: params.contract,
        authType: params.authType,
        authValue: params.authValue,
        description: params.description,
        messageFormat: params.messageFormat,
        path: params.path,
        saskeyname: params.saskeyname,
        saskey: params.saskey,
        solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
      });

      return {
        content: [{
          type: "text",
          text: `Service endpoint created successfully.\n\n` +
                `**ID:** ${result.serviceEndpointId}\n` +
                `**Name:** ${result.name}\n` +
                `**URL:** ${result.url}\n` +
                `**Contract:** ${result.contractType}\n` +
                `**Auth Type:** ${result.authType}`
        }]
      };
    } catch (error: any) {
      console.error("Error creating service endpoint:", error);
      return { content: [{ type: "text", text: `Failed to create service endpoint: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-service-endpoint",
  "Update an existing service endpoint. Only specified fields are changed.",
  {
    serviceEndpointId: z.string().describe("GUID of the service endpoint to update"),
    name: z.string().optional().describe("New friendly name"),
    url: z.string().optional().describe("New endpoint URL"),
    authType: z.enum(['Anonymous', 'HttpHeader', 'HttpQueryString', 'WebKey', 'SASKey', 'AzureKey', 'Certificate']).optional()
      .describe("New authentication type"),
    authValue: z.string().optional().describe("New authentication value"),
    description: z.string().optional().describe("New description"),
    messageFormat: z.enum(['Json', 'BinaryXML', 'TextXML']).optional()
      .describe("New message format"),
    path: z.string().optional().describe("New Service Bus queue/topic path"),
    namespaceAddress: z.string().optional()
      .describe("Service Bus namespace URI (sb://). The runtime-authoritative address for Queue/Topic/EventHub contracts. Use this instead of url for Service Bus endpoints."),
    sasKey: z.string().optional()
      .describe("Service Bus SAS key value. Maps to the dedicated saskey field (not authValue). Required for SASKey authentication on Service Bus endpoints."),
    saskeyname: z.string().optional()
      .describe("Service Bus SAS key name / policy name (e.g., 'DataverseAccess'). Maps to the dedicated saskeyname field."),
    solutionUniqueName: z.string().optional(),
  },
  async (params: any) => {
    try {
      const service = ctx.pp;
      await service.updateServiceEndpoint({
        serviceEndpointId: params.serviceEndpointId,
        name: params.name,
        url: params.url,
        authType: params.authType,
        authValue: params.authValue,
        description: params.description,
        messageFormat: params.messageFormat,
        path: params.path,
        namespaceAddress: params.namespaceAddress,
        sasKey: params.sasKey,
        saskeyname: params.saskeyname,
        solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined,
      });

      return {
        content: [{
          type: "text",
          text: `Service endpoint ${params.serviceEndpointId} updated successfully.`
        }]
      };
    } catch (error: any) {
      console.error("Error updating service endpoint:", error);
      return { content: [{ type: "text", text: `Failed to update service endpoint: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-service-endpoint",
  "Delete a service endpoint. WARNING: This also removes any associated SDK message processing steps. " +
  "Use check-dependencies (read-only package) first. Use get-service-endpoints to find endpoint IDs.",
  {
    serviceEndpointId: z.string().describe("GUID of the service endpoint to delete. Get from get-service-endpoints in the read-only package."),
    confirm: z.boolean().describe("Must be true to proceed (safety check). Set to true only after confirming with user."),
  },
  async ({ serviceEndpointId, confirm }: any) => {
    try {
      if (!confirm) {
        return {
          content: [{ type: "text", text: "Deletion not confirmed. Set confirm=true to proceed." }],
          isError: true
        };
      }

      const service = ctx.pp;
      await service.deleteServiceEndpoint(serviceEndpointId);

      return {
        content: [{ type: "text", text: `Service endpoint ${serviceEndpointId} deleted successfully.` }]
      };
    } catch (error: any) {
      console.error("Error deleting service endpoint:", error);
      return { content: [{ type: "text", text: `Failed to delete service endpoint: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "register-webhook",
  "Register a webhook endpoint with an SDK message processing step in one operation. " +
  "Creates the service endpoint AND registers the step atomically (rolls back on failure). " +
  "Use this instead of create-service-endpoint + register-plugin-step for webhook integrations.",
  {
    name: z.string().describe("Friendly name for the webhook (used for both endpoint and step)"),
    url: z.string().describe("Webhook URL (must be HTTPS)"),
    authType: z.enum(['Anonymous', 'HttpHeader', 'HttpQueryString', 'WebKey'])
      .describe("Authentication type for the webhook"),
    authValue: z.string().optional()
      .describe("Authentication value (API key, token). Required when authType is not Anonymous"),
    entityName: z.string().describe(
      descWithExamples("Entity logical name to trigger on", ENTITY_NAME_EXAMPLES)
    ),
    messageName: z.string().describe(
      descWithExamples("SDK message to trigger on", SDK_MESSAGE_EXAMPLES)
    ),
    stage: z.enum(['PreValidation', 'PreOperation', 'PostOperation']).optional()
      .describe("Execution stage (default: PostOperation)"),
    executionMode: z.enum(['Sync', 'Async']).optional()
      .describe("Execution mode (default: Async)"),
    filteringAttributes: z.array(z.string()).optional()
      .describe("Fields to monitor for Update message (e.g., ['statuscode', 'emailaddress1'])"),
    description: z.string().optional().describe("Description of the webhook"),
    solutionUniqueName: z.string().optional(),
  },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const stageMap: Record<string, number> = {
        PreValidation: 10, PreOperation: 20, PostOperation: 40
      };
      const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

      const result = await service.registerWebhook({
        name: params.name,
        url: params.url,
        authType: params.authType,
        authValue: params.authValue,
        entityName: params.entityName,
        messageName: params.messageName,
        stage: params.stage ? stageMap[params.stage] : undefined,
        executionMode: params.executionMode ? modeMap[params.executionMode] : undefined,
        filteringAttributes: params.filteringAttributes?.join(','),
        description: params.description,
        solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
      }) as any;

      const stageLabel = params.stage || 'PostOperation';
      const modeLabel = params.executionMode || 'Async';

      return {
        content: [{
          type: "text",
          text: `Webhook registered successfully.\n\n` +
                `**Endpoint ID:** ${result.serviceEndpointId}\n` +
                `**Step ID:** ${result.stepId}\n` +
                `**Name:** ${result.endpointName}\n` +
                `**URL:** ${result.endpointUrl}\n` +
                `**Message:** ${result.messageName}\n` +
                `**Entity:** ${result.entityName}\n` +
                `**Stage:** ${stageLabel}\n` +
                `**Mode:** ${modeLabel}`
        }]
      };
    } catch (error: any) {
      console.error("Error registering webhook:", error);
      return { content: [{ type: "text", text: `Failed to register webhook: ${error.message}` }], isError: true };
    }
  }
);

}
