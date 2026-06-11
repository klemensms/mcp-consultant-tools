/**
 * Tool description examples for onepassword package.
 * Improves LLM accuracy when calling tools (72% -> 90% per Anthropic research).
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

export const SECRET_REFERENCE_EXAMPLES = [
  { label: "Login password", value: "op://VaultName/ItemTitle/password" },
  { label: "API credentials", value: "op://Client ABC/Azure App Registration/client_secret" },
  { label: "Database password", value: "op://DevOps/SQL Server Prod/password" },
];

export const ITEM_CATEGORY_EXAMPLES = [
  { label: "Login credentials", value: "Login" },
  { label: "API key pair", value: "ApiCredentials" },
  { label: "Secure note", value: "SecureNote" },
  { label: "Database connection", value: "Database" },
  { label: "SSH key", value: "SshKey" },
  { label: "Server/host", value: "Server" },
];

export const ITEM_FIELDS_EXAMPLES = [
  { label: "Login fields", value: '[{"title":"username","value":"admin","fieldType":"Text"},{"title":"password","value":"secret123","fieldType":"Concealed"}]' },
  { label: "API credentials", value: '[{"title":"client_id","value":"abc-123","fieldType":"Text"},{"title":"client_secret","value":"secret","fieldType":"Concealed"}]' },
];

export const PERMISSION_EXAMPLES = [
  { label: "Read-only", value: '["read"]' },
  { label: "Read + write", value: '["read","create","update"]' },
  { label: "Full access", value: '["read","create","update","delete","share"]' },
];

export const PASSWORD_RECIPE_EXAMPLES = [
  { label: "Strong random (32 chars)", value: '{"type":"random","length":32}' },
  { label: "Memorable passphrase", value: '{"type":"memorable","wordCount":4,"separator":"digits"}' },
  { label: "PIN code", value: '{"type":"pin","length":6}' },
];

export const VAULT_NAME_EXAMPLES = [
  { label: "By name", value: "Client ABC" },
  { label: "By UUID", value: "abc12345-def6-7890-abcd-ef1234567890" },
];
