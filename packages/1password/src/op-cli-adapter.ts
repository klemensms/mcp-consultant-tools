/**
 * CLI backend for 1Password - wraps `op` CLI commands.
 *
 * Used when OP_SERVICE_ACCOUNT_TOKEN is not set and the user has
 * "Integrate with 1Password CLI" enabled in the 1Password desktop app.
 *
 * Implements the same method surface as @1password/sdk Client so services
 * can use either backend transparently.
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Find the `op` binary path. Checks common install locations
 * because MCP server subprocesses may not inherit the user's full PATH.
 */
async function findOpBinary(): Promise<string> {
  const candidates = [
    'op',
    '/opt/homebrew/bin/op',
    '/usr/local/bin/op',
    '/usr/bin/op',
  ];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['--version']);
      return candidate;
    } catch {
      // Not found at this path, try next
    }
  }
  throw new Error(
    '1Password CLI (op) not found. Install it:\n' +
    '  brew install --cask 1password-cli\n' +
    'Then enable "Integrate with 1Password CLI" in 1Password Settings > Developer.'
  );
}

/**
 * Normalize vault objects from CLI format to SDK format.
 * CLI returns { name: "..." }, SDK returns { title: "..." }.
 */
function normalizeVault(vault: any): any {
  if (vault && vault.name !== undefined && vault.title === undefined) {
    vault.title = vault.name;
  }
  return vault;
}

/**
 * Execute a command with stdin piping support.
 * promisify(execFile) doesn't reliably deliver stdin input,
 * so we use spawn with manual stdin writing when input is needed.
 */
function execWithStdin(
  command: string,
  args: string[],
  input: string,
  maxBuffer = 10 * 1024 * 1024
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let totalSize = 0;

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    child.stdout.on('data', (data: Buffer) => {
      totalSize += data.length;
      if (totalSize > maxBuffer) {
        child.kill();
        reject(new Error('stdout maxBuffer exceeded'));
        return;
      }
      chunks.push(data);
    });

    child.stderr.on('data', (data: Buffer) => {
      errChunks.push(data);
    });

    child.on('error', reject);

    child.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf-8');
      const stderr = Buffer.concat(errChunks).toString('utf-8');
      if (code !== 0) {
        const err = new Error(`op exited with code ${code}: ${stderr}`) as any;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export class OpCliBackend {
  private _opPath: string | null = null;
  private readonly _account?: string;

  constructor(account?: string) {
    this._account = account;
  }

  private async getOpPath(): Promise<string> {
    if (!this._opPath) {
      this._opPath = await findOpBinary();
    }
    return this._opPath;
  }

  /**
   * Execute an `op` command and return parsed JSON output.
   * Adds --format json when expectJson is true (default).
   * Adds --account when configured.
   */
  private async execOp(
    args: string[],
    options?: { input?: string; expectJson?: boolean }
  ): Promise<any> {
    const opPath = await this.getOpPath();
    const fullArgs = [...args];
    if (options?.expectJson !== false) {
      fullArgs.push('--format', 'json');
    }
    if (this._account) {
      fullArgs.push('--account', this._account);
    }

    try {
      let stdout: string;
      let stderr: string;

      if (options?.input) {
        // Use spawn-based exec for stdin piping
        ({ stdout, stderr } = await execWithStdin(opPath, fullArgs, options.input));
      } else {
        ({ stdout, stderr } = await execFileAsync(opPath, fullArgs, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env },
        }));
      }

      if (!stdout.trim()) return undefined;
      if (options?.expectJson === false) return stdout.trim();

      try {
        return JSON.parse(stdout);
      } catch {
        return stdout.trim();
      }
    } catch (error: any) {
      const message = error.stderr || error.message || String(error);
      if (message.includes('not signed in') || message.includes('sign in')) {
        throw new Error(
          '1Password CLI is not authenticated. Ensure:\n' +
          '1. 1Password desktop app is running and unlocked\n' +
          '2. "Integrate with 1Password CLI" is enabled in Settings > Developer'
        );
      }
      throw new Error(`op CLI error: ${message}`);
    }
  }

  /** Vaults namespace - matches sdk.Client.vaults interface */
  readonly vaults = {
    list: async (): Promise<any[]> => {
      const result = await this.execOp(['vault', 'list']);
      return (result || []).map(normalizeVault);
    },

    get: async (vaultId: string, _params?: { accessors?: boolean }): Promise<any> => {
      const result = await this.execOp(['vault', 'get', vaultId]);
      return normalizeVault(result);
      // Note: CLI doesn't have a direct --accessors flag.
      // Accessor info requires separate `op vault group list` calls.
    },

    create: async (params: { title: string; description?: string }): Promise<any> => {
      const args = ['vault', 'create', params.title];
      if (params.description) args.push('--description', params.description);
      const result = await this.execOp(args);
      return normalizeVault(result);
    },

    update: async (vaultId: string, params: { title?: string; description?: string }): Promise<any> => {
      const args = ['vault', 'edit', vaultId];
      if (params.title) args.push('--name', params.title);
      if (params.description) args.push('--description', params.description);
      // vault edit doesn't return JSON, just succeeds or errors
      await this.execOp(args, { expectJson: false });
      // Fetch and return the updated vault
      return this.vaults.get(vaultId);
    },

    delete: async (vaultId: string): Promise<void> => {
      // No --force flag in op CLI v2; non-interactive (no TTY) = no prompt
      await this.execOp(['vault', 'delete', vaultId], { expectJson: false });
    },

    grantGroupPermissions: async (
      vaultId: string,
      grants: Array<{ groupId: string; permissions: number }>
    ): Promise<void> => {
      for (const grant of grants) {
        const permNames = bitmaskToCliPermissions(grant.permissions);
        await this.execOp(
          ['vault', 'group', 'grant', '--vault', vaultId, '--group', grant.groupId,
           '--permissions', permNames.join(',')],
          { expectJson: false }
        );
      }
    },

    updateGroupPermissions: async (
      updates: Array<{ vaultId: string; groupId: string; permissions: number }>
    ): Promise<void> => {
      // CLI uses grant to set/overwrite permissions
      for (const update of updates) {
        const permNames = bitmaskToCliPermissions(update.permissions);
        await this.execOp(
          ['vault', 'group', 'grant', '--vault', update.vaultId, '--group', update.groupId,
           '--permissions', permNames.join(',')],
          { expectJson: false }
        );
      }
    },

    revokeGroupPermissions: async (vaultId: string, groupId: string): Promise<void> => {
      await this.execOp(
        ['vault', 'group', 'revoke', '--vault', vaultId, '--group', groupId],
        { expectJson: false }
      );
    },
  };

  /** Items namespace - matches sdk.Client.items interface */
  readonly items = {
    list: async (vaultId: string): Promise<any[]> => {
      return (await this.execOp(['item', 'list', '--vault', vaultId])) || [];
    },

    get: async (vaultId: string, itemId: string): Promise<any> => {
      return this.execOp(['item', 'get', itemId, '--vault', vaultId]);
    },

    getAll: async (vaultId: string, itemIds: string[]): Promise<any> => {
      // CLI doesn't have batch get - run sequentially
      const results: any[] = [];
      const errors: any[] = [];
      for (const id of itemIds) {
        try {
          const item = await this.items.get(vaultId, id);
          results.push(item);
        } catch (error: any) {
          errors.push({ itemId: id, error: error.message });
        }
      }
      return { items: results, errors };
    },

    create: async (params: any): Promise<any> => {
      // Use JSON template via stdin for full field support
      const template = JSON.stringify(params);
      const args = ['item', 'create', '--template', '-'];
      if (params.vaultId) {
        args.push('--vault', params.vaultId);
      }
      return this.execOp(args, { input: template });
    },

    put: async (item: any): Promise<any> => {
      // "put" = update full item. Pipe JSON template via stdin.
      const vaultId = item.vault?.id || item.vaultId;
      const itemId = item.id;
      if (!itemId) throw new Error('Item must have an id for put()');

      const template = JSON.stringify(item);
      const args = ['item', 'edit', itemId, '--template', '-'];
      if (vaultId) args.push('--vault', vaultId);
      return this.execOp(args, { input: template });
    },

    delete: async (vaultId: string, itemId: string): Promise<void> => {
      // No --force in op CLI v2; non-interactive (no TTY) = no prompt
      await this.execOp(
        ['item', 'delete', itemId, '--vault', vaultId],
        { expectJson: false }
      );
    },

    deleteAll: async (vaultId: string, itemIds: string[]): Promise<void> => {
      // CLI doesn't have batch delete - run sequentially
      for (const id of itemIds) {
        await this.items.delete(vaultId, id);
      }
    },

    archive: async (vaultId: string, itemId: string): Promise<void> => {
      await this.execOp(
        ['item', 'delete', itemId, '--vault', vaultId, '--archive'],
        { expectJson: false }
      );
    },

    createAll: async (vaultId: string, items: any[]): Promise<any> => {
      // CLI doesn't have batch create - run sequentially
      const results: any[] = [];
      const errors: any[] = [];
      for (const item of items) {
        try {
          const created = await this.items.create({ ...item, vaultId });
          results.push(created);
        } catch (error: any) {
          errors.push({ item: item.title || 'unknown', error: error.message });
        }
      }
      return { items: results, errors };
    },
  };

  /** Secrets namespace - matches sdk.Client.secrets interface */
  readonly secrets = {
    resolve: async (reference: string): Promise<string> => {
      // op read returns the raw secret value (not JSON)
      return this.execOp(['read', reference], { expectJson: false }) as Promise<string>;
    },
  };
}

/**
 * Reverse-map bitmask to op CLI v2 permission names.
 * CLI v2 uses: allow_viewing, allow_editing, allow_managing
 */
function bitmaskToCliPermissions(bitmask: number): string[] {
  const names: string[] = [];
  // read (1) → allow_viewing
  if (bitmask & 1) names.push('allow_viewing');
  // create (2), update (4) → allow_editing
  if (bitmask & 2 || bitmask & 4) names.push('allow_editing');
  // delete (8), share (16), manage (32) → allow_managing
  if (bitmask & 8 || bitmask & 16 || bitmask & 32) names.push('allow_managing');
  // Deduplicate
  return [...new Set(names)];
}
