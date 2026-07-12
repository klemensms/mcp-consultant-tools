import type { ServiceContext } from '../types.js';
import { SERVICE_HEALTH_REVIEW_TEMPLATE, MESSAGE_CENTER_DIGEST_TEMPLATE } from './templates.js';

function staticPrompt(server: any, name: string, description: string, text: string): void {
  server.prompt(name, description, {}, async () => ({
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }));
}

export function registerAllPrompts(server: any, _ctx: ServiceContext): void {
  staticPrompt(
    server,
    'm365-service-health-review',
    'Review current Microsoft 365 service health and report which services are impacted and what is unresolved right now',
    SERVICE_HEALTH_REVIEW_TEMPLATE
  );

  staticPrompt(
    server,
    'm365-message-center-digest',
    'Summarise the Message Center posts that need administrator action, ordered by deadline and impact',
    MESSAGE_CENTER_DIGEST_TEMPLATE
  );
}

export { SERVICE_HEALTH_REVIEW_TEMPLATE, MESSAGE_CENTER_DIGEST_TEMPLATE } from './templates.js';
