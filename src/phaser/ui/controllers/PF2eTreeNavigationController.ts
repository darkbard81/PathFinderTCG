import type * as Phaser from 'phaser';

import type { PF2eTree } from '../components/PF2eTree';
import type { PF2eNinePatchVisualState } from '../theme/pf2eElfTheme';
import { getAdjacentNodeId } from './linearNavigation';

export interface PF2eTreeNavigationControllerConfig<NodeId extends string> {
  readonly nodeIds: readonly [NodeId, ...NodeId[]];
  readonly initialSelectedId: NodeId;
  readonly onFocusChange?: (nodeId: NodeId) => void;
  readonly onSelectionChange?: (nodeId: NodeId) => void;
}

export class PF2eTreeNavigationController<NodeId extends string> {
  private readonly tree: PF2eTree;
  private readonly nodeIds: readonly [NodeId, ...NodeId[]];
  private readonly nodeIdByValue = new Map<string, NodeId>();
  private readonly onFocusChange?: (nodeId: NodeId) => void;
  private readonly onSelectionChange?: (nodeId: NodeId) => void;
  private selectedId: NodeId;
  private focusedId: NodeId;
  private hoveredId?: NodeId;
  private pressedId?: NodeId;

  constructor(tree: PF2eTree, config: PF2eTreeNavigationControllerConfig<NodeId>) {
    this.tree = tree;
    this.nodeIds = config.nodeIds;
    this.selectedId = config.initialSelectedId;
    this.focusedId = config.initialSelectedId;
    this.onFocusChange = config.onFocusChange;
    this.onSelectionChange = config.onSelectionChange;

    for (const nodeId of this.nodeIds) {
      if (this.nodeIdByValue.has(nodeId)) {
        throw new Error(`Duplicate PF2e navigation node id: ${nodeId}`);
      }
      if (!this.tree.nodeIds.includes(nodeId)) {
        throw new Error(`PF2e navigation node is missing from tree: ${nodeId}`);
      }
      this.nodeIdByValue.set(nodeId, nodeId);
    }
    if (!this.nodeIdByValue.has(config.initialSelectedId)) {
      throw new Error(`Unknown initial PF2e navigation node: ${config.initialSelectedId}`);
    }

    this.tree
      .setChildrenInteractive({
        click: {
          mode: 'release',
          threshold: 10,
        },
        over: true,
      })
      .on('child.down', this.handleChildDown)
      .on('child.up', this.handleChildUp)
      .on('child.over', this.handleChildOver)
      .on('child.out', this.handleChildOut)
      .on('child.click', this.handleChildClick);

    this.updateNodeStates();
  }

  get selectedNodeId(): NodeId {
    return this.selectedId;
  }

  get focusedNodeId(): NodeId {
    return this.focusedId;
  }

  selectNode(nodeId: NodeId): this {
    this.requireNode(nodeId);
    const focusChanged = this.focusedId !== nodeId;
    this.focusedId = nodeId;
    if (focusChanged) {
      this.onFocusChange?.(nodeId);
    }
    if (this.selectedId === nodeId) {
      this.updateNodeStates();
      return this;
    }

    this.selectedId = nodeId;
    this.updateNodeStates();
    this.onSelectionChange?.(nodeId);
    return this;
  }

  focusPrevious(): this {
    return this.moveFocus('previous');
  }

  focusNext(): this {
    return this.moveFocus('next');
  }

  activateFocused(): this {
    this.ensureExpanded();
    return this.selectNode(this.focusedId);
  }

  destroy(): void {
    this.tree
      .off('child.down', this.handleChildDown)
      .off('child.up', this.handleChildUp)
      .off('child.over', this.handleChildOver)
      .off('child.out', this.handleChildOut)
      .off('child.click', this.handleChildClick);
  }

  private moveFocus(direction: 'previous' | 'next'): this {
    this.ensureExpanded();
    this.focusedId = getAdjacentNodeId(this.nodeIds, this.focusedId, direction);
    this.updateNodeStates();
    this.onFocusChange?.(this.focusedId);
    return this;
  }

  private ensureExpanded(): void {
    if (!this.tree.expanded) {
      this.tree.setExpanded(true);
    }
  }

  private requireNode(nodeId: NodeId): void {
    if (!this.nodeIdByValue.has(nodeId)) {
      throw new Error(`Unknown PF2e navigation node: ${nodeId}`);
    }
  }

  private resolveNodeId(child: Phaser.GameObjects.GameObject): NodeId | undefined {
    const nodeId = this.tree.getNodeId(child);
    return nodeId === undefined ? undefined : this.nodeIdByValue.get(nodeId);
  }

  private readonly handleChildDown = (child: Phaser.GameObjects.GameObject): void => {
    const nodeId = this.resolveNodeId(child);
    if (nodeId === undefined) {
      return;
    }
    this.pressedId = nodeId;
    this.updateNodeStates();
  };

  private readonly handleChildUp = (child: Phaser.GameObjects.GameObject): void => {
    const nodeId = this.resolveNodeId(child);
    if (this.pressedId === nodeId) {
      this.pressedId = undefined;
      this.updateNodeStates();
    }
  };

  private readonly handleChildOver = (child: Phaser.GameObjects.GameObject): void => {
    const nodeId = this.resolveNodeId(child);
    if (nodeId === undefined) {
      return;
    }
    this.hoveredId = nodeId;
    this.updateNodeStates();
  };

  private readonly handleChildOut = (child: Phaser.GameObjects.GameObject): void => {
    const nodeId = this.resolveNodeId(child);
    if (this.hoveredId === nodeId) {
      this.hoveredId = undefined;
    }
    if (this.pressedId === nodeId) {
      this.pressedId = undefined;
    }
    this.updateNodeStates();
  };

  private readonly handleChildClick = (child: Phaser.GameObjects.GameObject): void => {
    const nodeId = this.resolveNodeId(child);
    if (nodeId !== undefined) {
      this.selectNode(nodeId);
    }
  };

  private updateNodeStates(): void {
    for (const nodeId of this.nodeIds) {
      let state: PF2eNinePatchVisualState = 'idle';
      if (nodeId === this.selectedId) {
        state = 'selected';
      } else if (nodeId === this.pressedId) {
        state = 'pressed';
      } else if (nodeId === this.focusedId) {
        state = 'focused';
      } else if (nodeId === this.hoveredId) {
        state = 'hover';
      }
      this.tree.setNodeVisualState(nodeId, state);
    }
  }
}
