/**
 * Publisher Configuration Module
 *
 * Manages the configurable publisher prefix for PowerPlatform customization.
 * The prefix is required and must be set via PUBLISHER_PREFIX environment variable.
 */

let _publisherPrefix: string | null = null;

/**
 * Normalize the publisher prefix to ensure it ends with underscore
 * @param prefix - The raw prefix value (e.g., 'sic' or 'sic_')
 * @returns Normalized prefix with trailing underscore (e.g., 'sic_')
 */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().toLowerCase();
  return trimmed.endsWith('_') ? trimmed : `${trimmed}_`;
}

/**
 * Initialize the publisher prefix from environment variable.
 * Must be called before using getPublisherPrefix().
 * @throws Error if PUBLISHER_PREFIX is not set
 */
export function initializePublisherPrefix(): void {
  const rawPrefix = process.env.PUBLISHER_PREFIX;
  if (!rawPrefix) {
    throw new Error(
      'Missing required configuration: PUBLISHER_PREFIX. ' +
      'Set this to your PowerPlatform publisher prefix (e.g., "abc" or "abc_").'
    );
  }
  _publisherPrefix = normalizePrefix(rawPrefix);
}

/**
 * Get the normalized publisher prefix.
 * @returns The publisher prefix with trailing underscore (e.g., 'sic_')
 * @throws Error if prefix has not been initialized
 */
export function getPublisherPrefix(): string {
  if (_publisherPrefix === null) {
    // Try to initialize on first access
    initializePublisherPrefix();
  }
  return _publisherPrefix!;
}

/**
 * Check if publisher prefix is configured (without throwing)
 */
export function isPublisherPrefixConfigured(): boolean {
  return !!process.env.PUBLISHER_PREFIX;
}

/**
 * Reset the publisher prefix (for testing purposes)
 */
export function resetPublisherPrefix(): void {
  _publisherPrefix = null;
}
