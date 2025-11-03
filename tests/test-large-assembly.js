#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

// Load environment variables
config();

console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║         LARGE ASSEMBLY TEST - RTPI.Plugins (Previously 25000+ tokens)    ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

// Utility function to estimate tokens (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(data) {
  const jsonString = JSON.stringify(data);
  return Math.ceil(jsonString.length / 4);
}

// Utility function to format bytes
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function testLargeAssembly() {
  const assemblyName = "RTPI.Plugins";

  console.log(`Testing assembly: ${assemblyName}`);
  console.log(`Date: ${new Date().toISOString()}\n`);
  console.log("This assembly previously returned 25,000+ tokens and caused issues.");
  console.log("Testing with optimized $select clauses...\n");
  console.log("─".repeat(79));

  try {
    const startTime = Date.now();
    const result = await service.getPluginAssemblyComplete(assemblyName, false);
    const duration = Date.now() - startTime;

    const jsonString = JSON.stringify(result);
    const bytes = jsonString.length;
    const tokens = estimateTokens(result);

    console.log("\n✓ SUCCESS!\n");
    console.log("PERFORMANCE METRICS:");
    console.log("─".repeat(79));
    console.log(`Duration:        ${duration}ms`);
    console.log(`Response Size:   ${formatBytes(bytes)}`);
    console.log(`Character Count: ${jsonString.length.toLocaleString()}`);
    console.log(`Estimated Tokens: ~${tokens.toLocaleString()}`);
    console.log("");

    // Calculate improvement
    const previousTokens = 25000;
    const reduction = ((previousTokens - tokens) / previousTokens * 100).toFixed(1);
    console.log(`Previous Token Count: ~${previousTokens.toLocaleString()}`);
    console.log(`Token Reduction:      ${reduction}% improvement! 🎉`);
    console.log("");

    console.log("ASSEMBLY DETAILS:");
    console.log("─".repeat(79));
    console.log(`Name:            ${result.assembly.name}`);
    console.log(`Version:         ${result.assembly.version}`);
    console.log(`Isolation Mode:  ${result.assembly.isolationmode === 2 ? 'Sandbox' : 'None'}`);
    console.log(`Modified:        ${result.assembly.modifiedon}`);
    console.log(`Modified By:     ${result.assembly.modifiedby?.fullname || 'Unknown'}`);
    console.log(`Plugin Types:    ${result.pluginTypes.length}`);
    console.log(`Registered Steps: ${result.steps.length}`);
    console.log("");

    console.log("PLUGIN TYPES:");
    console.log("─".repeat(79));
    result.pluginTypes.forEach((type, idx) => {
      console.log(`  ${idx + 1}. ${type.typename}`);
    });
    console.log("");

    console.log("VALIDATION RESULTS:");
    console.log("─".repeat(79));
    console.log(`Disabled Steps:             ${result.validation.hasDisabledSteps ? 'Yes' : 'No'}`);
    console.log(`Async Steps:                ${result.validation.hasAsyncSteps ? 'Yes' : 'No'}`);
    console.log(`Sync Steps:                 ${result.validation.hasSyncSteps ? 'Yes' : 'No'}`);
    console.log(`Steps Without Filtering:    ${result.validation.stepsWithoutFilteringAttributes.length}`);
    console.log(`Steps Without Images:       ${result.validation.stepsWithoutImages.length}`);
    console.log("");

    if (result.validation.potentialIssues.length > 0) {
      console.log("⚠️  POTENTIAL ISSUES:");
      result.validation.potentialIssues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
      console.log("");
    }

    // Show breakdown of steps
    const messageTypes = {};
    const stages = {};
    const modes = {};

    result.steps.forEach(step => {
      const msg = step.sdkmessageid?.name || 'Unknown';
      const stage = step.stage === 10 ? 'PreValidation' : step.stage === 20 ? 'PreOperation' : 'PostOperation';
      const mode = step.mode === 0 ? 'Sync' : 'Async';

      messageTypes[msg] = (messageTypes[msg] || 0) + 1;
      stages[stage] = (stages[stage] || 0) + 1;
      modes[mode] = (modes[mode] || 0) + 1;
    });

    console.log("STEP BREAKDOWN:");
    console.log("─".repeat(79));
    console.log("\nBy Message Type:");
    Object.entries(messageTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([msg, count]) => {
        console.log(`  ${msg.padEnd(25)} ${count}`);
      });

    console.log("\nBy Stage:");
    Object.entries(stages).forEach(([stage, count]) => {
      console.log(`  ${stage.padEnd(25)} ${count}`);
    });

    console.log("\nBy Mode:");
    Object.entries(modes).forEach(([mode, count]) => {
      console.log(`  ${mode.padEnd(25)} ${count}`);
    });

    console.log("\n" + "═".repeat(79));

    if (tokens < 10000) {
      console.log("✓ OPTIMIZATION SUCCESSFUL - Token count is excellent!");
      console.log("  The assembly can now be processed without issues.");
    } else if (tokens < 20000) {
      console.log("✓ OPTIMIZATION EFFECTIVE - Token count is acceptable.");
      console.log("  The assembly should work well in most contexts.");
    } else {
      console.log("⚠️  Token count is still high. Consider further optimization.");
    }

    console.log("═".repeat(79) + "\n");

    process.exit(0);

  } catch (error) {
    console.log(`\n✗ FAILED - ${error.message}\n`);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testLargeAssembly();
