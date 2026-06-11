import {
  loadPiiConfig,
  type LoadedPiiContext,
} from './config.js';
import { applyLayer1 } from './field-exclusion.js';
import { applyLayer2 } from './field-redaction.js';
import { applyLayer3 } from './regex-redaction.js';
import { applyLayer4 } from './ner-redaction.js';
import type {
  LayerId,
  LayerReport,
  PipelineReport,
  PipelineResult,
} from './types.js';

export class PiiProtectionPipeline {
  readonly #context: LoadedPiiContext;

  constructor(context: LoadedPiiContext) {
    this.#context = context;
  }

  get isEnabled(): boolean {
    return this.#context.config.enabled;
  }

  get isObserveMode(): boolean {
    return this.#context.config.observeMode;
  }

  getExcludedFields(entityName: string): string[] {
    if (!this.#context.config.enabled || !this.#context.config.layers.l1) {
      return [];
    }
    return this.#context.config.fieldRules[entityName]?.excludeFromSelect ?? [];
  }

  applyQueryTimeExclusions(
    entityName: string,
    userSelect: string[] | undefined
  ): { filteredSelect: string[] | undefined; report: LayerReport | null } {
    if (!this.#context.config.enabled || !this.#context.config.layers.l1) {
      return { filteredSelect: userSelect, report: null };
    }
    const r = applyLayer1(entityName, userSelect, this.#context.config);
    return { filteredSelect: r.filteredSelect, report: r.report };
  }

  redactResponse<T>(entityName: string, data: T): PipelineResult<T> {
    if (!this.#context.config.enabled) {
      return { data, report: emptyReport() };
    }

    const reports: LayerReport[] = [];
    const observe = this.#context.config.observeMode;
    let current: T = data;

    if (this.#context.config.layers.l2) {
      const r = applyLayer2(entityName, current, this.#context.config, this.getSalt());
      reports.push(r.report);
      if (!observe) current = r.transformedData;
    }

    if (this.#context.config.layers.l3) {
      const r = applyLayer3(current, this.#context.config, this.getSalt());
      reports.push(r.report);
      if (!observe) current = r.transformedData;
    }

    if (this.#context.config.layers.l4) {
      const r = applyLayer4(current, this.#context.config, this.getSalt());
      reports.push(r.report);
      if (!observe) current = r.transformedData;
    }

    return { data: current, report: combineReports(reports) };
  }

  protected getSalt(): Buffer {
    return this.#context.getSalt();
  }

  protected get config() {
    return this.#context.config;
  }
}

export function emptyReport(): PipelineReport {
  return { layers: [], totalRedactions: 0 };
}

export interface CreatePiiPipelineOptions {
  /**
   * Identifier representing the configured environment (e.g. PowerPlatform
   * org URL/subdomain, Azure DevOps organisation name, SQL server name).
   * When provided AND the pipeline ends up disabled, the loader emits a stderr
   * warning if the identifier doesn't match any recognised non-prod hint —
   * a heuristic safety net for the "consultant copy-pasted a dev config and
   * swapped the URL to prod" failure mode.
   */
  environmentIdentifier?: string;
}

export function createPiiPipelineFromEnv(
  _options?: CreatePiiPipelineOptions
): PiiProtectionPipeline {
  const ctx = loadPiiConfig();
  return new PiiProtectionPipeline(ctx);
}

export function combineReports(reports: LayerReport[]): PipelineReport {
  let total = 0;
  for (const r of reports) {
    for (const count of Object.values(r.redactionCounts)) total += count;
  }
  return { layers: reports, totalRedactions: total };
}

const LAYER_DESCRIPTION: Record<LayerId, string> = {
  l1: 'L1',
  l2: 'L2',
  l3: 'L3',
  l4: 'L4',
};

export function formatSummaryFooter(report: PipelineReport): string {
  if (report.layers.length === 0 || report.totalRedactions === 0) {
    return '[PII protection: nothing redacted]';
  }
  const categoryTotals: Record<string, number> = {};
  const layersUsed = new Set<string>();
  for (const layer of report.layers) {
    layersUsed.add(LAYER_DESCRIPTION[layer.layerId]);
    for (const [category, count] of Object.entries(layer.redactionCounts)) {
      categoryTotals[category] = (categoryTotals[category] ?? 0) + count;
    }
  }
  const categoryParts = Object.entries(categoryTotals)
    .map(([cat, n]) => `${n} ${cat}${n === 1 ? '' : 's'}`)
    .join(' + ');
  const layersList = [...layersUsed].sort().join('/');
  const observeNote = report.layers.some((l) => l.observeMode)
    ? ' (observe-mode — values not changed)'
    : '';
  return `[PII protection: ${categoryParts} redacted by ${layersList}${observeNote}]`;
}
