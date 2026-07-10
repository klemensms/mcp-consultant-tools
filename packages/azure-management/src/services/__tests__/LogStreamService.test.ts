import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import type { ArmClient } from '../../client/ArmClient.js';
import type { ScmClient } from '../../utils/scm-client.js';
import {
  LogStreamService,
  buildScmHostName,
  buildLogStreamPath,
  clampDurationSeconds,
  clampMaxLines,
  DEFAULT_STREAM_DURATION_SECONDS,
  MAX_STREAM_DURATION_SECONDS,
  DEFAULT_STREAM_MAX_LINES,
  MAX_STREAM_MAX_LINES,
  EMPTY_STREAM_NOTE,
} from '../LogStreamService.js';

const RESOURCE_GROUP = 'rg-dev-uks-01';
const APP_NAME = 'app-dev-web-uks-01';

function stubArmClient(response: unknown = {}, capture?: { path?: string; params?: unknown }): ArmClient {
  return {
    getDefaultResourceGroup: () => RESOURCE_GROUP,
    resourceGroupPath: (rg: string, path: string) => `/subscriptions/x/resourceGroups/${rg}${path}`,
    get: async (path: string, _apiVersion?: string, params?: Record<string, string>) => {
      if (capture) {
        capture.path = path;
        capture.params = params;
      }
      return response;
    },
    paginate: async () => (response as { value?: unknown[] }).value ?? [],
  } as unknown as ArmClient;
}

function stubScmClient(chunks: string[]): ScmClient {
  return {
    getStream: async () => Readable.from(chunks),
  } as unknown as ScmClient;
}

describe('bounds', () => {
  it('clamps a duration above the ceiling instead of rejecting it', () => {
    expect(clampDurationSeconds(120)).toBe(MAX_STREAM_DURATION_SECONDS);
    expect(clampDurationSeconds(5)).toBe(5);
    expect(clampDurationSeconds(undefined)).toBe(DEFAULT_STREAM_DURATION_SECONDS);
  });

  it('clamps a line count above the ceiling', () => {
    expect(clampMaxLines(2000)).toBe(MAX_STREAM_MAX_LINES);
    expect(clampMaxLines(undefined)).toBe(DEFAULT_STREAM_MAX_LINES);
  });

  it('rejects a non-positive or fractional bound', () => {
    expect(() => clampDurationSeconds(0)).toThrow(/positive integer/);
    expect(() => clampDurationSeconds(1.5)).toThrow(/positive integer/);
    expect(() => clampMaxLines(-1)).toThrow(/positive integer/);
  });

  it('keeps the ceiling low enough not to trip a client tool timeout', () => {
    expect(MAX_STREAM_DURATION_SECONDS).toBeLessThanOrEqual(30);
  });
});

describe('SCM addressing', () => {
  it('joins a slot to the app name with a single hyphen', () => {
    expect(buildScmHostName(APP_NAME, 'staging')).toBe(`${APP_NAME}-staging.scm.azurewebsites.net`);
    expect(buildScmHostName(APP_NAME)).toBe(`${APP_NAME}.scm.azurewebsites.net`);
  });

  it('omits the provider segment for "all"', () => {
    expect(buildLogStreamPath('all')).toBe('/api/logstream');
    expect(buildLogStreamPath('application')).toBe('/api/logstream/application');
    expect(buildLogStreamPath('http')).toBe('/api/logstream/http');
  });
});

describe('getLogStream', () => {
  const service = (chunks: string[]) => new LogStreamService(stubArmClient(), stubScmClient(chunks));

  it('collects whole lines and drops blank ones', async () => {
    const result = await service(['first\n', '\n', 'second\n']).getLogStream({ appName: APP_NAME });
    expect(result.lines).toEqual(['first', 'second']);
    expect(result.summary.terminationReason).toBe('streamEnded');
    expect(result.summary.truncated).toBe(false);
  });

  it('reassembles a line split across chunks', async () => {
    const result = await service(['par', 'tial line\n']).getLogStream({ appName: APP_NAME });
    expect(result.lines).toEqual(['partial line']);
  });

  it('flushes a trailing line that never got a newline', async () => {
    const result = await service(['no trailing newline']).getLogStream({ appName: APP_NAME });
    expect(result.lines).toEqual(['no trailing newline']);
  });

  it('stops at maxLines and reports truncation', async () => {
    const result = await service(['a\nb\nc\nd\n']).getLogStream({ appName: APP_NAME, maxLines: 2 });
    expect(result.lines).toEqual(['a', 'b']);
    expect(result.summary.terminationReason).toBe('maxLines');
    expect(result.summary.truncated).toBe(true);
  });

  it('never exceeds maxLines when flushing the trailing buffer', async () => {
    // The source this was ported from pushed the trailing partial line after the
    // maxLines break, returning maxLines + 1.
    const result = await service(['a\nb\ntrailing']).getLogStream({ appName: APP_NAME, maxLines: 2 });
    expect(result.lines).toHaveLength(2);
  });

  it('stops as soon as the final line of a chunk lands exactly on maxLines', async () => {
    const result = await service(['a\nb\n', 'c\n']).getLogStream({ appName: APP_NAME, maxLines: 2 });
    expect(result.lines).toEqual(['a', 'b']);
    expect(result.summary.terminationReason).toBe('maxLines');
  });

  it('clamps an over-long duration rather than honouring it', async () => {
    const result = await service(['x\n']).getLogStream({ appName: APP_NAME, durationSeconds: 600 });
    expect(result.summary.durationMs).toBeLessThan(MAX_STREAM_DURATION_SECONDS * 1000);
  });

  it('warns that an empty stream is not evidence the app is idle', async () => {
    const result = await service([]).getLogStream({ appName: APP_NAME });
    expect(result.lines).toEqual([]);
    expect(result.note).toBe(EMPTY_STREAM_NOTE);
    expect(result.note).toMatch(/12 hours/);
  });

  it('omits the note when lines were captured', async () => {
    const result = await service(['x\n']).getLogStream({ appName: APP_NAME });
    expect(result.note).toBeUndefined();
  });

  it('reports the slot-qualified endpoint it actually read', async () => {
    const result = await service(['x\n']).getLogStream({ appName: APP_NAME, slotName: 'staging', logType: 'http' });
    expect(result.scmEndpoint).toBe(`https://${APP_NAME}-staging.scm.azurewebsites.net/api/logstream/http`);
  });

  it('propagates a real transport failure instead of returning an empty stream', async () => {
    const failing = {
      getStream: async () => {
        throw new Error('SCM access denied. Ensure the service principal has Website Contributor role.');
      },
    } as unknown as ScmClient;

    await expect(new LogStreamService(stubArmClient(), failing).getLogStream({ appName: APP_NAME })).rejects.toThrow(
      /Website Contributor/
    );
  });
});

describe('getLogConfiguration', () => {
  it('defaults an absent application log level to Off', async () => {
    const service = new LogStreamService(stubArmClient({ properties: {} }), stubScmClient([]));
    const result = await service.getLogConfiguration({ appName: APP_NAME });
    expect(result.applicationLogging.fileSystemLevel).toBe('Off');
    expect(result.httpLogging.fileSystem.enabled).toBe(false);
  });

  it('treats a blob level of Off as disabled', async () => {
    const service = new LogStreamService(
      stubArmClient({ properties: { applicationLogs: { azureBlobStorage: { level: 'Off' } } } }),
      stubScmClient([])
    );
    const result = await service.getLogConfiguration({ appName: APP_NAME });
    expect(result.applicationLogging.azureBlobStorage.enabled).toBe(false);
  });

  it('never returns the blob SAS URL', async () => {
    const service = new LogStreamService(
      stubArmClient({
        properties: {
          applicationLogs: { azureBlobStorage: { level: 'Information', sasUrl: 'https://example.invalid/?sig=SECRET' } },
          httpLogs: { azureBlobStorage: { enabled: true, sasUrl: 'https://example.invalid/?sig=SECRET' } },
        },
      }),
      stubScmClient([])
    );
    const result = await service.getLogConfiguration({ appName: APP_NAME });
    expect(JSON.stringify(result)).not.toContain('sig=');
    expect(result.applicationLogging.azureBlobStorage.enabled).toBe(true);
  });

  it('requires a resource group when none is configured', async () => {
    const noRg = { ...stubArmClient(), getDefaultResourceGroup: () => undefined } as unknown as ArmClient;
    const service = new LogStreamService(noRg, stubScmClient([]));
    await expect(service.getLogConfiguration({ appName: APP_NAME })).rejects.toThrow(/Resource group is required/);
  });
});

describe('detectors', () => {
  it('buckets detectors by category and falls back to Uncategorized', async () => {
    const client = stubArmClient({
      value: [
        { name: 'd1', properties: { metadata: { name: 'Detector One', category: 'Availability' } } },
        { name: 'd2', properties: {} },
      ],
    });
    const service = new LogStreamService(client, stubScmClient([]));
    const result = await service.listDiagnosticDetectors({ appName: APP_NAME });

    expect(result.summary.total).toBe(2);
    expect(result.summary.byCategory).toEqual({ Availability: 1, Uncategorized: 1 });
    expect(result.detectors[1].displayName).toBe('d2');
  });

  it('passes the time range through as query params only when supplied', async () => {
    const capture: { path?: string; params?: unknown } = {};
    const service = new LogStreamService(stubArmClient({ properties: {} }, capture), stubScmClient([]));

    await service.getDiagnosticDetector({ appName: APP_NAME, detectorName: 'availability' });
    expect(capture.params).toEqual({});

    await service.getDiagnosticDetector({
      appName: APP_NAME,
      detectorName: 'availability',
      startTime: '2026-07-10T00:00:00Z',
      endTime: '2026-07-10T06:00:00Z',
    });
    expect(capture.params).toEqual({ startTime: '2026-07-10T00:00:00Z', endTime: '2026-07-10T06:00:00Z' });
  });

  it('targets the detector surface that returns datasets, not the category browser', async () => {
    const capture: { path?: string } = {};
    const service = new LogStreamService(stubArmClient({ properties: {} }, capture), stubScmClient([]));
    await service.getDiagnosticDetector({ appName: APP_NAME, detectorName: 'availability' });
    expect(capture.path).toContain(`/providers/Microsoft.Web/sites/${APP_NAME}/detectors/availability`);
    expect(capture.path).not.toContain('/diagnostics/');
  });

  it('tolerates a numeric or string renderingProperties.type', async () => {
    const service = new LogStreamService(
      stubArmClient({
        properties: {
          dataset: [
            { table: { tableName: 't', columns: [], rows: [] }, renderingProperties: { type: 7 } },
            { table: { tableName: 't2', columns: [], rows: [] }, renderingProperties: { type: 'TimeSeries' } },
          ],
          status: { statusId: 0 },
        },
      }),
      stubScmClient([])
    );
    const result = await service.getDiagnosticDetector({ appName: APP_NAME, detectorName: 'availability' });
    expect(result.dataset[0].renderingProperties?.type).toBe(7);
    expect(result.dataset[1].renderingProperties?.type).toBe('TimeSeries');
  });

  it('substitutes an empty table when a dataset entry has none', async () => {
    const service = new LogStreamService(
      stubArmClient({ properties: { dataset: [{}], status: { statusId: 3, message: 'Unhealthy' } } }),
      stubScmClient([])
    );
    const result = await service.getDiagnosticDetector({ appName: APP_NAME, detectorName: 'availability' });
    expect(result.dataset[0].table).toEqual({ tableName: '', columns: [], rows: [] });
    expect(result.status).toEqual({ statusId: 3, message: 'Unhealthy' });
  });
});
