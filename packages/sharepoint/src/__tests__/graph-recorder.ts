/**
 * A real Graph client whose transport is replaced by a recorder, so tests
 * assert on the request that would go on the wire (path, decoded query
 * options, headers, body) rather than on which fluent methods were called.
 * That is what lets a test pin an ABSENCE, such as no $orderby beside $search.
 */
import { Client } from '@microsoft/microsoft-graph-client';

export interface RecordedRequest {
  method: string;
  /** Path without the /v1.0 prefix, still percent-encoded. */
  path: string;
  /** Decoded query options, e.g. { $top: '20', $search: '"budget"' }. */
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: any;
}

const FAKE = Symbol('fake-response');

/** A response with a status. A plain object returned by respond() is a 200 JSON body. */
export interface FakeResponse {
  [FAKE]: true;
  status: number;
  body?: unknown;
}

export function fakeResponse(status: number, body?: unknown): FakeResponse {
  return { [FAKE]: true, status, body };
}

function isFake(value: unknown): value is FakeResponse {
  return typeof value === 'object' && value !== null && FAKE in value;
}

export function recordingGraph(respond: (request: RecordedRequest) => FakeResponse | unknown) {
  const requests: RecordedRequest[] = [];

  const middleware = {
    async execute(context: any): Promise<void> {
      const url = new URL(typeof context.request === 'string' ? context.request : context.request.url);
      const options = context.options ?? {};
      const headers: Record<string, string> = {};
      new Headers(options.headers ?? {}).forEach((value, key) => {
        headers[key] = value;
      });
      const recorded: RecordedRequest = {
        method: (options.method ?? 'GET').toUpperCase(),
        path: url.pathname.replace(/^\/v1\.0/, ''),
        query: Object.fromEntries(url.searchParams.entries()),
        headers,
        body: typeof options.body === 'string' ? JSON.parse(options.body) : options.body,
      };
      requests.push(recorded);

      const answer = respond(recorded);
      const status = isFake(answer) ? answer.status : 200;
      const body = isFake(answer) ? answer.body : answer;

      context.response = status === 204 || body === undefined
        ? new Response(null, { status: status === 200 ? 204 : status })
        : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    },
  };

  const client = Client.initWithMiddleware({ middleware: middleware as any });
  return { client, requests };
}

/** A Graph error body, as Graph returns it for a failed request. */
export function graphError(status: number, code: string, message: string): FakeResponse {
  return fakeResponse(status, { error: { code, message } });
}
