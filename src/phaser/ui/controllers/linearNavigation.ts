export function getAdjacentNodeId<NodeId extends string>(
  nodeIds: readonly [NodeId, ...NodeId[]],
  currentId: NodeId,
  direction: 'previous' | 'next',
): NodeId {
  const currentIndex = nodeIds.indexOf(currentId);
  if (currentIndex < 0) {
    throw new Error(`Unknown PF2e navigation node: ${currentId}`);
  }
  const offset = direction === 'next' ? 1 : -1;
  const nextIndex = (currentIndex + offset + nodeIds.length) % nodeIds.length;
  const adjacentId = nodeIds[nextIndex];
  if (adjacentId === undefined) {
    throw new Error('PF2e navigation node list is empty');
  }
  return adjacentId;
}
