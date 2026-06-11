#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

// Load environment variables
config();

console.log("Testing workflow and flow tools...\n");

const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

async function testWorkflowsFlows() {
  try {
    // Test 1: Get all Power Automate flows
    console.log("=".repeat(80));
    console.log("TEST 1: Get all Power Automate flows");
    console.log("=".repeat(80));

    const flows = await service.getFlows(false, 10);
    console.log(`\nFound ${flows.totalCount} flows\n`);

    flows.flows.forEach((flow, idx) => {
      console.log(`${idx + 1}. ${flow.name}`);
      console.log(`   ID: ${flow.workflowid}`);
      console.log(`   State: ${flow.state}`);
      console.log(`   Primary Entity: ${flow.primaryEntity || 'None'}`);
      console.log(`   Owner: ${flow.owner}`);
      console.log(`   Modified: ${flow.modifiedOn}`);
      console.log(`   Has Definition: ${flow.hasDefinition}`);
      console.log("");
    });

    // Test 2: Get flow definition (if we have any flows)
    if (flows.flows.length > 0) {
      const firstFlowId = flows.flows[0].workflowid;
      console.log("=".repeat(80));
      console.log(`TEST 2: Get flow definition for: ${flows.flows[0].name}`);
      console.log("=".repeat(80));

      const flowDef = await service.getFlowDefinition(firstFlowId);
      console.log(`\nFlow: ${flowDef.name}`);
      console.log(`State: ${flowDef.state}`);
      console.log(`Type: ${flowDef.type}`);
      console.log(`Primary Entity: ${flowDef.primaryEntity || 'None'}`);
      console.log(`Owner: ${flowDef.owner}`);
      console.log(`Created: ${flowDef.createdOn} by ${flowDef.createdBy}`);
      console.log(`Modified: ${flowDef.modifiedOn} by ${flowDef.modifiedBy}`);

      if (flowDef.flowDefinition) {
        if (flowDef.flowDefinition.parseError) {
          console.log(`\n⚠️  Error parsing flow definition: ${flowDef.flowDefinition.parseError}`);
        } else {
          console.log(`\n✓ Flow definition parsed successfully`);
          console.log(`  Properties: ${Object.keys(flowDef.flowDefinition).join(', ')}`);
        }
      } else {
        console.log(`\n⚠️  No flow definition available`);
      }
      console.log("");
    }

    // Test 3: Get all classic Dynamics workflows
    console.log("=".repeat(80));
    console.log("TEST 3: Get all classic Dynamics workflows");
    console.log("=".repeat(80));

    const workflows = await service.getWorkflows(false, 10);
    console.log(`\nFound ${workflows.totalCount} workflows\n`);

    workflows.workflows.forEach((workflow, idx) => {
      console.log(`${idx + 1}. ${workflow.name}`);
      console.log(`   ID: ${workflow.workflowid}`);
      console.log(`   State: ${workflow.state}`);
      console.log(`   Mode: ${workflow.mode}`);
      console.log(`   Primary Entity: ${workflow.primaryEntity || 'None'}`);
      console.log(`   Triggers: Create=${workflow.triggerOnCreate}, Delete=${workflow.triggerOnDelete}, OnDemand=${workflow.isOnDemand}`);
      console.log(`   Owner: ${workflow.owner}`);
      console.log(`   Modified: ${workflow.modifiedOn}`);
      console.log("");
    });

    // Test 4: Get workflow definition (if we have any workflows)
    if (workflows.workflows.length > 0) {
      const firstWorkflowId = workflows.workflows[0].workflowid;
      console.log("=".repeat(80));
      console.log(`TEST 4: Get workflow definition for: ${workflows.workflows[0].name}`);
      console.log("=".repeat(80));

      const workflowDef = await service.getWorkflowDefinition(firstWorkflowId);
      console.log(`\nWorkflow: ${workflowDef.name}`);
      console.log(`State: ${workflowDef.state}`);
      console.log(`Mode: ${workflowDef.mode}`);
      console.log(`Type: ${workflowDef.type}`);
      console.log(`Primary Entity: ${workflowDef.primaryEntity || 'None'}`);
      console.log(`Trigger on Create: ${workflowDef.triggerOnCreate}`);
      console.log(`Trigger on Delete: ${workflowDef.triggerOnDelete}`);
      console.log(`Trigger on Update Attributes: ${workflowDef.triggerOnUpdateAttributes.join(', ') || '(none)'}`);
      console.log(`Is On Demand: ${workflowDef.isOnDemand}`);
      console.log(`Owner: ${workflowDef.owner}`);
      console.log(`Created: ${workflowDef.createdOn} by ${workflowDef.createdBy}`);
      console.log(`Modified: ${workflowDef.modifiedOn} by ${workflowDef.modifiedBy}`);

      if (workflowDef.xaml) {
        const xamlLength = workflowDef.xaml.length;
        console.log(`\n✓ XAML definition available (${xamlLength} characters)`);
        console.log(`  First 200 characters: ${workflowDef.xaml.substring(0, 200)}...`);
      } else {
        console.log(`\n⚠️  No XAML definition available`);
      }
      console.log("");
    }

    console.log("=".repeat(80));
    console.log("✓ All tests completed successfully!");
    console.log("=".repeat(80));

  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

testWorkflowsFlows();
