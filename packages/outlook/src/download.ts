/**
 * Saving a mail attachment to disk. Only file attachments carry bytes: an item
 * attachment is an embedded Outlook item (a forwarded mail, an event) and a
 * reference attachment is a link to a cloud file, so neither can be saved as a
 * file and both are refused by name rather than written as an empty file.
 */
import { saveToDownloadDir } from '@mcp-consultant-tools/m365-core';
import type { SavedAttachment } from './types.js';

const FILE_ATTACHMENT = '#microsoft.graph.fileAttachment';

export interface GraphAttachment {
  '@odata.type'?: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
}

export function saveFileAttachment(attachment: GraphAttachment, downloadDir: string): SavedAttachment {
  const type = attachment['@odata.type'] ?? '';
  if (type !== FILE_ATTACHMENT) {
    const kind = type.replace('#microsoft.graph.', '') || 'unknown';
    throw new Error(
      `This attachment is a ${kind}, not a file, so it cannot be saved. ` +
        (kind === 'itemAttachment'
          ? 'It is an embedded Outlook item (such as a forwarded email); open the message in Outlook to read it.'
          : kind === 'referenceAttachment'
            ? 'It is a link to a cloud file; open the link, or use the SharePoint server to download the file.'
            : 'Only file attachments can be downloaded.')
    );
  }
  if (attachment.contentBytes === undefined) {
    throw new Error('Graph returned the attachment without its content.');
  }

  const data = Buffer.from(attachment.contentBytes, 'base64');
  const path = saveToDownloadDir(downloadDir, attachment.name ?? 'attachment', data);
  return { path, size: data.length, contentType: attachment.contentType ?? 'application/octet-stream' };
}
