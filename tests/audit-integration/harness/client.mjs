function unwrapToolResult(result) {
  if (result?.isError) {
    const errText = result.content?.[0]?.text ?? JSON.stringify(result);
    throw new Error(`tool returned error: ${errText}`);
  }
  return result;
}

export function isErrorResult(result) {
  return result?.isError === true;
}

export function resultText(result) {
  const parts = result?.content ?? [];
  return parts
    .filter((p) => p?.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export async function setEngagement(client, workItemIds, reason) {
  const result = await client.callTool({
    name: 'set-audit-engagement',
    arguments: { workItemIds, reason },
  });
  return unwrapToolResult(result);
}

export async function queryRecords(client, args) {
  return client.callTool({ name: 'query-records', arguments: args });
}

export async function countRecords(client, args) {
  return client.callTool({ name: 'count-records', arguments: args });
}

export async function getRecord(client, args) {
  return client.callTool({ name: 'get-record', arguments: args });
}

export async function getEntityMetadata(client, args) {
  return client.callTool({ name: 'get-entity-metadata', arguments: args });
}

export async function getLookupTarget(client, args) {
  return client.callTool({ name: 'get-lookup-target', arguments: args });
}

export async function getFlowRuns(client, args) {
  return client.callTool({ name: 'get-flow-runs', arguments: args });
}

export async function getFlowRunDetails(client, args) {
  return client.callTool({ name: 'get-flow-run-details', arguments: args });
}

export async function createRecord(client, args) {
  return client.callTool({ name: 'create-record', arguments: args });
}

export async function updateRecord(client, args) {
  return client.callTool({ name: 'update-record', arguments: args });
}

export async function deleteRecord(client, args) {
  return client.callTool({ name: 'delete-record', arguments: args });
}

export async function executeAction(client, args) {
  return client.callTool({ name: 'execute-action', arguments: args });
}

export async function associateRecords(client, args) {
  return client.callTool({ name: 'associate-records', arguments: args });
}

export async function disassociateRecords(client, args) {
  return client.callTool({ name: 'disassociate-records', arguments: args });
}

export async function callTool(client, name, args) {
  return client.callTool({ name, arguments: args });
}
