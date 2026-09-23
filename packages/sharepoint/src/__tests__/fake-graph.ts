/** Records every Graph request a service makes; answers from a path -> response map. */
export interface GraphCall {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  responseType?: string;
}

export function fakeGraph(responses: Record<string, unknown | ((call: GraphCall) => unknown)>) {
  const calls: GraphCall[] = [];
  const answer = (call: GraphCall) => {
    calls.push(call);
    if (!(call.path in responses)) {
      throw Object.assign(new Error(`unexpected ${call.method} ${call.path}`), { statusCode: 404 });
    }
    const r = responses[call.path];
    return typeof r === 'function' ? (r as (c: GraphCall) => unknown)(call) : r;
  };
  const client = {
    api(path: string) {
      let responseType: string | undefined;
      const request: any = {
        select: () => request,
        query: () => request,
        header: () => request,
        responseType: (t: string) => {
          responseType = t;
          return request;
        },
        get: async () => answer({ method: 'GET', path, responseType }),
        post: async (body: unknown) => answer({ method: 'POST', path, body }),
      };
      return request;
    },
  };
  return { client, calls };
}
