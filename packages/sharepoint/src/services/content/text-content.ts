/** Reading and replacing the content of text files (.txt, .md, .csv, .json and similar) in memory. */
import type { ContentCore, ItemRef, WriteResult } from './content-core.js';

export interface TextReadResult {
  name: string;
  webUrl: string;
  /** Pass this to spo-write-text; the write is refused if the file changes in between. */
  eTag: string;
  lastModifiedDateTime?: string;
  size: number;
  content: string;
}

const BOM = '﻿';

export class TextContent {
  constructor(private readonly core: ContentCore) {}

  async read(ref: ItemRef): Promise<TextReadResult> {
    this.core.access.checkRead('text');
    const item = await this.core.locate(ref, ['text']);
    const text = (await this.core.readBytes(item)).toString('utf8');
    return {
      name: item.name,
      webUrl: item.webUrl,
      eTag: item.eTag,
      lastModifiedDateTime: item.lastModifiedDateTime,
      size: item.size,
      content: text.startsWith(BOM) ? text.slice(1) : text,
    };
  }

  async write(ref: ItemRef, content: string, eTag: string): Promise<WriteResult> {
    this.core.access.checkWrite('text');
    const item = await this.core.locate(ref, ['text']);
    return this.core.writeBytes(item, Buffer.from(content, 'utf8'), eTag);
  }
}
