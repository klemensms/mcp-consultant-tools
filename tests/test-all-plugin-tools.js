#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

// Load environment variables
config();

console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║           COMPREHENSIVE PLUGIN TOOLS TEST SUITE                           ║");
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

// Test results collector
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Test 1: get-plugin-assemblies
async function testGetPluginAssemblies() {
  console.log("\n" + "═".repeat(79));
  console.log("TEST 1: get-plugin-assemblies");
  console.log("═".repeat(79));

  try {
    const startTime = Date.now();
    const result = await service.getPluginAssemblies(false, 20);
    const duration = Date.now() - startTime;

    const tokens = estimateTokens(result);
    const bytes = JSON.stringify(result).length;

    console.log(`✓ SUCCESS - Retrieved ${result.totalCount} assemblies`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Response size: ${formatBytes(bytes)}`);
    console.log(`  Estimated tokens: ~${tokens.toLocaleString()}`);

    if (result.assemblies && result.assemblies.length > 0) {
      console.log(`\n  Sample assemblies:`);
      result.assemblies.slice(0, 3).forEach((assembly, idx) => {
        console.log(`    ${idx + 1}. ${assembly.name} (v${assembly.version})`);
      });
    }

    testResults.passed++;
    testResults.tests.push({
      name: 'get-plugin-assemblies',
      status: 'PASSED',
      duration,
      tokens,
      bytes
    });

    return result.assemblies && result.assemblies.length > 0 ? result.assemblies[0].name : null;

  } catch (error) {
    console.log(`✗ FAILED - ${error.message}`);
    testResults.failed++;
    testResults.tests.push({
      name: 'get-plugin-assemblies',
      status: 'FAILED',
      error: error.message
    });
    return null;
  }
}

// Test 2: get-plugin-assembly-complete
async function testGetPluginAssemblyComplete(assemblyName) {
  console.log("\n" + "═".repeat(79));
  console.log("TEST 2: get-plugin-assembly-complete");
  console.log("═".repeat(79));

  if (!assemblyName) {
    console.log("⊘ SKIPPED - No assembly available to test");
    return { assemblyName: null, entityName: null };
  }

  try {
    console.log(`Testing with assembly: ${assemblyName}\n`);

    const startTime = Date.now();
    const result = await service.getPluginAssemblyComplete(assemblyName, false);
    const duration = Date.now() - startTime;

    const tokens = estimateTokens(result);
    const bytes = JSON.stringify(result).length;

    console.log(`✓ SUCCESS - Assembly details retrieved`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Response size: ${formatBytes(bytes)}`);
    console.log(`  Estimated tokens: ~${tokens.toLocaleString()}`);
    console.log(`\n  Assembly Info:`);
    console.log(`    Name: ${result.assembly.name}`);
    console.log(`    Version: ${result.assembly.version}`);
    console.log(`    Plugin Types: ${result.pluginTypes.length}`);
    console.log(`    Registered Steps: ${result.steps.length}`);
    console.log(`\n  Validation:`);
    console.log(`    Disabled Steps: ${result.validation.hasDisabledSteps ? 'Yes' : 'No'}`);
    console.log(`    Async Steps: ${result.validation.hasAsyncSteps ? 'Yes' : 'No'}`);
    console.log(`    Sync Steps: ${result.validation.hasSyncSteps ? 'Yes' : 'No'}`);
    console.log(`    Steps Without Filtering: ${result.validation.stepsWithoutFilteringAttributes.length}`);
    console.log(`    Steps Without Images: ${result.validation.stepsWithoutImages.length}`);

    if (result.validation.potentialIssues.length > 0) {
      console.log(`\n  ⚠️  Potential Issues:`);
      result.validation.potentialIssues.forEach(issue => {
        console.log(`    - ${issue}`);
      });
    }

    // Check if optimization is working - token count should be reasonable
    const tokenWarning = tokens > 20000 ? '⚠️  High token count!' : '✓ Token count is good';
    console.log(`\n  ${tokenWarning}`);

    testResults.passed++;
    testResults.tests.push({
      name: 'get-plugin-assembly-complete',
      status: 'PASSED',
      duration,
      tokens,
      bytes,
      assemblyName
    });

    // Find an entity to test with from the steps
    let testEntity = null;
    if (result.steps.length > 0) {
      const stepWithEntity = result.steps.find(s => s.sdkmessagefilterid?.primaryobjecttypecode);
      if (stepWithEntity) {
        testEntity = stepWithEntity.sdkmessagefilterid.primaryobjecttypecode;
      }
    }

    return { assemblyName, entityName: testEntity };

  } catch (error) {
    console.log(`✗ FAILED - ${error.message}`);
    testResults.failed++;
    testResults.tests.push({
      name: 'get-plugin-assembly-complete',
      status: 'FAILED',
      error: error.message,
      assemblyName
    });
    return { assemblyName, entityName: null };
  }
}

// Test 3: get-entity-plugin-pipeline
async function testGetEntityPluginPipeline(entityName) {
  console.log("\n" + "═".repeat(79));
  console.log("TEST 3: get-entity-plugin-pipeline");
  console.log("═".repeat(79));

  if (!entityName) {
    console.log("⊘ SKIPPED - No entity available to test");
    // Try with a common entity
    entityName = 'account';
    console.log(`Trying with default entity: ${entityName}\n`);
  } else {
    console.log(`Testing with entity: ${entityName}\n`);
  }

  try {
    const startTime = Date.now();
    const result = await service.getEntityPluginPipeline(entityName, null, false);
    const duration = Date.now() - startTime;

    const tokens = estimateTokens(result);
    const bytes = JSON.stringify(result).length;

    console.log(`✓ SUCCESS - Plugin pipeline retrieved`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Response size: ${formatBytes(bytes)}`);
    console.log(`  Estimated tokens: ~${tokens.toLocaleString()}`);
    console.log(`\n  Pipeline Info:`);
    console.log(`    Entity: ${entityName}`);
    console.log(`    Total Steps: ${result.totalSteps}`);

    // Show breakdown by message type
    const messageTypes = {};
    result.steps.forEach(step => {
      const msg = step.message || 'Unknown';
      messageTypes[msg] = (messageTypes[msg] || 0) + 1;
    });

    console.log(`\n  Steps by Message Type:`);
    Object.entries(messageTypes).forEach(([msg, count]) => {
      console.log(`    ${msg}: ${count}`);
    });

    // Show breakdown by stage
    const stages = {};
    result.steps.forEach(step => {
      const stage = step.stageName || 'Unknown';
      stages[stage] = (stages[stage] || 0) + 1;
    });

    console.log(`\n  Steps by Stage:`);
    Object.entries(stages).forEach(([stage, count]) => {
      console.log(`    ${stage}: ${count}`);
    });

    testResults.passed++;
    testResults.tests.push({
      name: 'get-entity-plugin-pipeline',
      status: 'PASSED',
      duration,
      tokens,
      bytes,
      entityName
    });

  } catch (error) {
    console.log(`✗ FAILED - ${error.message}`);
    testResults.failed++;
    testResults.tests.push({
      name: 'get-entity-plugin-pipeline',
      status: 'FAILED',
      error: error.message,
      entityName
    });
  }
}

// Test 4: get-plugin-trace-logs
async function testGetPluginTraceLogs() {
  console.log("\n" + "═".repeat(79));
  console.log("TEST 4: get-plugin-trace-logs");
  console.log("═".repeat(79));

  try {
    const startTime = Date.now();
    // Query last 5 logs
    const result = await service.getPluginTraceLogs({
      maxRecords: 5,
      hoursBack: 24
    });
    const duration = Date.now() - startTime;

    const tokens = estimateTokens(result);
    const bytes = JSON.stringify(result).length;

    console.log(`✓ SUCCESS - Trace logs retrieved`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Response size: ${formatBytes(bytes)}`);
    console.log(`  Estimated tokens: ~${tokens.toLocaleString()}`);
    console.log(`\n  Log Info:`);
    console.log(`    Total Logs: ${result.totalCount}`);

    if (result.logs && result.logs.length > 0) {
      console.log(`\n  Recent Logs:`);
      result.logs.slice(0, 3).forEach((log, idx) => {
        console.log(`    ${idx + 1}. ${log.typename || 'Unknown Plugin'}`);
        console.log(`       Message: ${log.messagename || 'N/A'}`);
        console.log(`       Mode: ${log.mode === 0 ? 'Sync' : 'Async'}`);
        console.log(`       Depth: ${log.depth}`);
        console.log(`       Created: ${log.createdon}`);
      });
    } else {
      console.log(`\n  No trace logs found (this is normal if logging is not enabled)`);
    }

    testResults.passed++;
    testResults.tests.push({
      name: 'get-plugin-trace-logs',
      status: 'PASSED',
      duration,
      tokens,
      bytes
    });

  } catch (error) {
    console.log(`✗ FAILED - ${error.message}`);
    testResults.failed++;
    testResults.tests.push({
      name: 'get-plugin-trace-logs',
      status: 'FAILED',
      error: error.message
    });
  }
}

// Main test runner
async function runAllTests() {
  console.log("Starting test suite...\n");
  console.log(`Environment: ${process.env.POWERPLATFORM_URL || 'NOT SET'}`);
  console.log(`Test Date: ${new Date().toISOString()}\n`);

  const overallStart = Date.now();

  // Run tests in sequence
  const assemblyName = await testGetPluginAssemblies();
  const { entityName } = await testGetPluginAssemblyComplete(assemblyName);
  await testGetEntityPluginPipeline(entityName);
  await testGetPluginTraceLogs();

  const overallDuration = Date.now() - overallStart;

  // Print summary
  console.log("\n" + "╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║                            TEST SUMMARY                                   ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`Passed: ${testResults.passed} ✓`);
  console.log(`Failed: ${testResults.failed} ✗`);
  console.log(`Duration: ${overallDuration}ms\n`);

  console.log("Detailed Results:");
  console.log("─".repeat(79));
  testResults.tests.forEach(test => {
    const status = test.status === 'PASSED' ? '✓' : '✗';
    console.log(`${status} ${test.name.padEnd(40)} ${test.status}`);
    if (test.status === 'PASSED') {
      console.log(`  Duration: ${test.duration}ms | Tokens: ~${test.tokens?.toLocaleString()} | Size: ${formatBytes(test.bytes)}`);
    } else {
      console.log(`  Error: ${test.error}`);
    }
    console.log("");
  });

  // Token usage analysis
  console.log("\n" + "═".repeat(79));
  console.log("TOKEN USAGE ANALYSIS");
  console.log("═".repeat(79));

  const tokenTests = testResults.tests.filter(t => t.tokens);
  if (tokenTests.length > 0) {
    const totalTokens = tokenTests.reduce((sum, t) => sum + t.tokens, 0);
    const avgTokens = Math.round(totalTokens / tokenTests.length);
    const maxTest = tokenTests.reduce((max, t) => t.tokens > max.tokens ? t : max, tokenTests[0]);

    console.log(`Total Tokens (all tests): ~${totalTokens.toLocaleString()}`);
    console.log(`Average Tokens per test: ~${avgTokens.toLocaleString()}`);
    console.log(`Largest Response: ${maxTest.name} (~${maxTest.tokens.toLocaleString()} tokens)`);

    if (maxTest.tokens > 20000) {
      console.log(`\n⚠️  WARNING: ${maxTest.name} exceeded 20,000 tokens`);
      console.log(`   Consider implementing pagination or further optimization`);
    } else {
      console.log(`\n✓ All responses are within acceptable token limits`);
    }
  }

  console.log("\n" + "═".repeat(79));
  console.log(`All tests completed in ${overallDuration}ms`);
  console.log("═".repeat(79) + "\n");

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch(error => {
  console.error("\n✗ Fatal error running tests:", error);
  process.exit(1);
});
