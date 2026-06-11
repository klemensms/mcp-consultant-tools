// Minimal ambient types for turndown-plugin-gfm (ships no .d.ts).
// Each export is a Turndown plugin: a function that registers rules on a service.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  type Plugin = (service: TurndownService) => void;
  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
}
