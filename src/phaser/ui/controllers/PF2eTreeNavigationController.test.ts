import { describe, expect, it } from 'vitest';

import { getAdjacentNodeId } from './linearNavigation';

describe('getAdjacentNodeId', () => {
  const nodeIds = ['first', 'second', 'third'] as const;

  it('moves in both directions and wraps at each edge', () => {
    expect(getAdjacentNodeId(nodeIds, 'first', 'next')).toBe('second');
    expect(getAdjacentNodeId(nodeIds, 'third', 'next')).toBe('first');
    expect(getAdjacentNodeId(nodeIds, 'third', 'previous')).toBe('second');
    expect(getAdjacentNodeId(nodeIds, 'first', 'previous')).toBe('third');
  });

  it('rejects a node outside the configured order', () => {
    const openNodeIds: readonly [string, ...string[]] = nodeIds;
    expect(() => getAdjacentNodeId(openNodeIds, 'missing', 'next')).toThrow(
      'Unknown PF2e navigation node: missing',
    );
  });
});
