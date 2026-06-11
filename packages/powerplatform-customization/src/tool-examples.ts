/**
 * Tool Description Examples for powerplatform-customization package.
 *
 * Embeds usage examples in Zod `.describe()` strings to improve LLM accuracy.
 * Anthropic research shows 72% -> 90% accuracy improvement with examples.
 */
export { descWithExamples } from '@mcp-consultant-tools/core';

// --- Entity / Table examples ---

export const ENTITY_NAME_EXAMPLES = [
  { label: "Standard entity", value: "account" },
  { label: "Standard entity", value: "contact" },
  { label: "Custom entity", value: "new_application" },
  { label: "Custom entity", value: "contoso_project" },
];

export const OWNERSHIP_TYPE_EXAMPLES = [
  { label: "User-owned (most common)", value: "UserOwned" },
  { label: "Org-owned (reference data)", value: "OrganizationOwned" },
];

// --- Attribute / Column examples ---

export const ATTRIBUTE_TYPE_EXAMPLES = [
  { label: "Single-line text", value: "String" },
  { label: "Multi-line text", value: "Memo" },
  { label: "Whole number", value: "Integer" },
  { label: "Decimal number", value: "Decimal" },
  { label: "Currency", value: "Money" },
  { label: "Date and time", value: "DateTime" },
  { label: "Yes/No", value: "Boolean" },
  { label: "Choice (dropdown)", value: "Picklist" },
  { label: "Related record", value: "Lookup" },
  { label: "Auto-generated number", value: "AutoNumber" },
];

export const AUTO_NUMBER_FORMAT_EXAMPLES = [
  { label: "Sequential 5-digit", value: "{SEQNUM:5}" },
  { label: "Invoice prefix", value: "INV-{SEQNUM:6}" },
  { label: "Date + sequence", value: "{DATETIMEUTC:yyyyMMdd}-{SEQNUM:4}" },
  { label: "Random string", value: "{RANDSTRING:6}" },
  { label: "Combined", value: "CASE-{SEQNUM:4}-{RANDSTRING:4}" },
];

export const DATETIME_BEHAVIOR_EXAMPLES = [
  { label: "Adjusted to user timezone", value: "UserLocal" },
  { label: "Date without time component", value: "DateOnly" },
  { label: "Stored exactly as entered", value: "TimeZoneIndependent" },
];

// --- Option Set examples ---

export const OPTIONSET_OPTIONS_EXAMPLES = [
  { label: "Simple string array (auto-numbered)", value: '["Active","Inactive","Pending"]' },
  { label: "Explicit value/label objects", value: '[{"value":100000000,"label":"Active"},{"value":100000001,"label":"Inactive"}]' },
];

// --- Relationship examples ---

export const RELATIONSHIP_TYPE_EXAMPLES = [
  { label: "Parent-child (1:N)", value: "OneToMany" },
  { label: "Child-parent (N:1)", value: "ManyToOne" },
  { label: "Associative (N:N)", value: "ManyToMany" },
];

// --- Solution examples ---

export const SOLUTION_NAME_EXAMPLES = [
  { label: "Default solution", value: "DefaultSolution" },
  { label: "Custom solution", value: "MyCustomSolution" },
  { label: "Publisher-prefixed", value: "SIConsulting" },
];

export const SOLUTION_COMPONENT_TYPE_EXAMPLES = [
  { label: "Entity (table)", value: "1" },
  { label: "Attribute (column)", value: "2" },
  { label: "OptionSet (choice)", value: "9" },
  { label: "EntityRelationship", value: "10" },
  { label: "SystemForm", value: "60" },
  { label: "WebResource", value: "61" },
  { label: "PluginAssembly", value: "91" },
  { label: "SDKMessageProcessingStep", value: "93" },
  { label: "Workflow", value: "29" },
];

// --- Publisher examples ---

export const PUBLISHER_PREFIX_EXAMPLES = [
  { label: "Short prefix", value: "si" },
  { label: "Company prefix", value: "contoso" },
  { label: "Custom prefix", value: "mycomp" },
];

// --- Form file path examples ---

export const FORM_FILE_PATH_EXAMPLES = [
  { label: "Main form (relative)", value: "./docs/forms/contact-main.xml" },
  { label: "Quick create form", value: "./docs/forms/contact-quickcreate.xml" },
  { label: "Custom entity form", value: "./docs/forms/new_application-main.xml" },
  { label: "Absolute path", value: "/Users/dev/project/docs/forms/account-main.xml" },
];

// --- Web Resource file path examples ---

export const WEB_RESOURCE_FILE_PATH_EXAMPLES = [
  { label: "JavaScript file", value: "./webresources/si_/scripts/validation.js" },
  { label: "HTML page", value: "./webresources/si_/pages/config.html" },
  { label: "CSS stylesheet", value: "./webresources/si_/css/styles.css" },
  { label: "Absolute path", value: "/Users/dev/project/webresources/si_/scripts/ribbon.js" },
];

// --- Web Resource examples ---

export const WEB_RESOURCE_TYPE_EXAMPLES = [
  { label: "HTML page", value: "1" },
  { label: "CSS stylesheet", value: "2" },
  { label: "JavaScript", value: "3" },
  { label: "XML data", value: "4" },
  { label: "PNG image", value: "5" },
  { label: "JPG image", value: "6" },
  { label: "GIF image", value: "7" },
  { label: "ICO icon", value: "10" },
];

// --- Plugin examples ---

export const PLUGIN_STAGE_EXAMPLES = [
  { label: "Before validation", value: "PreValidation" },
  { label: "Before main operation", value: "PreOperation" },
  { label: "After main operation (most common)", value: "PostOperation" },
];

export const SDK_MESSAGE_EXAMPLES = [
  { label: "Record created", value: "Create" },
  { label: "Record updated", value: "Update" },
  { label: "Record deleted", value: "Delete" },
  { label: "Status changed", value: "SetState" },
  { label: "Record assigned", value: "Assign" },
];

// --- Flow template examples ---

export const FLOW_TEMPLATE_EXAMPLES = [
  { label: "Trigger on new record", value: "dataverse-on-create" },
  { label: "Trigger on record update", value: "dataverse-on-update" },
  { label: "Trigger on record delete", value: "dataverse-on-delete" },
  { label: "Create with condition + update", value: "dataverse-on-create-with-condition-and-update" },
  { label: "Recurring schedule", value: "scheduled-recurrence" },
  { label: "Manual button trigger", value: "manual-trigger" },
  { label: "HTTP request trigger", value: "http-request" },
];

// --- Field Security Profile examples ---

export const FSP_NAME_EXAMPLES = [
  { label: "Read-only access", value: "Contact - EDI Fields - Read Only" },
  { label: "Write-only (hide values from standard users)", value: "Contact - EDI Fields - Write Only" },
  { label: "Full access", value: "Contact - EDI Fields - Full Access" },
];

export const FSP_PERMISSION_EXAMPLES = [
  { label: "Grant access", value: "Allowed" },
  { label: "Deny access", value: "NotAllowed" },
];
