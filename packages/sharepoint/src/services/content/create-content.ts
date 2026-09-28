/**
 * Creating a new file: a blank Word, Excel or PowerPoint file generated in
 * memory, or a text file with the content given. Never replaces an existing
 * file. Governed by SHAREPOINT_CONTENT_WRITE for the new file's format.
 */
import type { ContentCore } from './content-core.js';
import { statusOf } from './content-core.js';
import { formatLabel, formatOf, type ContentFormat } from './content-access.js';
import { blankDocx, blankPptx, blankXlsx } from './blank-files.js';

export interface CreateFileInput {
  /** Drive to create in, with folderPath (default: the drive root). */
  driveId?: string;
  folderPath?: string;
  /** A SharePoint or OneDrive link to the folder, instead of driveId and folderPath. */
  folderUrl?: string;
  fileName: string;
  /** Text files only: the content of the new file. */
  content?: string;
}

export interface CreateFileResult {
  itemId: string;
  driveId: string;
  name: string;
  format: ContentFormat;
  webUrl: string;
  /** Pass this to the edit tools as the file's first eTag. */
  eTag: string;
  size: number;
}

const BLANK: Record<Exclude<ContentFormat, 'text'>, () => Buffer> = { word: blankDocx, excel: blankXlsx, powerpoint: blankPptx };

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class CreateContent {
  constructor(
    private readonly core: ContentCore,
    private readonly resolveLink: (url: string) => Promise<{ driveId?: string; itemId: string; isFolder?: boolean }>
  ) {}

  async create(input: CreateFileInput): Promise<CreateFileResult> {
    const name = (input.fileName ?? '').trim();
    if (!name || /[\\/]/.test(name)) throw new Error(`'${input.fileName}' is not a valid file name; give a name without a folder, such as Plan.docx.`);
    const format = formatOf(name);
    if (!format) {
      throw new Error(`Cannot create '${name}': spo-create-file makes .docx, .xlsx, .pptx and text files (.txt, .md, .csv, .json and similar).`);
    }
    this.core.access.checkWrite(format);
    if (format !== 'text' && input.content !== undefined) {
      throw new Error(`A new ${formatLabel(format)} file is created blank; leave out content and fill it in with the ${formatLabel(format)} edit tool.`);
    }
    const bytes = format === 'text' ? Buffer.from(input.content ?? '', 'utf8') : BLANK[format]();
    this.core.checkSize(name, bytes.length);

    let driveId = input.driveId;
    let target: string;
    if (input.folderUrl) {
      if (input.driveId || input.folderPath) throw new Error('Give either folderUrl, or driveId with folderPath, not both.');
      const folder = await this.resolveLink(input.folderUrl);
      if (folder.isFolder === false) throw new Error('folderUrl points at a file, not a folder.');
      driveId = folder.driveId;
      target = `/drives/${driveId}/items/${folder.itemId}:/${encodeURIComponent(name)}:/content`;
    } else {
      if (!driveId) throw new Error('Name the folder with folderUrl (a SharePoint or OneDrive link), or with driveId and an optional folderPath.');
      const folder = (input.folderPath ?? '').replace(/^\/+|\/+$/g, '');
      target = `/drives/${driveId}/root:/${folder ? encodePath(folder) + '/' : ''}${encodeURIComponent(name)}:/content`;
    }

    let saved: any;
    try {
      const client = await this.core.client();
      saved = await client
        .api(target)
        .query({ '@microsoft.graph.conflictBehavior': 'fail' })
        .header('Content-Type', 'application/octet-stream')
        .put(bytes);
    } catch (error) {
      if (statusOf(error) === 409) throw new Error(`'${name}' already exists in that folder, so nothing was created.`);
      throw this.core.fail(error, 'create file');
    }

    return {
      itemId: saved.id,
      driveId: saved.parentReference?.driveId ?? driveId!,
      name: saved.name ?? name,
      format,
      webUrl: saved.webUrl,
      eTag: saved.eTag,
      size: saved.size ?? bytes.length,
    };
  }
}
