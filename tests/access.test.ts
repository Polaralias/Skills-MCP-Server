import { describe, expect, it } from 'vitest';
import { getAccessForItem } from '../src/access/scopedAccess';

describe('getAccessForItem', () => {
  const baseScope = {
    allowedSpaceIds: ['space-1'],
    allowedListIds: ['list-1']
  } as const;

  it('denies write operations in read mode', () => {
    const access = getAccessForItem(
      { mode: 'read', ...baseScope },
      { spaceId: 'space-1', listId: 'list-1' }
    );

    expect(access).toBe('read');
  });

  it('allows write operations everywhere in write mode', () => {
    const access = getAccessForItem(
      { mode: 'write', ...baseScope },
      { spaceId: 'other-space', listId: 'other-list' }
    );

    expect(access).toBe('write');
  });

  it('allows writes to explicitly allowed lists in selective write mode', () => {
    const access = getAccessForItem(
      { mode: 'selective-write', ...baseScope },
      { spaceId: 'unscoped-space', listId: 'list-1' }
    );

    expect(access).toBe('write');
  });

  it('allows writes anywhere within an allowed space hierarchy', () => {
    const access = getAccessForItem(
      { mode: 'selective-write', ...baseScope },
      { spaceId: 'space-1', listId: 'child-list' }
    );

    expect(access).toBe('write');
  });

  it('treats allowed identifiers consistently even when misfiled', () => {
    const access = getAccessForItem(
      {
        mode: 'selective-write',
        allowedSpaceIds: ['space-1'],
        allowedListIds: ['space-2']
      },
      { spaceId: 'space-2', listId: 'unrelated-list' }
    );

    expect(access).toBe('write');
  });

  it('falls back to read access when outside the configured scope', () => {
    const access = getAccessForItem(
      { mode: 'selective-write', ...baseScope },
      { spaceId: 'space-2', listId: 'list-2' }
    );

    expect(access).toBe('read');
  });

  it('does not allow writes when no scoping identifiers are provided', () => {
    const access = getAccessForItem(
      { mode: 'selective-write', allowedSpaceIds: [], allowedListIds: [] },
      { spaceId: 'space-1', listId: 'list-1' }
    );

    expect(access).toBe('read');
  });
});
