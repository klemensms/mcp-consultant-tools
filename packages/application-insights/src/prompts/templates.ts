import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { formatTableAsMarkdown, analyzeExceptions, analyzePerformance, analyzeDependencies } from '../utils/appinsights-formatters.js';

export function registerAppInsightsPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "ai-exception-summary",
    "Generate a comprehensive exception summary report from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        // Get recent exceptions
        const exceptionsResult = await ctx.appInsights.getRecentExceptions(resourceId, timespanValue, 50);

        // Get exception type frequency
        const exceptionTypesResult = await ctx.appInsights.executeQuery(
          resourceId,
          `
            exceptions
            | where timestamp > ago(${timespanValue.replace(/^P(T)?/, '')})
            | summarize Count=count() by type
            | order by Count desc
          `.trim(),
          timespanValue
        );

        // Format results
        const exceptionsList = formatTableAsMarkdown(exceptionsResult.tables[0]);
        const exceptionTypes = formatTableAsMarkdown(exceptionTypesResult.tables[0]);
        const insights = analyzeExceptions(exceptionsResult.tables[0]);

        const report = `# Application Insights Exception Summary Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Key Insights\n\n${insights}\n\n` +
          `## Recent Exceptions\n\n${exceptionsList}\n\n` +
          `## Exception Types (Frequency)\n\n${exceptionTypes}\n\n` +
          `## Recommendations\n\n` +
          `- Review the most frequent exception types to identify systemic issues\n` +
          `- Investigate exceptions in critical operations first\n` +
          `- Check for patterns in timestamps (e.g., deployment times, peak traffic)\n` +
          `- Use operation_Id to correlate exceptions with requests and dependencies`;

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating exception summary:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate exception summary: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "ai-performance-report",
    "Generate a comprehensive performance analysis report from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        // Get operation performance
        const performanceResult = await ctx.appInsights.getOperationPerformance(resourceId, timespanValue);

        // Get slow requests
        const slowRequestsResult = await ctx.appInsights.getSlowRequests(resourceId, 5000, timespanValue, 20);

        // Format results
        const performanceTable = formatTableAsMarkdown(performanceResult.tables[0]);
        const slowRequestsTable = formatTableAsMarkdown(slowRequestsResult.tables[0]);
        const insights = analyzePerformance(performanceResult.tables[0]);

        const report = `# Application Insights Performance Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Key Insights\n\n${insights}\n\n` +
          `## Operation Performance Summary\n\n${performanceTable}\n\n` +
          `## Slowest Requests (>5s)\n\n${slowRequestsTable}\n\n` +
          `## Performance Recommendations\n\n` +
          `- Focus optimization efforts on operations with high P95/P99 duration\n` +
          `- Investigate operations with high failure counts\n` +
          `- Monitor operations with high request counts for scalability issues\n` +
          `- Use operation_Id to trace slow requests through dependencies`;

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating performance report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate performance report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "ai-dependency-health",
    "Generate a dependency health report showing external service issues",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        // Get failed dependencies
        const failedDepsResult = await ctx.appInsights.getFailedDependencies(resourceId, timespanValue, 50);

        // Get dependency success rates
        const successRatesResult = await ctx.appInsights.executeQuery(
          resourceId,
          `
            dependencies
            | where timestamp > ago(${timespanValue.replace(/^P(T)?/, '')})
            | summarize Total=count(), Failed=countif(success == false), AvgDuration=avg(duration) by target, type
            | extend SuccessRate=round(100.0 * (Total - Failed) / Total, 2)
            | order by SuccessRate asc
          `.trim(),
          timespanValue
        );

        // Format results
        const failedDepsTable = formatTableAsMarkdown(failedDepsResult.tables[0]);
        const successRatesTable = formatTableAsMarkdown(successRatesResult.tables[0]);
        const insights = analyzeDependencies(failedDepsResult.tables[0]);

        const report = `# Application Insights Dependency Health Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Key Insights\n\n${insights}\n\n` +
          `## Failed Dependencies\n\n${failedDepsTable}\n\n` +
          `## Dependency Success Rates\n\n${successRatesTable}\n\n` +
          `## Recommendations\n\n` +
          `- Investigate dependencies with success rates below 99%\n` +
          `- Check if external service degradation matches known incidents\n` +
          `- Review timeout configurations for slow dependencies\n` +
          `- Consider implementing circuit breakers for unreliable dependencies`;

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating dependency health report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate dependency health report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "ai-availability-report",
    "Generate an availability and uptime report from Application Insights",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT24H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT24H';

        // Get availability results
        const availabilityResult = await ctx.appInsights.getAvailabilityResults(resourceId, timespanValue);

        // Format results
        const availabilityTable = formatTableAsMarkdown(availabilityResult.tables[0]);

        const report = `# Application Insights Availability Report\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n\n` +
          `## Availability Test Results\n\n${availabilityTable}\n\n` +
          `## Recommendations\n\n` +
          `- Investigate any tests with success rates below 99.9%\n` +
          `- Review failed tests for patterns (geographic, time-based)\n` +
          `- Consider adding availability tests for critical endpoints if missing\n` +
          `- Set up alerts for availability degradation`;

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating availability report:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate availability report: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "ai-troubleshooting-guide",
    "Generate a comprehensive troubleshooting guide combining exceptions, performance, and dependencies",
    {
      resourceId: z.string().describe("Resource ID"),
      timespan: z.string().optional().describe("Time range (default: PT1H)"),
    },
    async ({ resourceId, timespan }: any) => {
      try {
        const timespanValue = timespan || 'PT1H';

        // Get data from multiple sources
        const exceptionsResult = await ctx.appInsights.getRecentExceptions(resourceId, timespanValue, 20);
        const slowRequestsResult = await ctx.appInsights.getSlowRequests(resourceId, 5000, timespanValue, 20);
        const failedDepsResult = await ctx.appInsights.getFailedDependencies(resourceId, timespanValue, 20);
        const tracesResult = await ctx.appInsights.getTracesBySeverity(resourceId, 3, timespanValue, 30); // Error level

        // Format results
        const exceptionsTable = formatTableAsMarkdown(exceptionsResult.tables[0]);
        const slowRequestsTable = formatTableAsMarkdown(slowRequestsResult.tables[0]);
        const failedDepsTable = formatTableAsMarkdown(failedDepsResult.tables[0]);
        const tracesTable = formatTableAsMarkdown(tracesResult.tables[0]);

        const report = `# Application Insights Troubleshooting Guide\n\n` +
          `**Resource**: ${resourceId}\n` +
          `**Time Range**: ${timespanValue}\n` +
          `**Generated**: ${new Date().toISOString()}\n\n` +
          `## 1. Recent Errors and Exceptions\n\n${exceptionsTable}\n\n` +
          `## 2. Performance Issues\n\n${slowRequestsTable}\n\n` +
          `## 3. Dependency Failures\n\n${failedDepsTable}\n\n` +
          `## 4. Diagnostic Logs (Errors)\n\n${tracesTable}\n\n` +
          `## 5. Investigation Steps\n\n` +
          `1. **Identify the pattern**: Check if errors are isolated or widespread\n` +
          `2. **Correlate events**: Use operation_Id to trace requests across services\n` +
          `3. **Check timeline**: Look for correlation with deployments or external events\n` +
          `4. **Review dependencies**: Verify external service health\n` +
          `5. **Analyze traces**: Review detailed logs for error context\n\n` +
          `## 6. Common Patterns and Root Causes\n\n` +
          `- **High exception rate + dependency failures**: External service degradation\n` +
          `- **Slow requests + high dependency duration**: Network or external API latency\n` +
          `- **Exceptions in specific operations**: Code defect or invalid input\n` +
          `- **Timeouts**: Insufficient resources or inefficient queries`;

        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: report,
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating troubleshooting guide:", error);
        return {
          messages: [
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Failed to generate troubleshooting guide: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );
}
