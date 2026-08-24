/**
 * 1Password permission mapping and shared types.
 */

/** Human-readable permission names accepted by vault admin tools */
export type PermissionName = 'read' | 'create' | 'update' | 'delete' | 'share' | 'manage';

/**
 * Map human-readable permission names to SDK bitmask values.
 * NOTE: Actual values must be verified against @1password/sdk exports.
 */
export const PERMISSION_MAP: Record<PermissionName, number> = {
  read: 1,
  create: 2,
  update: 4,
  delete: 8,
  share: 16,
  manage: 32,
};

/**
 * Convert human-readable permission strings to bitmask.
 */
export function permissionsToBitmask(permissions: PermissionName[]): number {
  return permissions.reduce((mask, p) => {
    const val = PERMISSION_MAP[p];
    if (val === undefined) {
      throw new Error(`Unknown permission: '${p}'. Valid values: ${Object.keys(PERMISSION_MAP).join(', ')}`);
    }
    return mask | val;
  }, 0);
}

/** Password recipe types - discriminated union */
export type PasswordRecipe =
  | { type: 'random'; length?: number; includeDigits?: boolean; includeSymbols?: boolean; includeUppercase?: boolean; includeLowercase?: boolean }
  | { type: 'memorable'; wordCount?: number; separator?: string; capitalize?: boolean }
  | { type: 'pin'; length?: number };
