/**
 * Off-by-default feature switches. Only the exact string "true" enables a switch,
 * so a typo or a "1" leaves the capability off.
 */
export function isEnabled(varName: string): boolean {
  return process.env[varName] === 'true';
}

/**
 * Throw when a switch is off. The message names the variable so an agent can tell
 * the user exactly what to turn on.
 */
export function requireEnabled(varName: string, capability: string): void {
  if (!isEnabled(varName)) {
    throw new Error(`${capability} is disabled. Set ${varName}=true to enable.`);
  }
}
