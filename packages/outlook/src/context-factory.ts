/**
 * Shared service context factory - used by both MCP server and CLI.
 *
 * Built lazily, so the server starts and lists its tools without any
 * configuration; the first tool call reports what is missing.
 */
import { DelegatedGraphAuth, resolveDownloadDir } from '@mcp-consultant-tools/m365-core';
import { MailReadService } from './services/mail-read-service.js';
import { MailWriteService } from './services/mail-write-service.js';
import { MailSendService } from './services/mail-send-service.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

function requireEnv(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. ${hint}`);
  }
  return value;
}

export function createServiceContext(): ServiceContext {
  let auth: DelegatedGraphAuth | null = null;
  let mail: MailReadService | null = null;
  let write: MailWriteService | null = null;
  let send: MailSendService | null = null;

  function getAuth(): DelegatedGraphAuth {
    if (!auth) {
      const tenantId = requireEnv('OUTLOOK_TENANT_ID', 'Set it to your Microsoft Entra tenant id.');
      const clientId = requireEnv(
        'OUTLOOK_CLIENT_ID',
        "Set it to the application (client) id of an app registration with 'Allow public client flows' on " +
          'and delegated Microsoft Graph mail permissions (Mail.ReadWrite, Mail.Send) with admin consent.'
      );
      auth = new DelegatedGraphAuth({
        serverName: 'outlook',
        tenantId,
        clientId,
        authToolName: 'mail-authenticate',
      });
      console.error('Outlook service created (acts as the signed-in user)');
    }
    return auth;
  }

  return {
    get auth() { return getAuth(); },
    get mail() {
      if (!mail) {
        mail = new MailReadService(getAuth(), {
          downloadDir: resolveDownloadDir(process.env.OUTLOOK_DOWNLOAD_DIR, 'mcp-outlook'),
        });
      }
      return mail;
    },
    get write() {
      if (!write) {
        const maxMB = Number(process.env.OUTLOOK_MAX_ATTACHMENT_MB || '25');
        write = new MailWriteService(getAuth(), { maxAttachmentMB: Number.isFinite(maxMB) && maxMB > 0 ? maxMB : 25 });
      }
      return write;
    },
    get send() {
      if (!send) {
        send = new MailSendService(getAuth());
      }
      return send;
    },
  };
}
