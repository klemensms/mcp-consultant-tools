/**
 * CLI output helpers for powerplatform-customization
 *
 * Formats results as JSON or human-readable text based on global flags.
 */

export interface GlobalFlags {
  json: boolean;
}

let globalFlags: GlobalFlags = { json: false };

export function setGlobalFlags(flags: GlobalFlags): void {
  globalFlags = flags;
}

export function getGlobalFlags(): GlobalFlags {
  return globalFlags;
}

/**
 * Output a result to stdout.
 * In JSON mode, prints JSON. Otherwise prints human-readable text.
 */
export function outputResult(data: unknown): void {
  if (globalFlags.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else if (data === null || data === undefined) {
    console.log('Done.');
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Output an error and exit with code 1.
 */
export function handleCliError(error: unknown): never {
  if (globalFlags.json) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ error: message }, null, 2));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}
