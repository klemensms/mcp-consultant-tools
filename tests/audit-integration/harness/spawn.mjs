import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readMcpTestCreds, PP_DATA_BUILD } from './creds.mjs';

const DEFAULT_ENV_BASE = {
  POWERPLATFORM_ENABLE_CREATE: 'true',
  POWERPLATFORM_ENABLE_UPDATE: 'true',
  POWERPLATFORM_ENABLE_DELETE: 'true',
  POWERPLATFORM_ENABLE_ACTIONS: 'true',
};

export async function startPpDataClient({ env: envOverrides = {}, stderr = 'pipe' } = {}) {
  const creds = await readMcpTestCreds();
  const env = {
    ...creds,
    ...DEFAULT_ENV_BASE,
    ...envOverrides,
  };

  const transport = new StdioClientTransport({
    command: 'node',
    args: [PP_DATA_BUILD],
    env,
    stderr,
  });

  const client = new Client(
    { name: 'audit-integration-harness', version: '0.0.0' },
    { capabilities: {} },
  );

  const stderrChunks = [];
  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString('utf8'));
    });
  }

  await client.connect(transport);

  return {
    client,
    transport,
    async close() {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    },
    getStderr() {
      return stderrChunks.join('');
    },
  };
}

export async function spawnAndCaptureExit(envOverrides = {}, timeoutMs = 5000) {
  const { spawn } = await import('node:child_process');
  const creds = await readMcpTestCreds();
  const env = {
    ...process.env,
    ...creds,
    ...DEFAULT_ENV_BASE,
    ...envOverrides,
  };

  return new Promise((resolve, reject) => {
    const child = spawn('node', [PP_DATA_BUILD], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutChunks = [];
    const stderrChunks = [];
    let exited = false;

    child.stdout.on('data', (c) => stdoutChunks.push(c.toString('utf8')));
    child.stderr.on('data', (c) => stderrChunks.push(c.toString('utf8')));

    const timer = setTimeout(() => {
      if (!exited) {
        child.kill('SIGKILL');
        reject(new Error(`spawnAndCaptureExit timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      exited = true;
      clearTimeout(timer);
      resolve({
        exitCode: code,
        signal,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      });
    });

    // Close stdin so the MCP server doesn't wait on input. If it survives the close,
    // it means startup succeeded — we'll let it run until timeout. For refuse-to-start
    // tests, the server exits before this matters.
    child.stdin.end();
  });
}
