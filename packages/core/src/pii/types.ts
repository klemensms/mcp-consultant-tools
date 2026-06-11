export type EnvironmentType = 'production' | 'uat' | 'dev';

export type LayerId = 'l1' | 'l2' | 'l3' | 'l4';

export interface LayerToggles {
  l1: boolean;
  l2: boolean;
  l3: boolean;
  l4: boolean;
}

export interface EntityFieldRule {
  excludeFromSelect?: string[];
  redactInResponse?: string[];
}

export type FieldRules = Record<string, EntityFieldRule>;

export interface RegexPattern {
  name: string;
  pattern: string;
  tokenType: string;
}

export interface RegexConfig {
  email: boolean;
  phone: boolean;
  dateOfBirth: boolean;
  customPatterns: RegexPattern[];
}

export interface NerConfig {
  scanFields: string[];
  scanOdataAnnotations: boolean;
}

export interface PiiConfig {
  enabled: boolean;
  observeMode: boolean;
  environmentType: EnvironmentType;
  layers: LayerToggles;
  fieldRules: FieldRules;
  regex: RegexConfig;
  ner: NerConfig;
}

export interface LayerReport {
  layerId: LayerId;
  redactionCounts: Record<string, number>;
  fieldsAffected: string[];
  observeMode: boolean;
}

export interface PipelineReport {
  layers: LayerReport[];
  totalRedactions: number;
}

export interface PipelineResult<T> {
  data: T;
  report: PipelineReport;
}
