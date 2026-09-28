/**
 * Reading and editing the content of SharePoint and OneDrive files in place,
 * one class per format, sharing ContentCore. Governed by
 * SHAREPOINT_CONTENT_READ and SHAREPOINT_CONTENT_WRITE (see content-access.ts).
 */
import { ContentCore, type ContentDeps } from './content-core.js';
import { TextContent } from './text-content.js';
import { ExcelContent } from './excel-content.js';

export class ContentService {
  readonly core: ContentCore;
  readonly text: TextContent;
  readonly excel: ExcelContent;

  constructor(deps: ContentDeps) {
    this.core = new ContentCore(deps);
    this.text = new TextContent(this.core);
    this.excel = new ExcelContent(this.core);
  }
}
