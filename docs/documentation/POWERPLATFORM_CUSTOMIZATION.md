# Microsoft PowerPlatform / Dynamics 365 Customization Integration

**📦 Package:** `@mcp-consultant-tools/powerplatform-customization`
**⚠️ Security:** NOT production-safe (schema modifications, entity/attribute creation, customization changes)

---

## 🚨 IMPORTANT: Security Warning

This package enables **schema modification operations** that can permanently change your Dataverse environment structure. It should **ONLY** be used in:
- Development environments
- Configuration/sandbox environments
- Automated deployment pipelines with proper approval workflows

**DO NOT use this package in production environments without strict access controls and approval processes.**

---

## 🔒 Package Split Information

As of **v16.0.0**, the PowerPlatform integration is split into **3 security-isolated packages**:

| Package | Purpose | Tools | Prompts | Production-Safe? |
|---------|---------|-------|---------|------------------|
| **[@mcp-consultant-tools/powerplatform](POWERPLATFORM.md)** | Read-only access | 38 | 10 | ✅ **YES** |
| **[@mcp-consultant-tools/powerplatform-customization](POWERPLATFORM_CUSTOMIZATION.md)** (This Package) | Schema changes | 40 | 2 | ⚠️ **NO** - Dev/config only |
| **[@mcp-consultant-tools/powerplatform-data](POWERPLATFORM_DATA.md)** | Data CRUD | 3 | 0 | ⚠️ **NO** - Operational use |

**This documentation covers the customization package only.** For read-only access or data CRUD operations, see the respective package documentation.

---

## Table of Contents

1. [Overview](#overview)
   - [What is This Package?](#what-is-this-package)
   - [Use Cases](#use-cases)
   - [Key Features](#key-features)
   - [Security Requirements](#security-requirements)

2. [Setup](#setup)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
   - [Environment Variables](#environment-variables)
   - [Required Permissions](#required-permissions)

3. [Tools (40 Total)](#tools-40-total)
   - [Entity Management (4)](#entity-management)
   - [Attribute Management (4)](#attribute-management)
   - [Relationship Management (4)](#relationship-management)
   - [Global Option Set Management (5)](#global-option-set-management)
   - [Form Management (6)](#form-management)
   - [View Management (6)](#view-management)
   - [Model-Driven App Management (3)](#model-driven-app-management)
   - [Web Resource Management (3)](#web-resource-management)
   - [Solution Management (5)](#solution-management)

4. [Prompts (2 Total)](#prompts-2-total)
   - [Deployment Validation](#deployment-validation)
   - [Customization Reports](#customization-reports)

5. [Usage Examples](#usage-examples)
   - [Entity Creation Workflow](#entity-creation-workflow)
   - [Form Customization](#form-customization)
   - [Solution Deployment](#solution-deployment)

6. [Best Practices](#best-practices)
   - [Development Workflow](#development-workflow)
   - [Solution Management](#solution-management-best-practices)
   - [Testing and Validation](#testing-and-validation)

7. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Permission Issues](#permission-issues)

---

## Overview

### What is This Package?

The `powerplatform-customization` package provides programmatic access to **Dataverse schema modification operations**. It enables AI-assisted development of PowerPlatform customizations including:

- Entity creation and management
- Attribute (field) creation and management
- Relationship configuration
- Form and view customization
- Model-driven app configuration
- Web resource management
- Solution packaging and deployment

This package **requires explicit enablement** via the `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` environment variable to prevent accidental schema modifications.

### Use Cases

**Primary Use Cases:**
1. **Accelerated Development**: Create entities, attributes, and forms via natural language instead of clicking through the UI
2. **Automated Deployment**: Script customization deployments for CI/CD pipelines
3. **Rapid Prototyping**: Quickly build proof-of-concept schemas for new applications
4. **Template-Based Development**: Use AI to generate consistent customizations across multiple entities
5. **Solution Management**: Package customizations into solutions for deployment
6. **Configuration as Code**: Define Dataverse schema as code-like configurations

**Example Workflow:**
```
Developer: "Create a new entity called 'Project Task' with fields for name, description, due date, and priority"
AI Agent: Uses create-entity → create-attribute (multiple) → create-form → publish-entity
Result: Fully functional entity in Dataverse, ready for use
```

### Key Features

- ✅ **Entity Management**: Create, update, delete, and publish custom entities
- ✅ **Attribute Management**: Create, update, delete attributes with all data types
- ✅ **Relationship Management**: Configure one-to-many and many-to-many relationships
- ✅ **Option Set Management**: Create and manage global option sets (picklists)
- ✅ **Form Customization**: Create and modify forms with sections, tabs, and fields
- ✅ **View Customization**: Create and modify views with columns and filters
- ✅ **App Configuration**: Add entities to model-driven apps, configure navigation
- ✅ **Web Resources**: Upload icons, scripts, CSS, and other web resources
- ✅ **Solution Management**: Package customizations for deployment
- ✅ **Publishing**: Automatic customization publishing
- ✅ **Icon Management**: Set entity icons using Microsoft Fluent UI System Icons

**Safety Features:**
- ❗ **Requires explicit flag**: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`
- ❗ **Audit logging**: All operations logged for compliance
- ❗ **Error validation**: Pre-checks before destructive operations
- ❗ **Solution-aware**: Encourages solution-based customizations

### Security Requirements

**Environment Flag (Required):**
```bash
POWERPLATFORM_ENABLE_CUSTOMIZATION=true
```

**Without this flag**, all customization tools will throw an error:
```
Error: Customization operations are disabled. Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true to enable.
```

**Recommended Security Model:**
1. **Development**: Set `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`
2. **QA/UAT**: Set `POWERPLATFORM_ENABLE_CUSTOMIZATION=false` (use base package only)
3. **Production**: Set `POWERPLATFORM_ENABLE_CUSTOMIZATION=false` (use base package only)

---

## Setup

### Prerequisites

1. **PowerPlatform Environment**: Development or sandbox environment (NOT production)
2. **Azure AD App Registration**: With Dataverse permissions
3. **System Customizer Role**: Application user needs customization privileges
4. **Base Package**: This package depends on `@mcp-consultant-tools/powerplatform`

### Installation

```bash
# Install base package + customization package
npm install @mcp-consultant-tools/core @mcp-consultant-tools/powerplatform @mcp-consultant-tools/powerplatform-customization
```

### Environment Variables

```bash
# PowerPlatform Configuration (Required)
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-azure-app-client-id
POWERPLATFORM_CLIENT_SECRET=your-azure-app-client-secret
POWERPLATFORM_TENANT_ID=your-azure-tenant-id

# Customization Control (Required - MUST be explicitly set to true)
POWERPLATFORM_ENABLE_CUSTOMIZATION=true

# Default Solution (Optional - recommended for organized customizations)
POWERPLATFORM_DEFAULT_SOLUTION=YourSolutionUniqueName
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "powerplatform-customization": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform-customization"],
      "env": {
        "POWERPLATFORM_URL": "https://yourdevenv.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-azure-app-secret",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id",
        "POWERPLATFORM_ENABLE_CUSTOMIZATION": "true",
        "POWERPLATFORM_DEFAULT_SOLUTION": "MySolution"
      }
    }
  }
}
```

### Required Permissions

The application user must have **System Customizer** or **System Administrator** role with these privileges:

| Privilege | Required For |
|-----------|--------------|
| Create Entity Metadata | Creating custom entities |
| Update Entity Metadata | Modifying entity properties |
| Delete Entity Metadata | Removing custom entities |
| Create Attribute Metadata | Adding fields to entities |
| Update Attribute Metadata | Modifying field properties |
| Delete Attribute Metadata | Removing fields |
| Create Relationship | Creating entity relationships |
| Update Relationship | Modifying relationships |
| Delete Relationship | Removing relationships |
| Create Option Set | Creating global option sets |
| Publish Customizations | Publishing changes |
| Export Solution | Exporting solutions |
| Import Solution | Importing solutions |

**Assign Role:**
1. Go to PowerPlatform Admin Center
2. Select your environment → **Users + permissions** → **Application users**
3. Select your application user
4. Click **Manage security roles**
5. Assign **System Customizer** or **System Administrator**

---

## Tools (40 Total)

### Entity Management

1. **`create-entity`** - Create a new custom entity
   - Parameters: `displayName`, `pluralDisplayName`, `schemaName`, `description`, `primaryAttributeSchemaName`
   - Returns: Entity metadata with MetadataId
   - Use case: Create new business objects (e.g., "Project Task", "Equipment Request")

2. **`update-entity`** - Update entity properties
   - Parameters: `entityLogicalName`, `displayName`, `description`, `iconVectorName`
   - Returns: Updated entity metadata
   - Use case: Rename entities, update descriptions, change icons

3. **`delete-entity`** - Delete a custom entity (permanent)
   - Parameters: `entityLogicalName`
   - Returns: Confirmation
   - Use case: Remove unused entities from development environment
   - **Warning**: Deletes all data in the entity permanently

4. **`publish-entity`** - Publish entity customizations
   - Parameters: `entityLogicalName`
   - Returns: Confirmation
   - Use case: Make entity changes visible to users

### Attribute Management

5. **`create-attribute`** - Create a new attribute (field)
   - Parameters: `entityLogicalName`, `attributeType`, `schemaName`, `displayName`, `description`, `isRequired`, `maxLength` (text), `minValue`/`maxValue` (number), `format` (datetime)
   - Supported types: `String`, `Memo`, `Integer`, `Decimal`, `Money`, `DateTime`, `Boolean`, `Picklist`, `Lookup`
   - Returns: Attribute metadata
   - Use case: Add fields to entities

6. **`update-attribute`** - Update attribute properties
   - Parameters: `entityLogicalName`, `attributeLogicalName`, `displayName`, `description`, `isRequired`
   - Returns: Updated attribute metadata
   - Use case: Rename fields, change descriptions

7. **`delete-attribute`** - Delete a custom attribute
   - Parameters: `entityLogicalName`, `attributeLogicalName`
   - Returns: Confirmation
   - Use case: Remove unused fields
   - **Warning**: Deletes field data permanently

8. **`update-entity-icon`** - Set entity icon using Fluent UI icons
   - Parameters: `entityLogicalName`, `iconFileName`, `solutionUniqueName`
   - Icon format: `{name}_{size}_{style}.svg` (e.g., `people_community_24_filled.svg`)
   - Returns: Web resource ID and icon vector name
   - Use case: Brand entities with professional Microsoft icons

### Relationship Management

9. **`create-one-to-many-relationship`** - Create 1:N relationship
   - Parameters: `primaryEntity`, `relatedEntity`, `schemaName`, `lookupAttributeDisplayName`
   - Returns: Relationship metadata
   - Use case: Create parent-child relationships (e.g., Account → Contacts)

10. **`create-many-to-many-relationship`** - Create N:N relationship
    - Parameters: `entity1LogicalName`, `entity2LogicalName`, `schemaName`
    - Returns: Relationship metadata and intersect entity
    - Use case: Create associative relationships (e.g., Courses ↔ Students)

11. **`update-one-to-many-relationship`** - Update 1:N relationship
    - Parameters: `schemaName`, `cascade Configuration` (delete, merge, reparent, share, unshare)
    - Returns: Updated relationship metadata
    - Use case: Change cascade behavior

12. **`delete-relationship`** - Delete a relationship
    - Parameters: `schemaName`
    - Returns: Confirmation
    - Use case: Remove unused relationships

### Global Option Set Management

13. **`create-global-option-set`** - Create global picklist
    - Parameters: `name`, `displayName`, `options` (array of {value, label})
    - Returns: Option set metadata
    - Use case: Create reusable picklists (e.g., "Priority", "Status")

14. **`update-global-option-set`** - Update option set
    - Parameters: `name`, `displayName`, `description`
    - Returns: Updated metadata
    - Use case: Rename option sets

15. **`add-option-set-value`** - Add option to existing set
    - Parameters: `optionSetName`, `value`, `label`
    - Returns: Confirmation
    - Use case: Extend picklists with new values

16. **`update-option-set-value`** - Update option label
    - Parameters: `optionSetName`, `value`, `newLabel`
    - Returns: Confirmation
    - Use case: Rename picklist options

17. **`delete-global-option-set`** - Delete global option set
    - Parameters: `name`
    - Returns: Confirmation
    - Use case: Remove unused option sets

### Form Management

18. **`create-form`** - Create new form
    - Parameters: `entityLogicalName`, `formName`, `formType` (Main/QuickCreate/QuickView/Card)
    - Returns: Form ID
    - Use case: Create custom forms for entities

19. **`update-form`** - Update form metadata
    - Parameters: `formId`, `formXml`
    - Returns: Confirmation
    - Use case: Modify form layout programmatically

20. **`delete-form`** - Delete form
    - Parameters: `formId`
    - Returns: Confirmation
    - Use case: Remove unused forms

21. **`get-form-xml`** - Get form definition (XML)
    - Parameters: `formId`
    - Returns: FormXML
    - Use case: Extract form structure for modification

22. **`add-field-to-form`** - Add field to form
    - Parameters: `formId`, `attributeLogicalName`, `tabName`, `sectionName`
    - Returns: Updated FormXML
    - Use case: Programmatically add fields to forms

23. **`publish-form`** - Publish form changes
    - Parameters: `formId`
    - Returns: Confirmation
    - Use case: Make form changes visible

### View Management

24. **`create-view`** - Create new view
    - Parameters: `entityLogicalName`, `viewName`, `fetchXml`, `layoutXml`, `isDefault`
    - Returns: View ID (savedqueryid)
    - Use case: Create custom views with specific columns/filters

25. **`update-view`** - Update view definition
    - Parameters: `viewId`, `fetchXml`, `layoutXml`
    - Returns: Confirmation
    - Use case: Modify view columns or filters

26. **`delete-view`** - Delete view
    - Parameters: `viewId`
    - Returns: Confirmation
    - Use case: Remove unused views

27. **`get-view-definition`** - Get view FetchXML and layout
    - Parameters: `viewId`
    - Returns: FetchXML and LayoutXML
    - Use case: Extract view structure for modification

28. **`add-column-to-view`** - Add column to view
    - Parameters: `viewId`, `attributeLogicalName`, `width`
    - Returns: Updated layout
    - Use case: Programmatically add columns to views

29. **`publish-view`** - Publish view changes
    - Parameters: `viewId`
    - Returns: Confirmation
    - Use case: Make view changes visible

### Model-Driven App Management

30. **`add-entity-to-app`** - Add entity to app sitemap
    - Parameters: `appId`, `entityLogicalName`, `areaName`, `groupName`
    - Returns: Confirmation
    - Use case: Configure app navigation

31. **`remove-entity-from-app`** - Remove entity from app
    - Parameters: `appId`, `entityLogicalName`
    - Returns: Confirmation
    - Use case: Clean up app navigation

32. **`publish-app`** - Publish app changes
    - Parameters: `appId`
    - Returns: Confirmation
    - Use case: Deploy app configuration changes

### Web Resource Management

33. **`create-web-resource`** - Upload web resource
    - Parameters: `name`, `displayName`, `webResourceType`, `content` (base64)
    - Supported types: HTML, CSS, JavaScript, XML, PNG, JPG, GIF, SVG, ICO
    - Returns: Web resource ID
    - Use case: Upload custom scripts, styles, icons

34. **`update-web-resource`** - Update web resource content
    - Parameters: `webResourceId`, `content` (base64)
    - Returns: Confirmation
    - Use case: Update existing web resources

35. **`delete-web-resource`** - Delete web resource
    - Parameters: `webResourceId`
    - Returns: Confirmation
    - Use case: Remove unused web resources

### Solution Management

36. **`add-to-solution`** - Add component to solution
    - Parameters: `solutionUniqueName`, `componentId`, `componentType`
    - Component types: Entity (1), Attribute (2), Relationship (10), Form (60), View (26), etc.
    - Returns: Confirmation
    - Use case: Package customizations for deployment

37. **`remove-from-solution`** - Remove component from solution
    - Parameters: `solutionUniqueName`, `componentId`, `componentType`
    - Returns: Confirmation
    - Use case: Clean up solution contents

38. **`export-solution`** - Export solution as zip
    - Parameters: `solutionUniqueName`, `managed` (boolean)
    - Returns: Base64-encoded solution zip
    - Use case: Export for deployment to other environments

39. **`import-solution`** - Import solution zip
    - Parameters: `solutionZip` (base64), `publishWorkflows`, `overwriteUnmanagedCustomizations`
    - Returns: Import job ID
    - Use case: Deploy solutions to environment

40. **`publish-all-customizations`** - Publish all unpublished customizations
    - Parameters: None
    - Returns: Confirmation
    - Use case: Batch publish after multiple changes

---

## Prompts (2 Total)

### Deployment Validation

1. **`customization-deployment-report`** - Generate deployment validation report
   - Parameters: `solutionUniqueName`
   - Returns: Markdown report with:
     - Solution components list
     - Dependency analysis
     - Missing dependencies warnings
     - Deployment checklist
   - Use case: Pre-deployment validation

### Customization Reports

2. **`entity-customization-report`** - Generate entity customization summary
   - Parameters: `entityLogicalName`
   - Returns: Markdown report with:
     - Entity properties
     - All attributes with types
     - All relationships
     - All forms and views
     - Solution membership
   - Use case: Documentation generation

---

## Usage Examples

### Entity Creation Workflow

**Scenario:** Create a "Project Task" entity with common fields

```typescript
// 1. Create entity
await invoke("create-entity", {
  displayName: "Project Task",
  pluralDisplayName: "Project Tasks",
  schemaName: "new_projecttask",
  description: "Tracks tasks within projects",
  primaryAttributeSchemaName: "new_name"
});

// 2. Create attributes
await invoke("create-attribute", {
  entityLogicalName: "new_projecttask",
  attributeType: "Memo",
  schemaName: "new_description",
  displayName: "Description",
  description: "Task description",
  isRequired: false
});

await invoke("create-attribute", {
  entityLogicalName: "new_projecttask",
  attributeType: "DateTime",
  schemaName: "new_duedate",
  displayName: "Due Date",
  format: "DateOnly",
  isRequired: true
});

await invoke("create-attribute", {
  entityLogicalName: "new_projecttask",
  attributeType: "Picklist",
  schemaName: "new_priority",
  displayName: "Priority",
  options: [
    {value: 1, label: "Low"},
    {value: 2, label: "Medium"},
    {value: 3, label: "High"}
  ]
});

// 3. Set entity icon
await invoke("update-entity-icon", {
  entityLogicalName: "new_projecttask",
  iconFileName: "task_list_24_filled.svg",
  solutionUniqueName: "MySolution"
});

// 4. Publish entity
await invoke("publish-entity", {
  entityLogicalName: "new_projecttask"
});
```

### Form Customization

**Scenario:** Add custom fields to existing form

```typescript
// 1. Get form XML
const formData = await invoke("get-form-xml", {
  formId: "form-guid-here"
});

// 2. Add field to form
await invoke("add-field-to-form", {
  formId: "form-guid-here",
  attributeLogicalName: "new_customfield",
  tabName: "General",
  sectionName: "Details"
});

// 3. Publish form
await invoke("publish-form", {
  formId: "form-guid-here"
});
```

### Solution Deployment

**Scenario:** Package customizations and export

```typescript
// 1. Add components to solution
await invoke("add-to-solution", {
  solutionUniqueName: "MySolution",
  componentId: "entity-metadata-id",
  componentType: 1 // Entity
});

// 2. Validate deployment
const report = await invoke("customization-deployment-report", {
  solutionUniqueName: "MySolution"
});

// 3. Export solution
const solutionZip = await invoke("export-solution", {
  solutionUniqueName: "MySolution",
  managed: true
});

// Save solutionZip to file for deployment
```

---

## Best Practices

### Development Workflow

1. **Always Use Solutions**: Package customizations in solutions for proper ALM
2. **Start with Read-Only Package**: Validate environment before enabling customization
3. **Use Descriptive Schema Names**: Follow naming conventions (e.g., `new_taskname`, not `new_field1`)
4. **Test in Development First**: Never test customization tools in production
5. **Publish Incrementally**: Publish after each logical group of changes
6. **Document Changes**: Use description fields for all customizations

### Solution Management Best Practices

1. **One Solution Per Feature**: Create separate solutions for different features
2. **Include Dependencies**: Explicitly add dependent components to solutions
3. **Export Managed Solutions**: Use managed solutions for target environments
4. **Version Solutions**: Increment solution version numbers for each export
5. **Test Imports**: Always test solution imports in UAT before production

### Testing and Validation

1. **Use Validation Prompts**: Run `customization-deployment-report` before deployment
2. **Check Dependencies**: Verify all dependencies are included in solution
3. **Test Publishing**: Ensure customizations publish without errors
4. **Validate Forms**: Check that forms render correctly after publishing
5. **Test End-to-End**: Validate user workflows after customizations

---

## Troubleshooting

### Common Errors

**Error:** `Customization operations are disabled`
- **Cause**: `POWERPLATFORM_ENABLE_CUSTOMIZATION` not set to `true`
- **Fix**: Add `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` to environment variables

**Error:** `The user does not have create privilege for entity systemform`
- **Cause**: Application user lacks System Customizer role
- **Fix**: Assign System Customizer or System Administrator role in PowerPlatform Admin Center

**Error:** `Entity with logical name 'new_entityname' already exists`
- **Cause**: Entity with same schema name already exists
- **Fix**: Use different schema name or delete existing entity first

**Error:** `Cannot delete entity with existing data`
- **Cause**: Entity contains records
- **Fix**: Delete all records first, or use solution uninstall to remove entity

**Error:** `Publish operation failed`
- **Cause**: Invalid customization (e.g., required field without default value)
- **Fix**: Review error details, fix validation issues, retry publish

### Permission Issues

**Problem:** Tools work but publish fails
- **Cause**: User has Create/Update but not Publish privilege
- **Fix**: Ensure "Publish Customizations" privilege is granted

**Problem:** Can create entities but not attributes
- **Cause**: Granular privilege issue
- **Fix**: Grant full "Create Attribute Metadata" privilege

**Problem:** Cannot add to solution
- **Cause**: Missing solution management privileges
- **Fix**: Grant "Add to Solution" and "Remove from Solution" privileges

---

## Related Documentation

- [PowerPlatform Read-Only Package](POWERPLATFORM.md) - Base read-only capabilities
- [PowerPlatform Data Package](POWERPLATFORM_DATA.md) - Record CRUD operations
- [Dataverse Web API Reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)
- [Solution Concepts](https://learn.microsoft.com/en-us/power-platform/alm/solution-concepts-alm)

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: https://github.com/klemensms/mcp-consultant-tools/issues
- Documentation: https://github.com/klemensms/mcp-consultant-tools
