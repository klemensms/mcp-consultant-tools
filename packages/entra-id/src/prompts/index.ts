import type { ServiceContext } from '../types.js';
import {
  CREDENTIAL_EXPIRY_AUDIT_TEMPLATE,
  APP_PERMISSION_REVIEW_TEMPLATE,
} from './templates.js';

function staticPrompt(server: any, name: string, description: string, text: string): void {
  server.prompt(name, description, {}, async () => ({
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }));
}

export function registerAllPrompts(server: any, _ctx: ServiceContext): void {
  staticPrompt(
    server,
    'entra-credential-expiry-audit',
    'Audit app registrations for expired and expiring client secrets and certificates, and report what needs rotating',
    CREDENTIAL_EXPIRY_AUDIT_TEMPLATE
  );

  staticPrompt(
    server,
    'entra-app-permission-review',
    'Review the API permissions held by app registrations, focusing on over-broad application-type grants',
    APP_PERMISSION_REVIEW_TEMPLATE
  );
}

export {
  CREDENTIAL_EXPIRY_AUDIT_TEMPLATE,
  APP_PERMISSION_REVIEW_TEMPLATE,
} from './templates.js';
