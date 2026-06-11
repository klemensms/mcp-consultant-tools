/**
 * Secret CLI Commands - 3 commands mapping to secret MCP tools:
 *   resolve-secret, resolve-secrets, generate-password
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerSecretCommands(program: Command, ctx: ServiceContext): void {
  const secret = program.command('secret').description('1Password secret resolution and password generation');

  secret
    .command('resolve <reference>')
    .description('Resolve a single secret reference URI (e.g. op://vault/item/field)')
    .action(async (reference: string) => {
      try {
        const value = await ctx.secrets.resolveSecret(reference);
        outputResult(
          {
            fileName: `secret-resolve`,
            data: { reference, value },
            summary: `Resolved secret: ${reference}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'resolve secret');
      }
    });

  secret
    .command('resolve-many')
    .description('Resolve multiple secret reference URIs at once')
    .argument('<references...>', 'One or more op:// URIs (e.g. op://vault/item/field)')
    .action(async (references: string[]) => {
      try {
        const results = await ctx.secrets.resolveSecrets(references);
        const successful = results.filter(r => !r.error).length;
        const failed = results.filter(r => r.error).length;
        outputResult(
          {
            fileName: `secret-resolve-many`,
            data: results,
            summary: `Resolved ${successful}/${results.length} secrets${failed > 0 ? ` (${failed} failed)` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'resolve secrets');
      }
    });

  secret
    .command('generate-password')
    .description('Generate a password using the 1Password SDK')
    .option('--type <type>', 'Password type: random | memorable | pin', 'random')
    .option('--length <n>', 'Length for random/pin passwords', '32')
    .option('--word-count <n>', 'Word count for memorable passwords', '4')
    .option('--separator <sep>', 'Separator type for memorable passwords (e.g. Digits)', 'Digits')
    .option('--no-digits', 'Exclude digits (random type)')
    .option('--no-symbols', 'Exclude symbols (random type)')
    .option('--no-capitalize', 'Skip capitalisation (memorable type)')
    .action(async (opts: any) => {
      try {
        const type = opts.type as 'random' | 'memorable' | 'pin';
        let recipe: any;

        if (type === 'random') {
          recipe = {
            type: 'random',
            length: parseInt(opts.length, 10),
            includeDigits: opts.digits !== false,
            includeSymbols: opts.symbols !== false,
          };
        } else if (type === 'memorable') {
          recipe = {
            type: 'memorable',
            wordCount: parseInt(opts.wordCount, 10),
            separator: opts.separator,
            capitalize: opts.capitalize !== false,
          };
        } else {
          recipe = {
            type: 'pin',
            length: parseInt(opts.length, 10),
          };
        }

        const password = await ctx.secrets.generatePassword(recipe);
        outputResult(
          {
            fileName: `generated-password`,
            data: { type, password },
            summary: `Generated ${type} password`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'generate password');
      }
    });
}
