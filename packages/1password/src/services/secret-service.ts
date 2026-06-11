/**
 * Secret Service — secret resolution and password generation.
 *
 * resolveSecret/resolveSecrets use the authenticated client.
 * generatePassword uses the static Secrets.generatePassword() method.
 */
import { Secrets } from '@1password/sdk';
import type { OnePasswordClient } from '../onepassword-client.js';
import type { PasswordRecipe } from '../models/api-types.js';

export class SecretService {
  private readonly _client: OnePasswordClient;

  constructor(client: OnePasswordClient) {
    this._client = client;
  }

  /**
   * Resolve a single secret reference URI.
   * @param reference e.g. "op://vault-name/item-name/field-name"
   */
  async resolveSecret(reference: string): Promise<string> {
    const client = await this._client.getClient();
    return client.secrets.resolve(reference);
  }

  /**
   * Resolve multiple secret references in one call.
   * Returns per-reference results (success or error).
   */
  async resolveSecrets(references: string[]): Promise<Array<{ reference: string; value?: string; error?: string }>> {
    const client = await this._client.getClient();
    const results: Array<{ reference: string; value?: string; error?: string }> = [];

    for (const ref of references) {
      try {
        const value = await client.secrets.resolve(ref);
        results.push({ reference: ref, value });
      } catch (error: any) {
        results.push({ reference: ref, error: error.message });
      }
    }

    return results;
  }

  /**
   * Generate a password using the SDK's static Secrets.generatePassword() method.
   * @param recipe Discriminated by 'type' field: random | memorable | pin
   */
  async generatePassword(recipe: PasswordRecipe): Promise<string> {
    // Secrets.generatePassword is a static method — no client initialization needed
    if (recipe.type === 'random') {
      const result = Secrets.generatePassword({
        type: 'Random',
        parameters: {
          length: recipe.length ?? 32,
          includeDigits: recipe.includeDigits ?? true,
          includeSymbols: recipe.includeSymbols ?? true,
        },
      } as any);
      return (result as any).password ?? result as any;
    } else if (recipe.type === 'memorable') {
      const result = Secrets.generatePassword({
        type: 'Memorable',
        parameters: {
          wordCount: recipe.wordCount ?? 4,
          separatorType: recipe.separator ?? 'Digits',
          capitalize: recipe.capitalize ?? true,
          wordListType: 'Words',
        },
      } as any);
      return (result as any).password ?? result as any;
    } else {
      // pin
      const result = Secrets.generatePassword({
        type: 'Pin',
        parameters: {
          length: recipe.length ?? 6,
        },
      } as any);
      return (result as any).password ?? result as any;
    }
  }
}
