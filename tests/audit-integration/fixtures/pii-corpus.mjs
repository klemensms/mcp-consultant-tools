import { createRecord, deleteRecord, resultText } from '../harness/client.mjs';

/**
 * Known-PII strings used in the contact fixture. Every value carries the
 * `AUDITTEST_` (or `audittest_` for emails) prefix so the leakage sweeper
 * (Task 38) can grep for these literals across audit JSONL output.
 *
 * Email values use the RFC 2606 reserved `.invalid` TLD — guaranteed never
 * to be a real address. Phone values are deliberately fake.
 */
export const KNOWN_PII_STRINGS = {
  firstname: 'AUDITTEST_Maria_FN',
  lastname: 'AUDITTEST_Schmidt_LN',
  yomifirstname: 'AUDITTEST_Yomi_FN',
  yomilastname: 'AUDITTEST_Yomi_LN',
  yomifullname: 'AUDITTEST_Yomi_Full',
  middlename: 'AUDITTEST_Middle',
  emailaddress1: 'audittest_email@example.invalid',
  mobilephone: '+44 7000 AUDIT 01',
  telephone1: '+44 7000 AUDIT 02',
  birthdate: '1990-01-15',
  address1_line1: 'AUDITTEST Address Line 1',
  description:
    'AUDITTEST_Description with embedded email audittest_inner@example.invalid',
};

const RECORD_ID_RE = /\*\*Record ID:\*\*\s*([0-9a-f-]{36})/i;
const JSON_BLOCK_RE = /```json\n([\s\S]+?)\n```/;
const PRIMARY_KEY_BY_ENTITY_SET = {
  contacts: 'contactid',
};

/**
 * Create a contact record on MCPTest with the full known-PII corpus.
 * Returns a fixture descriptor suitable for the runner's ctx.fixtureIds and
 * for the leakage sweeper.
 */
export async function createPiiFixture(client, label) {
  const result = await createRecord(client, {
    entityNamePlural: 'contacts',
    data: KNOWN_PII_STRINGS,
  });
  if (result?.isError) {
    throw new Error(
      `createPiiFixture(${label ?? 'unlabelled'}): create-record failed — ${resultText(result)}`,
    );
  }
  const text = resultText(result);
  const id = extractRecordId(text, 'contacts');
  if (!id) {
    throw new Error(
      `createPiiFixture(${label ?? 'unlabelled'}): could not parse contact ID from response:\n${text}`,
    );
  }
  return {
    id,
    label: label ?? null,
    knownStrings: { ...KNOWN_PII_STRINGS },
    entitySetName: 'contacts',
  };
}

function extractRecordId(text, entitySetName) {
  // Prefer the explicit "Record ID" line when populated, but pp-data sometimes
  // returns "N/A" there for entities whose primary-key parser doesn't match.
  // Fall back to parsing the JSON block.
  const direct = RECORD_ID_RE.exec(text);
  if (direct && direct[1] && !direct[1].toLowerCase().startsWith('n')) {
    return direct[1];
  }
  const block = JSON_BLOCK_RE.exec(text);
  if (!block) return null;
  let body;
  try {
    body = JSON.parse(block[1]);
  } catch {
    return null;
  }
  const keyName = PRIMARY_KEY_BY_ENTITY_SET[entitySetName];
  if (keyName && typeof body[keyName] === 'string') return body[keyName];
  // Last-ditch: any top-level `*id` GUID field.
  for (const [k, v] of Object.entries(body)) {
    if (k.endsWith('id') && typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) {
      return v;
    }
  }
  return null;
}

/**
 * Delete a fixture record. Best-effort: errors are wrapped so callers can
 * still keep going if a stale fixture has already been removed.
 */
export async function deletePiiFixture(client, fixture) {
  if (!fixture?.id) {
    throw new Error('deletePiiFixture: fixture.id is required');
  }
  const result = await deleteRecord(client, {
    entityNamePlural: fixture.entitySetName,
    recordId: fixture.id,
    confirm: true,
  });
  if (result?.isError) {
    throw new Error(
      `deletePiiFixture(${fixture.id}): delete-record failed — ${resultText(result)}`,
    );
  }
  return true;
}
