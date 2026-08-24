import type { ServiceContext } from '../types.js';
import { CODE_REVIEW_TEMPLATE, NUGET_AUDIT_TEMPLATE } from './templates.js';

function staticPrompt(server: any, name: string, description: string, text: string): void {
  server.prompt(name, description, {}, async () => ({
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }));
}

export function registerAllPrompts(server: any, _ctx: ServiceContext): void {
  staticPrompt(
    server,
    'cr-code-review',
    'Review the technical health of a repository - .NET framework EOL, NuGet vulnerabilities/staleness, and code-complexity estimate - and summarise the critical actions',
    CODE_REVIEW_TEMPLATE,
  );

  staticPrompt(
    server,
    'cr-nuget-audit',
    'Audit a repository\'s NuGet packages for known vulnerabilities and outdated versions, with concrete upgrades',
    NUGET_AUDIT_TEMPLATE,
  );
}

export { CODE_REVIEW_TEMPLATE, NUGET_AUDIT_TEMPLATE } from './templates.js';
