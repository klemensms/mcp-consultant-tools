/**
 * CLI Output Helpers
 *
 * Handles formatting and outputting results for the CLI.
 * Supports JSON and human-readable text output.
 */

export interface OutputOptions {
  json?: boolean;
}

/**
 * Output a result to stdout, formatted as JSON or plain text.
 */
export function outputResult(data: any, opts: OutputOptions = {}): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else if (data === null || data === undefined) {
    console.log("Operation completed successfully.");
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Handle a CLI error and exit with code 1.
 */
export function handleCliError(error: unknown): never {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  } else {
    console.error(`Error: ${String(error)}`);
  }
  process.exit(1);
}
