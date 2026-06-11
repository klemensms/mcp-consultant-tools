import type { LayerReport, PiiConfig } from './types.js';

export interface Layer1Result {
  filteredSelect: string[] | undefined;
  report: LayerReport;
}

/**
 * Layer 1 — Query-Time Field Exclusion.
 *
 * Returns a filtered `$select` list with configured PII fields removed.
 * If the caller supplied no select (i.e. asking for all fields), this layer is a
 * no-op in v1: the data still needs to be retrieved for Layers 2-4 to redact,
 * and computing "all fields except PII" requires per-entity metadata. The
 * v1 contract is that Layer 1 only filters caller-supplied selects.
 *
 * Q5.1 decision: when the caller supplies a select that includes PII fields,
 * we drop them silently (the response footer reports the exclusion). Refusing
 * the query would block legitimate investigations; warning-and-allowing would
 * leak PII back to the LLM.
 */
export function applyLayer1<T extends string[] | undefined>(
  entityName: string,
  userSelect: T,
  config: PiiConfig
): Layer1Result {
  const excluded = new Set(
    config.fieldRules[entityName]?.excludeFromSelect ?? []
  );

  if (!userSelect || userSelect.length === 0 || excluded.size === 0) {
    return {
      filteredSelect: userSelect,
      report: {
        layerId: 'l1',
        redactionCounts: {},
        fieldsAffected: [],
        observeMode: config.observeMode,
      },
    };
  }

  const droppedFields: string[] = [];
  const filtered: string[] = [];
  for (const field of userSelect) {
    if (excluded.has(field)) {
      droppedFields.push(field);
    } else {
      filtered.push(field);
    }
  }

  return {
    filteredSelect: filtered,
    report: {
      layerId: 'l1',
      redactionCounts:
        droppedFields.length > 0 ? { excluded_field: droppedFields.length } : {},
      fieldsAffected: droppedFields.map((f) => `${entityName}.${f}`).sort(),
      observeMode: config.observeMode,
    },
  };
}
