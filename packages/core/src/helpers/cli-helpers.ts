/**
 * CLI Helper Utilities
 *
 * Shared helpers for building CLI entry points across all packages.
 * Provides consistent output formatting, caching, env loading, and Commander setup.
 *
 * NOTE: We use `any` for Commander types to avoid cross-package type conflicts
 * when different versions of commander are hoisted. Each package should import
 * `Command` from its own `commander` dependency for type-safe usage.
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config } from 'dotenv';
import { resolveSecrets } from './secret-resolver.js';
import { resolvePackageVersion } from './resolve-version.js';
import { fanOutSuffix, type FanOutInfo } from './fan-out.js';

export interface OutputOptions {
  /** File name (without extension) for the cached JSON */
  fileName: string;
  /** Data to output */
  data: unknown;
  /** Human-readable summary printed to stdout */
  summary: string;
  /** Cache directory name (e.g., '.mcp-ado-cache'), placed under .context/ at the repo root */
  cacheDir: string;
}

export interface GlobalFlags {
  /** Output raw JSON instead of summary */
  json: boolean;
  /** Enable caching (default: true) */
  cache: boolean;
}

/**
 * Read a `fanOut` block off a command's payload, if it carries one.
 *
 * Detected from the payload rather than passed separately, because the whole point of
 * the fan-out contract is that a partial collection cannot look complete - and a
 * second argument the command author has to remember is exactly the thing that gets
 * forgotten on the command where it matters.
 */
function readFanOut(data: unknown): FanOutInfo | null {
  if (typeof data !== 'object' || data === null) return null;
  const fanOut = (data as { fanOut?: unknown }).fanOut;
  if (typeof fanOut !== 'object' || fanOut === null) return null;
  const { attempted, succeeded, failed, failures } = fanOut as Record<string, unknown>;
  if (
    typeof attempted !== 'number' ||
    typeof succeeded !== 'number' ||
    typeof failed !== 'number' ||
    !Array.isArray(failures)
  ) {
    return null;
  }
  return fanOut as FanOutInfo;
}

/**
 * Walk up from `start` looking for a `.git` entry. A worktree and a submodule both carry
 * `.git` as a file rather than a directory, so this tests existence, not type.
 */
function isInsideGitRepo(start: string): boolean {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Output result to stdout and optionally cache to disk.
 *
 * - Default: prints summary to stdout, saves full JSON to `.context/{cacheDir}/`
 * - --json flag: prints full JSON to stdout
 * - --no-cache flag: skips writing cache file
 *
 * A payload carrying a `fanOut` block that lost items also writes a warning to stderr
 * and sets a non-zero exit code, so a batch caller cannot read a partial collection as
 * a successful one. `process.exitCode` rather than `process.exit()`, so the cache write
 * and the stdout flush still complete.
 */
export function outputResult(opts: OutputOptions, flags: GlobalFlags): void {
  const jsonStr = JSON.stringify(opts.data, null, 2);

  if (flags.json) {
    process.stdout.write(jsonStr + '\n');
  } else {
    process.stdout.write(opts.summary + '\n');
  }

  if (flags.cache) {
    try {
      const cwd = process.cwd();
      const cacheDir = resolve(cwd, '.context', opts.cacheDir);
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      const filePath = join(cacheDir, `${opts.fileName}.json`);
      writeFileSync(filePath, jsonStr, 'utf-8');
      // Always on stderr, `--json` included: stderr does not pollute the JSON on stdout,
      // and a caller that is never told the path cannot clean the file up or find it.
      process.stderr.write(`Cached: ${filePath}\n`);
      // The cache is resolved against the working directory by design - it belongs to the
      // repository being worked on. Outside a repository there is nothing for it to belong
      // to, so the file is scattered rather than collected, and that is worth saying.
      if (!isInsideGitRepo(cwd)) {
        process.stderr.write(
          `Warning: ${cwd} is not inside a git repository, so this cache directory is ` +
            `not collected with a project. Payloads can reach several MB; delete ` +
            `${resolve(cwd, '.context')} when done, or pass --no-cache.\n`
        );
      }
    } catch {
      // Silently skip cache on error (e.g., read-only filesystem)
    }
  }

  const fanOut = readFanOut(opts.data);
  if (fanOut && fanOut.failed > 0) {
    process.stderr.write(`${fanOutSuffix(fanOut).trim()}\n`);
    process.exitCode = 1;
  }
}

export interface CliProgramOptions {
  name: string;
  description: string;
  version: string;
}

/**
 * Create a Commander program with standard global options.
 * Returns `any` to avoid cross-package Commander type conflicts.
 *
 * Global options added:
 * - `--json` - Output raw JSON instead of summary
 * - `--no-cache` - Skip writing cache files
 * - `--env-file <path>` - Load environment from a .env file
 * - `--mcp-config <path>` - Load environment from an MCP config file
 * - `--mcp-server <name>` - Server name in MCP config to load env from
 */
export function createCliProgram(opts: CliProgramOptions): any {
  const program = new Command(opts.name)
    .description(opts.description)
    .version(resolvePackageVersion(opts.version))
    .option('--json', 'Output raw JSON instead of summary', false)
    .option('--no-cache', 'Skip writing cache files')
    .option('--env-file <path>', 'Load environment variables from a .env file')
    .option('--mcp-config <path>', 'Load environment from an MCP config file (.mcp.json)')
    .option('--mcp-server <name>', 'Server name in MCP config (defaults to .mcp.json in cwd)');

  // Built-in preAction hook: load env from MCP config before per-package hooks run
  program.hook('preAction', (thisCommand: any) => {
    const cmdOpts = thisCommand.opts();
    const mcpConfig = cmdOpts.mcpConfig;
    const mcpServer = cmdOpts.mcpServer;

    if (mcpConfig || mcpServer) {
      const configPath = mcpConfig || join(process.cwd(), '.mcp.json');
      if (!mcpServer) {
        try {
          const raw = readFileSync(configPath, 'utf-8');
          const parsed = JSON.parse(raw);
          const available = Object.keys(parsed.mcpServers || {}).join(', ');
          process.stderr.write(`Error: --mcp-server required. Available: ${available}\n`);
        } catch {
          process.stderr.write('Error: --mcp-server is required when using --mcp-config\n');
        }
        process.exit(1);
      }
      loadEnvFromMcpConfig(configPath, mcpServer);
    }
  });

  return program;
}

/**
 * Load environment variables from a .env file for CLI usage.
 *
 * Unlike MCP servers (where env vars are injected by the client),
 * CLI tools need to load .env files explicitly.
 *
 * @param envFilePath Optional path to .env file. Defaults to '.env' in cwd.
 */
export function loadEnvForCli(envFilePath?: string): void {
  const path = envFilePath || join(process.cwd(), '.env');
  if (existsSync(path)) {
    config({ path });
  }
}

/**
 * Load environment variables from a .env file and resolve any op:// references
 * via the 1Password CLI. Convenience wrapper for CLI tools.
 *
 * @param envFilePath Optional path to .env file. Defaults to '.env' in cwd.
 */
export async function loadEnvAndResolve(envFilePath?: string): Promise<void> {
  loadEnvForCli(envFilePath);
  await resolveSecrets();
}

/**
 * Load environment variables from an MCP config file (.mcp.json).
 *
 * Reads the config, finds the named server entry, and sets its `env`
 * values on process.env without overwriting existing variables.
 * This lets CLI tools reuse the same credentials as MCP servers.
 */
export function loadEnvFromMcpConfig(configPath: string, serverName: string): void {
  if (!existsSync(configPath)) {
    throw new Error(`MCP config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in MCP config file: ${configPath}`);
  }

  const servers = parsed.mcpServers;
  if (!servers) {
    throw new Error(`No "mcpServers" key found in ${configPath}`);
  }

  const server = servers[serverName];
  if (!server) {
    const available = Object.keys(servers).join(', ');
    throw new Error(`Server "${serverName}" not found in ${configPath}. Available: ${available}`);
  }

  const env = server.env;
  if (!env || typeof env !== 'object') {
    throw new Error(`Server "${serverName}" has no "env" configuration`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  }
}

/**
 * Extract global flags from a Commander program's parsed options.
 * Accepts `any` to avoid cross-package Commander type conflicts.
 */
export function getGlobalFlags(program: any): GlobalFlags {
  const opts = program.opts();
  return {
    json: opts.json ?? false,
    cache: opts.cache ?? true,
  };
}

/**
 * Standard error handler for CLI commands.
 * Prints error message to stderr and exits with code 1.
 */
export function handleCliError(error: unknown, operation: string): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error during ${operation}: ${message}\n`);
  process.exit(1);
}

/**
 * Detect whether argv is a help, version, or no-args invocation.
 *
 * Used by CLI entry points to decide whether to skip eager service-context
 * construction (which can refuse-to-start when env vars are missing). In help
 * or version mode the user just wants to see what the CLI exposes, not run a
 * subcommand - so paying the cost of full PII/audit env validation is wrong.
 */
export function isHelpVersionOrNoArgs(argv?: readonly string[]): boolean {
  const a = (argv ?? process.argv).slice(2);
  if (a.length === 0) return true;
  return a.some((x) => x === '--help' || x === '-h' || x === '--version' || x === '-V');
}

/**
 * Read a `--flag value` pair out of argv directly.
 *
 * We cannot use Commander's `program.opts()` at module-load because
 * `parseAsync` hasn't run yet. We need the flag values *before* the service
 * context is constructed, so we parse argv ourselves.
 */
function readArgvFlag(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0 || i === argv.length - 1) return undefined;
  return argv[i + 1];
}

/**
 * Stderr nag - fires when the CLI was invoked without `--mcp-server` AND
 * none of the relevant PII / audit env vars are set explicitly. Catches the
 * "agent shelled out to a CLI naked" case without nagging users who have
 * deliberately set env vars in their shell or used the bridge.
 *
 * Non-blocking: prints to stderr and returns. The loader's refuse-to-start
 * (or successful run with explicit env) decides whether the process actually
 * proceeds.
 */
export function warnIfPiiBridgeMissing(
  programName: string,
  flags?: { bridgeUsed?: boolean }
): void {
  if (flags?.bridgeUsed) return;
  const hasExplicit =
    process.env.PII_PROTECTION   !== undefined ||
    process.env.PII_CONFIG_PATH  !== undefined ||
    process.env.MCP_AUDIT_LEVEL  !== undefined;
  if (hasExplicit) return;

  process.stderr.write(
    `[${programName}] WARNING: invoked without --mcp-server and no PII / audit env vars set.\n` +
    `  If your client has an .mcp.json with this server configured, run with:\n` +
    `    ${programName} --mcp-config <path-to-.mcp.json> --mcp-server <server-name> ...\n` +
    `  to inherit PII protection, audit settings, and credentials from the MCP entry.\n` +
    `  Otherwise the CLI will refuse to start (production) or run without protection.\n`
  );
}

export interface BootstrapCliEnvOptions {
  /** CLI binary name, used in the nag message. */
  programName: string;
  /** Override argv for testing. Defaults to process.argv. */
  argv?: readonly string[];
}

export interface BootstrapCliEnvResult {
  /**
   * True when argv is a help/version/no-args invocation. Callers should skip
   * service-context construction in this case (pass a stub or proxy to
   * command-registration helpers) so help/version output works without
   * triggering PII/audit refuse-to-start.
   */
  skipContextInit: boolean;
}

/**
 * Bootstrap CLI environment at module-load, BEFORE service-context construction.
 *
 * Order of operations:
 *   1. If argv is help/version/no-args → skip everything, return early.
 *   2. If `--mcp-config` / `--mcp-server` are present in argv → load env from
 *      the named server entry into process.env.
 *   3. Load `.env` (or the file passed via `--env-file`).
 *   4. Resolve any `op://` 1Password references in the loaded env.
 *   5. Emit the naked-invocation nag on stderr if no bridge was used and no
 *      explicit PII / audit env vars are set.
 *
 * Designed to run BEFORE `createServiceContext()` so that PII / audit loaders
 * see a fully-populated process.env. Replaces the previous Commander-preAction
 * approach, which fired too late (after module-load).
 *
 * The existing `--mcp-config` / `--mcp-server` preAction inside `createCliProgram`
 * is intentionally retained as a belt-and-braces safety net for callers that
 * forget to call `bootstrapCliEnv`. Calling `loadEnvFromMcpConfig` twice is
 * harmless because it only sets undefined keys.
 */
export async function bootstrapCliEnv(
  opts: BootstrapCliEnvOptions
): Promise<BootstrapCliEnvResult> {
  const argv = opts.argv ?? process.argv;

  if (isHelpVersionOrNoArgs(argv)) {
    return { skipContextInit: true };
  }

  const mcpServer = readArgvFlag(argv, '--mcp-server');
  const mcpConfig = readArgvFlag(argv, '--mcp-config');
  const envFile   = readArgvFlag(argv, '--env-file');

  if (mcpServer || mcpConfig) {
    const path = mcpConfig ?? join(process.cwd(), '.mcp.json');
    if (!mcpServer) {
      try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(raw);
        const available = Object.keys(parsed.mcpServers ?? {}).join(', ');
        process.stderr.write(`Error: --mcp-server required. Available: ${available}\n`);
      } catch {
        process.stderr.write('Error: --mcp-server is required when using --mcp-config\n');
      }
      process.exit(1);
    }
    loadEnvFromMcpConfig(path, mcpServer);
  }

  loadEnvForCli(envFile);
  await resolveSecrets();

  warnIfPiiBridgeMissing(opts.programName, { bridgeUsed: !!mcpServer });

  return { skipContextInit: false };
}
