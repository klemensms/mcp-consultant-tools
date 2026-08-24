/**
 * Secret tools - 3 read-only tools (always enabled)
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  SECRET_REFERENCE_EXAMPLES,
  PASSWORD_RECIPE_EXAMPLES,
} from '../tool-examples.js';

export function registerSecretTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "resolve-secret",
    "Resolve a 1Password secret reference URI (op://vault/item/field) to its value. Always enabled.",
    {
      reference: z.string().describe(
        descWithExamples("Secret reference in op:// format", SECRET_REFERENCE_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ reference }: { reference: string }) => {
      try {
        const value = await ctx.secrets.resolveSecret(reference);
        return {
          content: [{ type: "text", text: value }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error resolving secret: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "resolve-secrets",
    "Resolve multiple 1Password secret references in one call. Returns per-reference results (success or error).",
    {
      references: z.array(z.string()).describe(
        descWithExamples("Array of secret references in op:// format", SECRET_REFERENCE_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ references }: { references: string[] }) => {
      try {
        const results = await ctx.secrets.resolveSecrets(references);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error resolving secrets: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "generate-password",
    "Generate a password or passphrase using 1Password's generator.",
    {
      type: z.enum(["random", "memorable", "pin"]).describe("Password type"),
      length: z.number().optional().describe("Length (random: default 32, pin: default 6)"),
      includeDigits: z.boolean().optional().describe("Include digits (random only, default true)"),
      includeSymbols: z.boolean().optional().describe("Include symbols (random only, default true)"),
      includeUppercase: z.boolean().optional().describe("Include uppercase (random only, default true)"),
      includeLowercase: z.boolean().optional().describe("Include lowercase (random only, default true)"),
      wordCount: z.number().optional().describe("Number of words (memorable only, default 4)"),
      separator: z.string().optional().describe("Word separator type (memorable only: digits/symbols/spaces/none)"),
      capitalize: z.boolean().optional().describe("Capitalize words (memorable only, default true)"),
    },
    // Generates a value locally; reads or writes no vault data.
    { readOnlyHint: true },
    async (args: any) => {
      try {
        const recipe = { type: args.type, ...args };
        const password = await ctx.secrets.generatePassword(recipe);
        return {
          content: [{ type: "text", text: password }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error generating password: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
