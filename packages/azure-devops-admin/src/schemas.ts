/**
 * Shared Zod schema helpers that coerce string-wrapped numbers and arrays.
 *
 * Some MCP harnesses serialize tool-call parameter values as strings even
 * when the source value was a number or array (e.g. `1351` arrives as
 * `"1351"`, `[1351]` arrives as `"[1351]"`). Strict `z.number()` /
 * `z.array(z.number())` schemas reject these, breaking tool calls. These
 * preprocess helpers accept both native and stringified forms.
 *
 * Mirrors `packages/azure-devops/src/schemas.ts` — keep in sync.
 */
import { z } from 'zod';

export const zCoerceNumber = () =>
  z.preprocess((v) => {
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      return Number(v.trim());
    }
    return v;
  }, z.number());

export const zCoerceNumberArray = () =>
  z.preprocess((v) => {
    if (Array.isArray(v)) {
      return v.map((item) =>
        typeof item === 'string' && /^-?\d+(\.\d+)?$/.test(item.trim())
          ? Number(item.trim())
          : item,
      );
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) =>
            typeof item === 'string' && /^-?\d+(\.\d+)?$/.test(item.trim())
              ? Number(item.trim())
              : item,
          );
        }
        if (typeof parsed === 'number') return [parsed];
      } catch {
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) return [Number(trimmed)];
      }
      return v;
    }
    if (typeof v === 'number') return [v];
    return v;
  }, z.array(z.number()));
