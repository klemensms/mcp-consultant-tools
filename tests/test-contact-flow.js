import { PowerPlatformService } from '../build/PowerPlatformService.js';

async function main() {
  try {
    const config = {
      organizationUrl: process.env.POWERPLATFORM_URL,
      clientId: process.env.POWERPLATFORM_CLIENT_ID,
      clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
      tenantId: process.env.POWERPLATFORM_TENANT_ID,
    };

    const service = new PowerPlatformService(config);

    console.log('Getting all flows...');
    const result = await service.getFlows();
    const flows = result.flows;

    // Find flow starting with "Contact | when" (case-insensitive)
    const contactFlow = flows.find(f => f.name.toLowerCase().startsWith('contact | when'));

    if (contactFlow) {
      console.log('\nFound flow:');
      console.log(`Name: ${contactFlow.name}`);
      console.log(`ID: ${contactFlow.workflowid}`);
      console.log(`State: ${contactFlow.statecode}`);
      console.log(`Owner ID: ${contactFlow.ownerId || 'N/A'}`);
      console.log(`Primary Entity: ${contactFlow.primaryEntity || 'N/A'}`);
      console.log(`Modified: ${contactFlow.modifiedOn}`);

      console.log('\n\nGetting flow definition...');
      const definition = await service.getFlowDefinition(contactFlow.workflowid);

      console.log('\n=== FLOW DEFINITION ===');
      console.log(JSON.stringify(definition, null, 2));
    } else {
      console.log('\nNo flow found starting with "Contact | when"');
      console.log('\nAvailable flows:');
      flows.forEach(f => console.log(`  - ${f.name}`));
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

main();
