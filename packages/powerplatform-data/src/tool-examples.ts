/**
 * Tool description examples for powerplatform-data package.
 * Improves LLM accuracy when calling tools (72% -> 90% per Anthropic research).
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

export const ODATA_FILTER_EXAMPLES = [
  { label: "Active records", value: "statecode eq 0" },
  { label: "Name match", value: "name eq 'Acme Corp'" },
  { label: "Created after date", value: "createdon gt 2026-01-01" },
  { label: "Contains text", value: "contains(fullname,'Smith')" },
];

export const SELECT_FIELD_EXAMPLES = [
  { label: "Contact fields", value: '["fullname","emailaddress1","telephone1"]' },
  { label: "Account fields", value: '["name","revenue","statuscode"]' },
];

export const ENTITY_NAME_EXAMPLES = [
  { label: "Accounts", value: "accounts" },
  { label: "Contacts", value: "contacts" },
  { label: "Custom entity", value: "new_applications" },
  { label: "Opportunities", value: "opportunities" },
  { label: "Leads", value: "leads" },
];

export const RECORD_DATA_EXAMPLES = [
  { label: "Simple fields", value: '{"name":"Acme Corp","telephone1":"555-0100"}' },
  { label: "Lookup bind", value: '{"new_titleid@odata.bind":"/new_titles(guid)"}' },
];

export const ODATA_BIND_EXAMPLES = [
  { label: "Simple lookup", value: "new_titleid@odata.bind: '/new_titles(guid)'" },
  { label: "Customer lookup", value: "customerid_account@odata.bind: '/accounts(guid)'" },
];

export const NAVIGATION_PROPERTY_EXAMPLES = [
  { label: "Account contacts (N:N)", value: "contact_customer_accounts" },
  { label: "Custom N:N relationship", value: "new_eventpackageadditionalitem_new_eventd" },
  { label: "Team members", value: "teammembership_association" },
];

export const COUNT_ENTITY_BATCH_EXAMPLES = [
  {
    label: "Count active records in multiple tables",
    value: '[{"entityNamePlural":"accounts","filter":"statecode eq 0"},{"entityNamePlural":"contacts","filter":"statecode eq 0"}]',
  },
  {
    label: "Count all records (no filter)",
    value: '[{"entityNamePlural":"new_membershipactions"},{"entityNamePlural":"new_applications"}]',
  },
];

export const ENTITY_NAME_SINGULAR_EXAMPLES = [
  { label: "Account", value: "account" },
  { label: "Contact", value: "contact" },
  { label: "Custom entity", value: "new_application" },
];
