/**
 * Formatting utilities for best practices validation reports
 * Transforms validation results into human-readable markdown reports
 */

import type { BestPracticesValidationResult, EntityValidationResult, Violation } from '../PowerPlatformService.js';

/**
 * Format complete best practices validation report as markdown
 */
export function formatBestPracticesReport(result: BestPracticesValidationResult): string {
  const sections: string[] = [];

  // Header
  sections.push('# Dataverse Best Practice Validation Report\n');

  if (result.metadata.solutionName) {
    sections.push(`**Solution**: ${result.metadata.solutionName} (\`${result.metadata.solutionUniqueName}\`)`);
  } else {
    sections.push(`**Entities**: Custom entity validation`);
  }

  sections.push(`**Generated**: ${new Date(result.metadata.generatedAt).toLocaleString()}`);
  sections.push(`**Publisher Prefix**: \`${result.metadata.publisherPrefix}\``);
  sections.push(`**Time Filter**: Columns created in last ${result.metadata.recentDays} days`);
  sections.push('');
  sections.push('---\n');

  // Summary
  sections.push('## Summary\n');
  sections.push('| Metric | Count |');
  sections.push('|--------|-------|');
  sections.push(`| Entities Checked | ${result.summary.entitiesChecked} |`);
  sections.push(`| Attributes Checked | ${result.summary.attributesChecked} |`);
  sections.push(`| **Total Violations** | **${result.summary.totalViolations}** |`);
  sections.push(`| Critical (MUST) | ${result.summary.criticalViolations} |`);
  sections.push(`| Warnings (SHOULD) | ${result.summary.warnings} |`);
  sections.push(`| Compliant Entities | ${result.summary.compliantEntities} |`);
  sections.push('');

  if (result.summary.totalViolations > 0) {
    sections.push('**Overall Status**: ⚠️ Issues Found\n');
  } else {
    sections.push('**Overall Status**: ✅ All Compliant\n');
  }

  sections.push('---\n');

  // Violations Summary - Complete Lists of Affected Items
  if (result.summary.totalViolations > 0) {
    sections.push('## 📋 Violations Summary (Complete Lists)\n');
    sections.push('_This section provides complete lists of ALL affected tables and columns grouped by violation type._\n');

    // Use pre-computed violations summary from the result
    for (const ruleSummary of result.violationsSummary) {
      const severityIcon = ruleSummary.severity === 'MUST' ? '🔴' : '⚠️';

      sections.push(`### ${severityIcon} ${ruleSummary.rule} (${ruleSummary.severity})\n`);
      sections.push(`**Affected Items**: ${ruleSummary.totalCount}\n`);

      // Show affected tables (entity-level violations)
      if (ruleSummary.affectedEntities.length > 0) {
        sections.push(`**Affected Tables**:`);
        const tableList = ruleSummary.affectedEntities.map(e => `\`${e}\``).join(', ');
        sections.push(tableList);
        sections.push('');
      }

      // Show affected columns (column-level violations)
      if (ruleSummary.affectedColumns.length > 0) {
        sections.push(`**Affected Columns**:`);
        const columnList = ruleSummary.affectedColumns.map(c => `\`${c}\``).join(', ');
        sections.push(columnList);
        sections.push('');
      }

      // Add recommended action and recommendation
      sections.push(`**Recommended Action**: ${ruleSummary.action}`);
      if (ruleSummary.recommendation) {
        sections.push(`**Why**: ${ruleSummary.recommendation}`);
      }
      sections.push('');
    }

    sections.push('---\n');
  }

  // Critical Violations (MUST Fix)
  if (result.summary.criticalViolations > 0) {
    sections.push('## 🔴 Critical Violations (MUST Fix)\n');

    for (const entity of result.entities) {
      const criticalViolations = entity.violations.filter(v => v.severity === 'MUST');

      if (criticalViolations.length > 0) {
        sections.push(`### Entity: ${entity.displayName} (\`${entity.logicalName}\`)\n`);

        for (const violation of criticalViolations) {
          if (violation.attributeLogicalName) {
            sections.push(`#### Column: ${violation.attributeLogicalName}${violation.createdOn ? ` (Created: ${new Date(violation.createdOn).toLocaleDateString()})` : ''}\n`);
          } else {
            sections.push(`#### Entity-Level Issue\n`);
          }

          sections.push(`- **Rule**: ${violation.rule}`);
          sections.push(`- **Issue**: ${violation.message}`);
          sections.push(`- **Current**: \`${violation.currentValue}\``);
          sections.push(`- **Expected**: \`${violation.expectedValue}\``);
          sections.push(`- **Action**: ${violation.action}`);

          if (violation.recommendation) {
            sections.push(`- **Recommendation**: ${violation.recommendation}`);
          }

          sections.push('');
        }
      }
    }

    sections.push('---\n');
  }

  // Warnings (SHOULD Fix)
  if (result.summary.warnings > 0) {
    sections.push('## ⚠️ Warnings (SHOULD Fix)\n');

    for (const entity of result.entities) {
      const warnings = entity.violations.filter(v => v.severity === 'SHOULD');

      if (warnings.length > 0) {
        sections.push(`### Entity: ${entity.displayName} (\`${entity.logicalName}\`)\n`);

        for (const violation of warnings) {
          if (violation.attributeLogicalName) {
            sections.push(`#### Column: ${violation.attributeLogicalName}${violation.createdOn ? ` (Created: ${new Date(violation.createdOn).toLocaleDateString()})` : ''}\n`);
          } else {
            sections.push(`#### Entity-Level Issue\n`);
          }

          sections.push(`- **Rule**: ${violation.rule}`);
          sections.push(`- **Issue**: ${violation.message}`);
          sections.push(`- **Current**: \`${violation.currentValue}\``);
          sections.push(`- **Expected**: \`${violation.expectedValue}\``);
          sections.push(`- **Recommendation**: ${violation.recommendation || violation.action}`);
          sections.push('');
        }
      }
    }

    sections.push('---\n');
  }

  // Compliant Entities
  sections.push('## ✅ Compliant Entities\n');

  const compliantEntities = result.entities.filter(e => e.isCompliant);

  if (compliantEntities.length > 0) {
    sections.push('The following entities have no violations:\n');

    for (const entity of compliantEntities) {
      sections.push(`- **${entity.displayName}** (\`${entity.logicalName}\`) - ${entity.attributesChecked} columns checked${entity.isRefData ? ' (RefData table)' : ''}`);
    }
    sections.push('');
  } else {
    sections.push('No fully compliant entities found.\n');
  }

  sections.push('---\n');

  // Exclusions and Statistics
  sections.push('## Exclusions\n');
  sections.push(`- System columns excluded: ${result.statistics.systemColumnsExcluded}`);
  sections.push(`- Columns older than ${result.metadata.recentDays} days: ${result.statistics.oldColumnsExcluded}`);
  sections.push(`- RefData tables (updatedbyprocess check skipped): ${result.statistics.refDataTablesSkipped}`);
  sections.push('');
  sections.push('---\n');

  // Footer
  sections.push(`**Execution Time**: ${result.metadata.executionTimeMs}ms`);

  return sections.join('\n');
}

/**
 * Format violations grouped by severity
 */
export function formatViolationsBySeverity(violations: Violation[]): string {
  const sections: string[] = [];

  const critical = violations.filter(v => v.severity === 'MUST');
  const warnings = violations.filter(v => v.severity === 'SHOULD');

  sections.push(`### Violations by Severity\n`);
  sections.push(`- **Critical (MUST)**: ${critical.length}`);
  sections.push(`- **Warnings (SHOULD)**: ${warnings.length}`);
  sections.push(`- **Total**: ${violations.length}\n`);

  if (critical.length > 0) {
    sections.push('#### Critical Issues\n');
    for (const violation of critical) {
      sections.push(`- ${violation.rule}: ${violation.message}`);
    }
    sections.push('');
  }

  if (warnings.length > 0) {
    sections.push('#### Warnings\n');
    for (const violation of warnings) {
      sections.push(`- ${violation.rule}: ${violation.message}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Format compliant entities list
 */
export function formatCompliantEntities(entities: EntityValidationResult[]): string {
  const sections: string[] = [];

  const compliant = entities.filter(e => e.isCompliant);

  sections.push('### Compliant Entities\n');

  if (compliant.length > 0) {
    for (const entity of compliant) {
      sections.push(`- **${entity.displayName}** (\`${entity.logicalName}\`)`);
      sections.push(`  - Attributes checked: ${entity.attributesChecked}`);
      sections.push(`  - Status: ✅ No violations`);
      if (entity.isRefData) {
        sections.push(`  - Type: RefData table`);
      }
      sections.push('');
    }
  } else {
    sections.push('No compliant entities found.');
  }

  return sections.join('\n');
}

/**
 * Format execution statistics
 */
export function formatExecutionStats(result: BestPracticesValidationResult): string {
  const sections: string[] = [];

  sections.push('### Execution Statistics\n');
  sections.push('| Metric | Value |');
  sections.push('|--------|-------|');
  sections.push(`| Execution Time | ${result.metadata.executionTimeMs}ms |`);
  sections.push(`| Entities Processed | ${result.summary.entitiesChecked} |`);
  sections.push(`| Attributes Analyzed | ${result.summary.attributesChecked} |`);
  sections.push(`| System Columns Excluded | ${result.statistics.systemColumnsExcluded} |`);
  sections.push(`| Old Columns Excluded | ${result.statistics.oldColumnsExcluded} |`);
  sections.push(`| RefData Tables | ${result.statistics.refDataTablesSkipped} |`);
  sections.push('');

  // Performance metrics
  if (result.summary.entitiesChecked > 0) {
    const avgTimePerEntity = Math.round(result.metadata.executionTimeMs / result.summary.entitiesChecked);
    sections.push(`**Average time per entity**: ${avgTimePerEntity}ms`);
  }

  if (result.summary.attributesChecked > 0) {
    const avgTimePerAttribute = Math.round(result.metadata.executionTimeMs / result.summary.attributesChecked);
    sections.push(`**Average time per attribute**: ${avgTimePerAttribute}ms`);
  }

  return sections.join('\n');
}

/**
 * Generate quick summary for CLI output
 */
export function formatQuickSummary(result: BestPracticesValidationResult): string {
  const lines: string[] = [];

  lines.push(`Validation Complete: ${result.summary.entitiesChecked} entities checked`);
  lines.push(`Total Violations: ${result.summary.totalViolations} (${result.summary.criticalViolations} critical, ${result.summary.warnings} warnings)`);
  lines.push(`Compliant Entities: ${result.summary.compliantEntities}/${result.summary.entitiesChecked}`);
  lines.push(`Execution Time: ${result.metadata.executionTimeMs}ms`);

  return lines.join('\n');
}

