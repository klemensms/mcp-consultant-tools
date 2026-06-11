export { descWithExamples } from '@mcp-consultant-tools/core';

export const USER_FILTER_EXAMPLES = [
  { label: 'Name starts with', value: "startswith(displayName,'John')" },
  { label: 'Exact email match', value: "mail eq 'user@example.com'" },
  { label: 'Active accounts only', value: 'accountEnabled eq true' },
];

export const SEARCH_FIELD_EXAMPLES = [
  { label: 'Display name', value: 'displayName' },
  { label: 'Email address', value: 'mail' },
  { label: 'Principal name', value: 'userPrincipalName' },
  { label: 'First name', value: 'givenName' },
  { label: 'Last name', value: 'surname' },
];

export const USER_ID_EXAMPLES = [
  { label: 'GUID format', value: '12345678-1234-1234-1234-123456789abc' },
  { label: 'User principal name', value: 'user@tenant.onmicrosoft.com' },
];

export const USER_FLOW_EXAMPLES = [
  { label: 'Sign-in flow', value: 'B2C_1_signin' },
  { label: 'Sign-up flow', value: 'B2C_1_signup' },
  { label: 'Password reset flow', value: 'B2C_1_passwordreset' },
];

export const GROUP_ID_EXAMPLES = [
  { label: 'Group GUID', value: '12345678-1234-1234-1234-123456789abc' },
];
