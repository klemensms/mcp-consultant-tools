# PowerPlatform Package Guide

This guide applies to all PowerPlatform packages:
- `@mcp-consultant-tools/powerplatform` (read-only, 51 tools, 12 prompts)
- `@mcp-consultant-tools/powerplatform-customization` (schema changes, 59 tools, 2 prompts)
- `@mcp-consultant-tools/powerplatform-data` (data CRUD, 8 tools, 0 prompts)

## Security-Focused Split (v16+)

The PowerPlatform integration is split into **3 security-isolated packages** following the principle of least privilege:

| Package | Purpose | Production-Safe? |
|---------|---------|------------------|
| **powerplatform** | Read-only access: entity metadata, plugin inspection, workflow analysis | YES - Install in production |
| **powerplatform-customization** | Schema changes: create entities, attributes, relationships, deploy plugins | NO - Dev/config only |
| **powerplatform-data** | Data CRUD: create, update, delete Dataverse records | NO - Operational use |

**Security Model (v21+):**
- **Package isolation**: Installing a package grants access to its operations
- **No environment flags required**: Package selection = explicit intent
- **Principle of least privilege**: Install only what you need

**Usage Patterns:**
```typescript
// Pattern 1: Production (read-only only)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
registerPowerPlatformTools(server); // 51 read-only tools

// Pattern 2: Development (read + customization)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerPowerplatformCustomizationTools } from '@mcp-consultant-tools/powerplatform-customization';
registerPowerPlatformTools(server);
registerPowerplatformCustomizationTools(server);

// Pattern 3: Operational (read + data CRUD)
import { registerPowerPlatformTools } from '@mcp-consultant-tools/powerplatform';
import { registerPowerplatformDataTools } from '@mcp-consultant-tools/powerplatform-data';
registerPowerPlatformTools(server);
registerPowerplatformDataTools(server);
```

## Environment Configuration

```bash
# Required
POWERPLATFORM_URL=https://yourorg.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-client-id
POWERPLATFORM_TENANT_ID=your-tenant-id

# Authentication (choose one):
# Option 1: Service Principal (set secret)
POWERPLATFORM_CLIENT_SECRET=your-client-secret

# Option 2: Interactive User Auth (omit secret)
# Opens browser for Microsoft Entra ID sign-in

# Customization package only:
POWERPLATFORM_DEFAULT_SOLUTION=YourSolutionName
PUBLISHER_PREFIX=sic_

# Data package only (granular flags):
POWERPLATFORM_ENABLE_CREATE=false
POWERPLATFORM_ENABLE_UPDATE=false
POWERPLATFORM_ENABLE_DELETE=false
```

## Test Environment

**Safe test env:** `https://mcptests.crm4.dynamics.com`
- Dedicated for CRM customization development
- Safe for all CRUD and schema operations
- **Never use client environments unless explicitly instructed**

## Service Architecture

**PowerPlatformService** handles:
- Azure MSAL authentication with token caching
- OData API requests to Dataverse Web API
- Entity metadata queries and relationship inspection
- Plugin registration and inspection
- Workflow and Power Automate flow analysis
- Best practices validation

**Reference:** See `docs/technical/POWERPLATFORM_TECHNICAL.md` for detailed implementation.

## Key Capabilities

### Read-Only Package (powerplatform)
- Entity metadata and attributes
- Relationship inspection
- Plugin assembly inspection and validation
- Workflow/Flow analysis
- Forms, views, and web resources
- Solution component queries
- Best practices validation
- **Integration Audit** (NEW v26, enhanced v27):
  - Service endpoint discovery (webhooks, Azure, REST)
  - Webhook registration analysis
  - Flow complexity scoring and risk assessment
  - Combined integration audit reports
  - Environment variable querying and URL validation
  - Hardcoded secret detection in flows
  - URL extraction from flow definitions
  - `outputFormat` parameter support (summary/full)

### Customization Package (powerplatform-customization)
- Create/update/delete entities
- Create/update/delete attributes
- Create relationships (1:N, N:N)
- Plugin deployment (upload DLL, register steps, images)
- Form and view management
- Web resource management
- Solution management
- Global option set management
- Workflow/Flow activation and documentation

### Data Package (powerplatform-data)
- Query records (OData filter)
- Get record by ID
- Create record
- Update record (PATCH)
- Delete record (requires confirm: true)
- Execute Custom APIs/Actions

## Common Patterns

### Data Format for CRUD
```typescript
// Field names: Use logical names
{ name: 'Acme Corp', telephone1: '555-1234' }

// Lookups: Use @odata.bind syntax
{ 'parentaccountid@odata.bind': '/accounts(guid)' }

// Option sets: Use integer values
{ statecode: 0, statuscode: 1 }

// Money: Use decimal values
{ revenue: 1000000.00 }

// Dates: Use ISO 8601 format
{ birthdate: '1990-01-15' }
```

### Plugin Deployment Workflow
1. `create-plugin-assembly` - Upload compiled .NET DLL
2. `register-plugin-step` - Register on SDK message (Create, Update, Delete)
3. `register-plugin-image` - Add pre/post images for context
4. `publish-customizations` - Make changes live

Or use `deploy-plugin-complete` for end-to-end orchestration.

### Best Practices Validation
```typescript
// Validate entire solution
validate-dataverse-best-practices({
  solutionUniqueName: 'YourSolution',
  publisherPrefix: 'sic_',
  recentDays: 30
})

// Validate specific entities
validate-dataverse-best-practices({
  entityLogicalNames: ['new_strikeaction', 'new_application'],
  publisherPrefix: 'sic_'
})
```

**Validation Rules:**
1. Publisher prefix check (MUST)
2. Schema name lowercase (MUST)
3. Lookup naming convention (MUST end with "id")
4. Option set scope (MUST be global)
5. Required column existence (MUST)
6. Entity icon (SHOULD)

### Integration Audit (NEW v26)

```typescript
// Get all service endpoints (webhooks, Azure Service Bus, REST)
get-service-endpoints({ maxRecords: 100 })

// Get service endpoints with URL validation
get-service-endpoints({ maxRecords: 100, requiredUrlStrings: ['prod.example.com'], outputFormat: 'full' })

// Get webhook registrations (SDK message processing steps with endpoints)
get-webhook-registrations({ maxRecords: 100 })

// Analyze flow complexity and risk (now includes URL extraction and secret detection)
analyze-flow-complexity({ flowId: 'optional-guid', maxFlows: 50 })

// Query environment variable definitions with URL validation
get-env-variables({ maxRecords: 200, requiredUrlStrings: ['prod.example.com'] })

// Generate comprehensive audit report
generate-integration-audit-report({ maxFlows: 50, requiredUrlStrings: ['prod.example.com'], outputFormat: 'full' })
```

**Complexity Scoring Factors:**
| Factor | Weight | Rationale |
|--------|--------|-----------|
| Action count | 1x | Base complexity |
| Unique connectors | 2x | Integration surface |
| HTTP/REST connectors | 5x | External dependency risk |
| Premium connectors | 3x | Licensing concern |
| Conditions/switches | 2x | Logic complexity |
| Loops | 3x | Iteration complexity |
| Parallel branches | 3x | Execution complexity |
| Error scopes | 1x | Sophistication indicator |

**Risk Levels:**
- Low: 0-20
- Medium: 21-50
- High: 51-100
- Critical: >100

## CLI Usage

Binary: `mcp-pp-cli`

```bash
# Get entity metadata
mcp-pp-cli metadata get account

# List flows
mcp-pp-cli flow list

# Generate integration audit
mcp-pp-cli integration audit
```

> Entity keys use the singular logical name (`contact`, `account`, `lead`).
> Plural is accepted as a synonym; see audit-logging.md "Entity key — singular vs plural".
