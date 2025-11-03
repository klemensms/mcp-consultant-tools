#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

// Load environment variables
config();

console.log("Testing get-plugin-assembly-complete tool...\n");

const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

async function testPluginTool() {
  try {
    const result = await service.getPluginAssemblyComplete("RTPI.Events.Plugins", false);

    console.log("=".repeat(80));
    console.log("PLUGIN ASSEMBLY: RTPI.Events.Plugins");
    console.log("=".repeat(80));
    console.log("");

    console.log("ASSEMBLY INFO:");
    console.log(`  Name: ${result.assembly.name}`);
    console.log(`  Version: ${result.assembly.version}`);
    console.log(`  Isolation Mode: ${result.assembly.isolationmode === 2 ? 'Sandbox' : 'None'}`);
    console.log(`  Modified: ${result.assembly.modifiedon}`);
    console.log(`  Modified By: ${result.assembly.modifiedby?.fullname || 'Unknown'}`);
    console.log("");

    console.log(`PLUGIN TYPES (${result.pluginTypes.length}):`);
    result.pluginTypes.forEach((type, idx) => {
      console.log(`  ${idx + 1}. ${type.typename}`);
    });
    console.log("");

    console.log(`REGISTERED STEPS (${result.steps.length}):`);
    result.steps.forEach((step, idx) => {
      console.log(`  ${idx + 1}. ${step.name}`);
      console.log(`     Message: ${step.sdkmessageid?.name || 'Unknown'}`);
      console.log(`     Entity: ${step.sdkmessagefilterid?.primaryobjecttypecode || 'None'}`);
      console.log(`     Stage: ${step.stage === 10 ? 'PreValidation' : step.stage === 20 ? 'PreOperation' : 'PostOperation'}`);
      console.log(`     Mode: ${step.mode === 0 ? 'Synchronous' : 'Asynchronous'}`);
      console.log(`     Rank: ${step.rank}`);
      console.log(`     Status: ${step.statuscode === 1 ? 'Enabled' : 'Disabled'}`);
      console.log(`     Filtering Attributes: ${step.filteringattributes || '(none)'}`);
      console.log(`     Images: ${step.images.length}`);
      if (step.images.length > 0) {
        step.images.forEach(img => {
          console.log(`       - ${img.name} (${img.imagetype === 0 ? 'PreImage' : 'PostImage'}): ${img.attributes || '(all)'}`);
        });
      }
      console.log("");
    });

    console.log("VALIDATION RESULTS:");
    console.log(`  Has Disabled Steps: ${result.validation.hasDisabledSteps}`);
    console.log(`  Has Async Steps: ${result.validation.hasAsyncSteps}`);
    console.log(`  Has Sync Steps: ${result.validation.hasSyncSteps}`);
    console.log(`  Steps Without Filtering Attributes: ${result.validation.stepsWithoutFilteringAttributes.length}`);
    console.log(`  Steps Without Images: ${result.validation.stepsWithoutImages.length}`);
    console.log("");

    if (result.validation.potentialIssues.length > 0) {
      console.log("⚠️  POTENTIAL ISSUES:");
      result.validation.potentialIssues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    } else {
      console.log("✓ No potential issues detected");
    }
    console.log("");

    console.log("=".repeat(80));

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testPluginTool();
