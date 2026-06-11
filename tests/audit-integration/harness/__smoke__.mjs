import { startPpDataClient } from './spawn.mjs';
import { queryRecords } from './client.mjs';

async function main() {
  console.error('[smoke] starting pp-data with audit=off…');
  const session = await startPpDataClient({
    env: {
      MCP_ENVIRONMENT_TYPE: 'dev',
      PII_PROTECTION: 'false',
      MCP_AUDIT_LEVEL: 'off',
    },
    stderr: 'pipe',
  });

  try {
    console.error('[smoke] query 1 contact…');
    const result = await queryRecords(session.client, {
      entityNamePlural: 'contacts',
      filter: 'firstname ne null',
      maxRecords: 1,
    });

    if (result?.isError) {
      console.error('[smoke] FAIL — tool returned error');
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    console.error('[smoke] OK — got tool result with', (result.content ?? []).length, 'content parts');
  } finally {
    await session.close();
  }

  console.error('[smoke] PASS');
}

main().catch((err) => {
  console.error('[smoke] FAIL:', err.message);
  console.error(err.stack);
  process.exit(2);
});
