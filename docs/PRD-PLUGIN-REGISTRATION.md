# PRD: Plugin Registration & Deployment Validation

## Overview

Extend the PowerPlatform MCP server to provide comprehensive plugin registration, deployment validation, and trace log analysis capabilities. This enables AI agents and human reviewers to validate that plugin code submitted in PRs is correctly deployed and configured in Dataverse.

## Goals

1. **Enable comprehensive plugin discovery** - Find plugins by assembly, entity, message, or get complete pipeline view
2. **Validate deployment configuration** - Verify steps, images, filtering attributes, execution order, and all registration details
3. **Support PR review workflow** - AI agents can compare code against actual Dataverse configuration to validate implementation
4. **Detect misconfigurations** - Identify common issues like missing images, incorrect filtering attributes, wrong execution stages
5. **Provide trace log analysis** - Query and analyze plugin execution logs for troubleshooting
6. **Cover all plugin-related components** - Include Custom APIs, Service Endpoints, and Workflow Activities

## User Stories

### Primary Use Case: PR Review Validation
```
As a technical reviewer, when I receive a PR with plugin code changes,
I want an AI agent to automatically verify the deployment configuration in Dataverse,
So that I can confirm the plugin is registered correctly before approving the PR.
```

### Secondary Use Cases
- As a developer, I want to see all plugins registered on an entity in execution order
- As a functional consultant, I want to verify business logic is implemented as specified
- As a troubleshooter, I want to quickly access trace logs for failed plugin executions
- As a deployment manager, I want to verify plugin assembly versions match expected versions

## New MCP Tools

### 1. `get-plugin-assembly-complete`
**Description**: Get comprehensive information about a plugin assembly including all types, steps, and images.

**Parameters**:
- `assemblyName` (string, required): Name of the plugin assembly
- `includeDisabled` (boolean, optional, default: false): Include disabled steps

**Returns**: Structured JSON containing:
```typescript
{
  assembly: {
    pluginassemblyid: string,
    name: string,
    version: string,
    culture: string,
    publickeytoken: string,
    isolationmode: number, // 1=None, 2=Sandbox
    sourcetype: number, // 0=Database, 1=Disk, 2=GAC
    major: number,
    minor: number,
    createdon: datetime,
    modifiedon: datetime,
    modifiedby: { name: string },
    ismanaged: boolean,
    ishidden: boolean
  },
  pluginTypes: [
    {
      plugintypeid: string,
      typename: string,
      friendlyname: string,
      name: string,
      assemblyname: string,
      description: string,
      workflowactivitygroupname: string
    }
  ],
  steps: [
    {
      sdkmessageprocessingstepid: string,
      name: string,
      description: string,
      stage: number, // 10=PreValidation, 20=PreOperation, 40=PostOperation
      mode: number, // 0=Synchronous, 1=Asynchronous
      rank: number,
      statuscode: number, // 1=Enabled, 2=Disabled
      sdkmessageid: { name: string }, // e.g., "Create", "Update", "Delete"
      primaryentity: string,
      filteringattributes: string, // Comma-separated column names
      impersonatinguserid: { fullname: string },
      deployment: number, // 0=ServerOnly, 1=OfflineOnly, 2=Both
      plugintypeid: { typename: string },
      createdon: datetime,
      modifiedon: datetime,
      modifiedby: { name: string },
      images: [
        {
          sdkmessageprocessingstepimageid: string,
          name: string, // Image alias used in code
          imagetype: number, // 0=PreImage, 1=PostImage, 2=Both
          entityalias: string,
          attributes: string, // Comma-separated column names
          messagepropertyname: string // Usually "Target" or "Id"
        }
      ]
    }
  ],
  validation: {
    hasDisabledSteps: boolean,
    hasAsyncSteps: boolean,
    hasSyncSteps: boolean,
    stepsWithoutFilteringAttributes: string[], // Array of step names
    stepsWithoutImages: string[], // Array of step names where images might be expected
    potentialIssues: string[] // Array of detected issues
  }
}
```

**Dataverse API Endpoints**:
- Assembly: `/api/data/v9.2/pluginassemblies?$filter=name eq '{assemblyName}'&$expand=modifiedby($select=fullname)`
- Plugin Types: `/api/data/v9.2/plugintypes?$filter=pluginassemblyid/pluginassemblyid eq {assemblyId}&$select=plugintypeid,typename,friendlyname,name,assemblyname,description,workflowactivitygroupname`
- Steps: `/api/data/v9.2/sdkmessageprocessingsteps?$filter=plugintypeid/pluginassemblyid/pluginassemblyid eq {assemblyId}&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),modifiedby($select=fullname)`
- Images: `/api/data/v9.2/sdkmessageprocessingstepimages?$filter=sdkmessageprocessingstepid/plugintypeid/pluginassemblyid/pluginassemblyid eq {assemblyId}`

---

### 2. `get-entity-plugin-pipeline`
**Description**: Get all plugins that execute on a specific entity, organized by message and execution order.

**Parameters**:
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by message name (e.g., "Create", "Update", "Delete")
- `includeDisabled` (boolean, optional, default: false): Include disabled steps

**Returns**: Structured JSON containing:
```typescript
{
  entity: string,
  messages: [
    {
      messageName: string, // "Create", "Update", "Delete", etc.
      stages: {
        preValidation: [ /* array of steps */ ],
        preOperation: [ /* array of steps */ ],
        postOperation: [ /* array of steps */ ]
      }
    }
  ],
  steps: [
    {
      sdkmessageprocessingstepid: string,
      name: string,
      stage: number,
      stageName: string, // "PreValidation", "PreOperation", "PostOperation"
      mode: number,
      modeName: string, // "Synchronous", "Asynchronous"
      rank: number, // Execution order
      message: string,
      pluginType: string,
      assemblyName: string,
      assemblyVersion: string,
      filteringAttributes: string[],
      statuscode: number,
      enabled: boolean,
      deployment: string, // "Server", "Offline", "Both"
      impersonatingUser: string,
      hasPreImage: boolean,
      hasPostImage: boolean,
      images: [ /* same as above */ ]
    }
  ],
  executionOrder: string[] // Array of step names in actual execution order
}
```

**Dataverse API Endpoints**:
- Steps: `/api/data/v9.2/sdkmessageprocessingsteps?$filter=primaryentity eq '{entityName}' and statuscode eq 1&$expand=sdkmessageid($select=name),plugintypeid($select=typename,pluginassemblyid),impersonatinguserid($select=fullname)&$orderby=stage,rank`
- Images: `/api/data/v9.2/sdkmessageprocessingstepimages?$filter=sdkmessageprocessingstepid/primaryentity eq '{entityName}'`

---

### 3. `get-plugin-trace-logs`
**Description**: Query plugin trace logs with filtering and parsing.

**Parameters**:
- `entityName` (string, optional): Filter by entity logical name
- `messageName` (string, optional): Filter by message name (e.g., "Update")
- `correlationId` (string, optional): Filter by correlation ID
- `pluginStepId` (string, optional): Filter by specific step ID
- `exceptionOnly` (boolean, optional, default: false): Only return logs with exceptions
- `hoursBack` (number, optional, default: 24): How many hours back to search
- `maxRecords` (number, optional, default: 50): Maximum number of logs to return

**Returns**: Structured JSON containing:
```typescript
{
  totalCount: number,
  logs: [
    {
      plugintracelogid: string,
      typename: string, // Plugin class name
      messagename: string,
      primaryentity: string,
      createdon: datetime,
      depth: number,
      correlationid: string,
      performanceconstructorduration: number,
      performanceexecutionduration: number,
      exceptiondetails: string,
      messageblock: string, // Full trace log content
      mode: number,
      modeName: string,
      operationtype: number,
      operationTypeName: string,
      profile: string,
      parsed: {
        hasException: boolean,
        exceptionType: string,
        exceptionMessage: string,
        stackTrace: string,
        inputParameters: object,
        outputParameters: object
      }
    }
  ]
}
```

**Dataverse API Endpoints**:
- Logs: `/api/data/v9.2/plugintracelogs?$filter=createdon gt {date} and primaryentity eq '{entityName}'&$orderby=createdon desc&$top={maxRecords}`

---

### 4. `get-custom-api-complete`
**Description**: Get custom API definition with all request/response parameters.

**Parameters**:
- `uniqueName` (string, required): Unique name of the custom API
- `includeDisabled` (boolean, optional, default: false): Include disabled APIs

**Returns**: Structured JSON containing:
```typescript
{
  customapi: {
    customapiid: string,
    uniquename: string,
    name: string,
    displayname: string,
    bindingtype: number, // 0=Global, 1=Entity, 2=EntityCollection
    boundentitylogicalname: string,
    isfunction: boolean,
    isprivate: boolean,
    workflowsdkstepenabled: boolean,
    iscustomizable: boolean,
    plugintypeid: { typename: string, pluginassemblyid: { name: string, version: string } },
    executeprivilegename: string,
    description: string,
    allowedcustomprocessingsteptype: number,
    createdon: datetime,
    modifiedon: datetime,
    modifiedby: { fullname: string },
    enabled: boolean
  },
  requestParameters: [
    {
      customapirequestparameterid: string,
      uniquename: string,
      name: string,
      displayname: string,
      type: number, // Data type
      typeName: string,
      isoptional: boolean,
      logicalentityname: string,
      description: string
    }
  ],
  responseProperties: [
    {
      customapiresponsepropertyid: string,
      uniquename: string,
      name: string,
      displayname: string,
      type: number,
      typeName: string,
      logicalentityname: string,
      description: string
    }
  ]
}
```

**Dataverse API Endpoints**:
- Custom API: `/api/data/v9.2/customapis?$filter=uniquename eq '{uniqueName}'&$expand=plugintypeid($select=typename;$expand=pluginassemblyid($select=name,version)),modifiedby($select=fullname)`
- Request Parameters: `/api/data/v9.2/customapirequestparameters?$filter=customapiid/uniquename eq '{uniqueName}'`
- Response Properties: `/api/data/v9.2/customapiresponseproperties?$filter=customapiid/uniquename eq '{uniqueName}'`

---

### 5. `get-service-endpoints`
**Description**: Get service endpoint registrations (for Azure Service Bus, Event Hub, Webhook integrations).

**Parameters**:
- `name` (string, optional): Filter by service endpoint name
- `contract` (number, optional): Filter by contract type (1=OneWay, 2=Queue, 3=Rest, 4=TwoWay, 5=Topic, 6=Webhook, 7=EventHub, 8=EventGrid)

**Returns**: Structured JSON containing:
```typescript
{
  serviceEndpoints: [
    {
      serviceendpointid: string,
      name: string,
      description: string,
      contract: number,
      contractName: string,
      path: string, // URL or connection string
      solutionnamespace: string,
      userclaim: number,
      authtype: number,
      authvalue: string,
      connectionmode: number, // 0=Normal, 1=Federated
      createdon: datetime,
      modifiedon: datetime,
      modifiedby: { fullname: string },
      steps: [
        {
          sdkmessageprocessingstepid: string,
          name: string,
          stage: number,
          mode: number,
          rank: number,
          message: string,
          primaryentity: string,
          filteringattributes: string[],
          enabled: boolean
        }
      ]
    }
  ]
}
```

**Dataverse API Endpoints**:
- Service Endpoints: `/api/data/v9.2/serviceendpoints?$expand=modifiedby($select=fullname)`
- Steps: `/api/data/v9.2/sdkmessageprocessingsteps?$filter=eventhandler_serviceendpoint/serviceendpointid eq {serviceEndpointId}&$expand=sdkmessageid($select=name)`

---

### 6. `get-workflow-activities`
**Description**: Get custom workflow activity assemblies and their usage.

**Parameters**:
- `assemblyName` (string, optional): Filter by assembly name

**Returns**: Structured JSON containing:
```typescript
{
  workflowActivities: [
    {
      plugintypeid: string,
      typename: string,
      friendlyname: string,
      workflowactivitygroupname: string,
      assemblyname: string,
      assemblyversion: string,
      description: string,
      isworkflowactivity: boolean,
      createdon: datetime,
      modifiedon: datetime
    }
  ]
}
```

**Dataverse API Endpoints**:
- Workflow Activities: `/api/data/v9.2/plugintypes?$filter=isworkflowactivity eq true&$expand=pluginassemblyid($select=name,version)`

---

## New MCP Prompts

### 1. `plugin-deployment-report`
**Description**: Generate a comprehensive, human-readable deployment report for a plugin assembly.

**Parameters**:
- `assemblyName` (string, required): Name of the plugin assembly

**Output Format** (Markdown):
```markdown
# Plugin Deployment Report: {AssemblyName}

## Assembly Information
- **Version**: 1.0.0.5
- **Isolation Mode**: Sandbox
- **Source**: Database
- **Last Modified**: 2024-01-15 by John Doe
- **Managed**: No

## Plugin Types
1. MyCompany.Plugins.AccountPlugin
2. MyCompany.Plugins.ContactPlugin

## Registered Steps (5 total)

### Account - Update (PreOperation, Sync, Rank 10)
- **Plugin**: MyCompany.Plugins.AccountPlugin
- **Status**: ✓ Enabled
- **Filtering Attributes**: name, revenue, industrycode
- **Deployment**: Server Only
- **Images**:
  - PreImage "Target" → Attributes: name, revenue, accountnumber, ownerid

### Contact - Create (PostOperation, Async, Rank 20)
- **Plugin**: MyCompany.Plugins.ContactPlugin
- **Status**: ✓ Enabled
- **Filtering Attributes**: None (runs on all creates)
- **Deployment**: Server Only
- **Images**: None

## Validation Results

✓ All steps are enabled
✓ All update steps have filtering attributes
⚠ Warning: Contact.Create has no filtering attributes - runs on every create
⚠ Warning: Account.Delete step has no PreImage - may need target entity data
```

---

### 2. `entity-plugin-pipeline-report`
**Description**: Generate a visual execution pipeline showing all plugins for an entity.

**Parameters**:
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by message

**Output Format** (Markdown):
```markdown
# Plugin Pipeline: Account Entity

## Update Message

### Stage 1: PreValidation (Synchronous)
1. **[Rank 5]** DataValidationPlugin.ValidateAccountData
   - Assembly: CommonPlugins v1.2.0
   - Filtering: name, accountnumber
   - Images: PreImage "Original"

### Stage 2: PreOperation (Synchronous)
1. **[Rank 10]** BusinessLogicPlugin.EnrichAccountData
   - Assembly: BusinessLogic v2.0.1
   - Filtering: revenue, industrycode
   - Images: PreImage "Target"

2. **[Rank 15]** SecurityPlugin.CheckPermissions
   - Assembly: Security v1.0.0
   - Filtering: (all columns)

### Stage 3: PostOperation (Asynchronous)
1. **[Rank 10]** IntegrationPlugin.SyncToERP
   - Assembly: Integrations v3.1.0
   - Filtering: revenue
   - Images: PostImage "Updated"

## Create Message

### Stage 3: PostOperation (Asynchronous)
1. **[Rank 10]** NotificationPlugin.SendWelcomeEmail
   - Assembly: Notifications v1.0.0
   - Filtering: (none)
```

---

### 3. `plugin-validation-checklist`
**Description**: Generate a validation checklist for PR review.

**Parameters**:
- `assemblyName` (string, required): Plugin assembly name
- `expectedVersion` (string, optional): Expected version number

**Output Format** (Markdown):
```markdown
# Plugin Validation Checklist: MyPlugins

## Deployment Status
- [x] Assembly is deployed to Dataverse
- [x] Version matches expected: 1.0.0.5
- [x] Assembly is in Sandbox isolation mode
- [ ] All plugin types are registered

## Step Configuration
- [x] All steps are enabled
- [x] Update operations have filtering attributes
- [x] Execution order (rank) is configured correctly
- [ ] Impersonation users are configured where needed

## Images Configuration
- [x] Update steps have PreImages configured
- [ ] Image attributes include all required columns
- [x] Image aliases match code expectations

## Potential Issues
⚠ Account.Delete step missing PreImage - code may fail at runtime
⚠ Contact.Update has no filtering attributes - performance concern

## Recommendations
1. Add PreImage to Account.Delete step with attributes: name, accountnumber, ownerid
2. Add filtering attributes to Contact.Update: firstname, lastname, emailaddress1
3. Consider adding error handling for missing PreImage scenario
```

---

## Validation Logic

The MCP server should include automatic validation checks for common misconfigurations:

### Common Issues to Detect

1. **Missing Filtering Attributes**
   - Update/Delete operations without filtering attributes run on every field change
   - Flag: `stepsWithoutFilteringAttributes[]`

2. **Missing Images**
   - PreOperation/PreValidation steps on Update/Delete often need PreImages
   - PostOperation steps often need PostImages
   - Flag: `stepsWithoutImages[]`

3. **Version Mismatches**
   - Compare deployed version against expected version
   - Flag: `versionMismatch: boolean`

4. **Disabled Steps**
   - Steps that are registered but disabled
   - Flag: `hasDisabledSteps: boolean`

5. **Performance Concerns**
   - Synchronous PostOperation steps (should usually be async)
   - Steps without filtering on high-volume entities
   - Flag: `potentialPerformanceIssues[]`

6. **Security Issues**
   - Steps running with elevated privileges without clear reason
   - Flag: `impersonationUsed: boolean`

7. **Image Attribute Completeness**
   - Images that might be missing required attributes
   - Compare against common patterns (e.g., Update usually needs primary name field)

---

## Implementation Plan

### Phase 1: Core Plugin Tools (Priority: High)
1. Implement `get-plugin-assembly-complete`
2. Implement `get-entity-plugin-pipeline`
3. Add validation logic for common misconfigurations
4. Create helper methods in PowerPlatformService for plugin queries

### Phase 2: Trace Logs (Priority: High)
1. Implement `get-plugin-trace-logs`
2. Add parsing logic for exception details and stack traces
3. Add filtering capabilities

### Phase 3: Prompts (Priority: Medium)
1. Implement `plugin-deployment-report` prompt
2. Implement `entity-plugin-pipeline-report` prompt
3. Implement `plugin-validation-checklist` prompt

### Phase 4: Extended Components (Priority: Medium)
1. Implement `get-custom-api-complete`
2. Implement `get-service-endpoints`
3. Implement `get-workflow-activities`

### Phase 5: Documentation & Testing (Priority: High)
1. Update README.md with new tools and examples
2. Update CLAUDE.md with plugin validation architecture
3. Create example PR review workflow documentation
4. Test with real plugin assemblies

---

## API Reference: Dataverse Plugin Entities

### Key Entities
- **pluginassembly**: Plugin assembly registrations
- **plugintype**: Plugin class types
- **sdkmessageprocessingstep**: Step registrations
- **sdkmessageprocessingstepimage**: Pre/Post images
- **sdkmessage**: Message types (Create, Update, Delete, etc.)
- **plugintracelog**: Plugin execution trace logs
- **customapi**: Custom API definitions
- **customapirequestparameter**: Custom API input parameters
- **customapiresponseproperty**: Custom API output properties
- **serviceendpoint**: Service endpoint registrations

### Important Enumerations

**Stage** (sdkmessageprocessingstep.stage):
- 10 = PreValidation
- 20 = PreOperation
- 40 = PostOperation
- 50 = MainOperation (deprecated)

**Mode** (sdkmessageprocessingstep.mode):
- 0 = Synchronous
- 1 = Asynchronous

**Image Type** (sdkmessageprocessingstepimage.imagetype):
- 0 = PreImage
- 1 = PostImage
- 2 = Both

**Isolation Mode** (pluginassembly.isolationmode):
- 1 = None (runs in full trust)
- 2 = Sandbox (restricted)
- 3 = External (runs outside Dataverse)

---

## Success Metrics

1. **Tool Adoption**: AI agents successfully use tools to validate 80%+ of plugin PRs
2. **Misconfiguration Detection**: Identify at least 90% of common plugin registration issues
3. **Time Savings**: Reduce manual plugin validation time from 15 minutes to <2 minutes per PR
4. **Code Quality**: Reduce plugin-related production incidents by catching configuration issues during PR review

---

## Future Enhancements (Out of Scope for v1)

1. **Automated Configuration Comparison**: Parse C# plugin registration attributes and compare against Dataverse
2. **Plugin Registration Management**: Tools to create/update/delete plugin steps (write operations)
3. **Performance Analysis**: Analyze trace logs to identify slow-running plugins
4. **Historical Comparison**: Compare current configuration against previous versions
5. **Dependency Analysis**: Show which plugins depend on each other or share data
6. **Automated Testing Integration**: Trigger plugin step execution from MCP for testing
