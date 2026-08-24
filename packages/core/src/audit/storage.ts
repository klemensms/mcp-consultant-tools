import {
  promises as fs,
  existsSync,
  accessSync,
  constants as FsConstants,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuditConfig, ChainState } from './types.js';
import { AuditRefuseToStartError } from './errors.js';

const STATE_FILE = '.chain-state';

export async function readChainState(dir: string): Promise<ChainState | null> {
  try {
    const raw = await fs.readFile(join(dir, STATE_FILE), 'utf8');
    const parsed = JSON.parse(raw) as ChainState;
    if (parsed && parsed.v === 1) return parsed;
    return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeChainState(dir: string, state: ChainState): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const tmp = join(dir, `${STATE_FILE}.${process.pid}-${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(state), 'utf8');
  await fs.rename(tmp, join(dir, STATE_FILE));
}

export async function appendRecordLine(filePath: string, line: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

/**
 * Startup-time storage probes. Throws AuditRefuseToStartError on any failure.
 *   1. Audit storage directory ({basePath}/{client}) must exist (created if
 *      missing) AND be writable by the server process.
 *   2. If a .chain-state file exists in the directory, it must parse as valid
 *      JSON and conform to the ChainState shape (v: 1, lastSeq, lastHash,
 *      currentFile). A corrupted state file is unrecoverable without operator
 *      intervention - the message points at `mcp-audit-cli quarantine`.
 *
 * Callers should invoke this only when audit is enabled (level !== 'off').
 * Sync fs is intentional - startup, not a hot path.
 */
export function probeAuditStorage(config: AuditConfig): void {
  const dir = join(config.basePath, config.client);

  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, FsConstants.W_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
    throw new AuditRefuseToStartError(
      `Audit refused to start: audit storage path '${dir}' is unwritable (${code}). ` +
        `Ensure MCP_AUDIT_PATH points at a directory the server can create + write to.`
    );
  }

  const stateFile = join(dir, STATE_FILE);
  if (!existsSync(stateFile)) return;

  let raw: string;
  try {
    raw = readFileSync(stateFile, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
    throw new AuditRefuseToStartError(
      `Audit refused to start: cannot read chain-state at '${stateFile}' (${code}). ` +
        `Run 'mcp-audit-cli quarantine' on the affected audit file to recover.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AuditRefuseToStartError(
      `Audit refused to start: chain-state at '${stateFile}' contains invalid JSON (${message}). ` +
        `Run 'mcp-audit-cli quarantine' on the affected audit file to recover.`
    );
  }

  if (!isValidChainState(parsed)) {
    throw new AuditRefuseToStartError(
      `Audit refused to start: chain-state at '${stateFile}' is structurally invalid. ` +
        `Expected fields { v: 1, lastSeq, lastHash, currentFile }. ` +
        `Run 'mcp-audit-cli quarantine' on the affected audit file to recover.`
    );
  }
}

function isValidChainState(v: unknown): v is ChainState {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    r.v === 1 &&
    typeof r.lastSeq === 'number' &&
    typeof r.lastHash === 'string' &&
    typeof r.currentFile === 'string'
  );
}
