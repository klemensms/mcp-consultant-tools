import { startPpDataClient } from '../harness/spawn.mjs';
import { createPiiFixture, deletePiiFixture } from './pii-corpus.mjs';

async function main() {
  const session = await startPpDataClient({
    env: {
      MCP_ENVIRONMENT_TYPE: 'dev',
      PII_PROTECTION: 'false',
      MCP_AUDIT_LEVEL: 'off',
    },
  });

  let fixture;
  try {
    fixture = await createPiiFixture(session.client, 'smoke');
    console.error('[fixture-smoke] created:', fixture.id);
  } catch (err) {
    await session.close();
    throw err;
  }

  try {
    await deletePiiFixture(session.client, fixture);
    console.error('[fixture-smoke] deleted OK');
  } catch (err) {
    console.error('[fixture-smoke] DELETE FAILED — orphan left at', fixture.id);
    await session.close();
    throw err;
  }

  await session.close();
  console.error('[fixture-smoke] PASS');
}

main().catch((err) => {
  console.error('[fixture-smoke] FAIL:', err.message);
  console.error(err.stack);
  process.exit(2);
});
