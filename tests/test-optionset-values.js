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

    console.log('Getting si_membershipstatus attribute metadata...\n');

    // Use makeRequest directly to expand OptionSet
    const attribute = await service.makeRequest(
      `api/data/v9.2/EntityDefinitions(LogicalName='contact')/Attributes(LogicalName='si_membershipstatus')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`
    );

    console.log('=== MEMBERSHIP STATUS OPTION SET ===\n');

    if (attribute.OptionSet && attribute.OptionSet.Options) {
      console.log('All available options:');
      attribute.OptionSet.Options.forEach(option => {
        console.log(`  ${option.Value}: ${option.Label.UserLocalizedLabel.Label}`);
      });

      console.log('\n=== VALUES USED IN FLOW ===\n');
      const flowValues = [100000000, 100000003, 157420000, 100000006];
      flowValues.forEach(value => {
        const option = attribute.OptionSet.Options.find(opt => opt.Value === value);
        if (option) {
          console.log(`  ${value}: ${option.Label.UserLocalizedLabel.Label}`);
        } else {
          console.log(`  ${value}: NOT FOUND`);
        }
      });
    } else {
      console.log('Full attribute details:');
      console.log(JSON.stringify(attribute, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();
