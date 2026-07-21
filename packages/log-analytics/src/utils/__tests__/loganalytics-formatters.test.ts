import { describe, it, expect } from 'vitest';
import { formatInvestigateAppMarkdown } from '../loganalytics-formatters.js';
import type { InvestigateAppResult } from '../../services/log-analytics-service.js';

const emptyResult = () => ({ tables: [{ name: 'PrimaryResult', columns: [], rows: [] }] });

const table = (columns: string[], rows: any[][]) => ({
  tables: [{
    name: 'PrimaryResult',
    columns: columns.map((name) => ({ name, type: 'string' })),
    rows,
  }],
});

function makeResult(overrides: Partial<InvestigateAppResult> = {}): InvestigateAppResult {
  return {
    appNamePattern: undefined,
    timespan: 'PT1H',
    deduplicate: true,
    exceptionSummary: emptyResult(),
    traceSeverity: emptyResult(),
    recentErrors: emptyResult(),
    includeDetails: true,
    detailsLimit: 20,
    ...overrides,
  };
}

describe('formatInvestigateAppMarkdown', () => {
  it('renders the three sections with tables when there is data', () => {
    const markdown = formatInvestigateAppMarkdown(makeResult({
      appNamePattern: 'func-dev-acme',
      timespan: 'P7D',
      exceptionSummary: table(['ExceptionType', 'UniqueErrors'], [['System.TimeoutException', 4]]),
      traceSeverity: table(['SeverityLevel', 'UniqueTraces'], [[3, 12]]),
      recentErrors: table(['TimeGenerated', 'ExceptionType'], [['2026-07-21T09:00:00Z', 'System.TimeoutException']]),
    }));

    expect(markdown).toContain('# App Investigation Report');
    expect(markdown).toContain('**Filter:** func-dev-acme');
    expect(markdown).toContain('**Time range:** P7D');
    expect(markdown).toContain('**Deduplication:** enabled (grouped by OperationId)');
    expect(markdown).toContain('## Exception Summary');
    expect(markdown).toContain('| System.TimeoutException | 4 |');
    expect(markdown).toContain('## Trace Severity Distribution');
    expect(markdown).toContain('## Recent Errors (20 max)');
  });

  it('falls back to placeholders when a section has no rows', () => {
    const markdown = formatInvestigateAppMarkdown(makeResult());

    expect(markdown).toContain('**Filter:** (all apps)');
    expect(markdown).toContain('*No exceptions found*');
    expect(markdown).toContain('*No traces found*');
    expect(markdown).toContain('*No recent errors*');
  });

  it('omits the recent-errors section when details were excluded', () => {
    const markdown = formatInvestigateAppMarkdown(makeResult({
      includeDetails: false,
      recentErrors: null,
    }));

    expect(markdown).not.toContain('## Recent Errors');
  });

  it('omits the deduplication line when deduplication is disabled', () => {
    const markdown = formatInvestigateAppMarkdown(makeResult({ deduplicate: false }));

    expect(markdown).not.toContain('**Deduplication:**');
  });
});
