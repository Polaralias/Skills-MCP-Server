export const accessModes = ['write', 'read', 'selective-write'] as const;

export type AccessMode = (typeof accessModes)[number];

export interface ScopedAccessConfig {
  readonly mode: AccessMode;
  readonly allowedSpaceIds: ReadonlyArray<string>;
  readonly allowedListIds: ReadonlyArray<string>;
}

export interface ItemScope {
  readonly spaceId?: string;
  readonly listId?: string;
}

export type AccessLevel = 'read' | 'write';

const buildAllowedIdSet = (config: ScopedAccessConfig): Set<string> =>
  new Set([...config.allowedSpaceIds, ...config.allowedListIds]);

/**
 * Determines the effective access level for a resource located within a list/space hierarchy.
 *
 * - Read mode: always returns read-only.
 * - Write mode: always returns writable.
 * - Selective write mode: write access is granted only when either the spaceId or
 *   listId matches one of the configured identifiers, regardless of which bucket
 *   (space or list) the identifier was provided in.
 */
export const getAccessForItem = (
  config: ScopedAccessConfig,
  scope: ItemScope
): AccessLevel => {
  if (config.mode === 'write') {
    return 'write';
  }

  if (config.mode === 'read') {
    return 'read';
  }

  const allowedIds = buildAllowedIdSet(config);
  if (allowedIds.size === 0) {
    return 'read';
  }

  if ((scope.spaceId && allowedIds.has(scope.spaceId)) || (scope.listId && allowedIds.has(scope.listId))) {
    return 'write';
  }

  return 'read';
};
