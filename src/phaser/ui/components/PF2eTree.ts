import type * as Phaser from 'phaser';
import Folder from 'phaser4-rex-plugins/templates/ui/folder/Folder.js';
import Sizer from 'phaser4-rex-plugins/templates/ui/sizer/Sizer.js';
import { Trees } from 'phaser4-rex-plugins/templates/ui/ui-components.js';
import type Tree from 'phaser4-rex-plugins/templates/ui/trees/tree/Tree.js';

import { PF2E_ELF_THEME, type PF2eNinePatchVisualState } from '../theme/pf2eElfTheme';
import { PF2eNineLabel } from './PF2eNineLabel';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2eTreeNodeDefinition {
  readonly id: string;
  readonly text: string;
}

export interface PF2eTreeConfig {
  readonly nodes: readonly PF2eTreeNodeDefinition[];
  readonly showBackground?: boolean;
}

export class PF2eTree extends Trees {
  private readonly rootTree: Tree;
  private readonly nodeById = new Map<string, PF2eNineLabel>();
  private readonly idByNode = new Map<Phaser.GameObjects.GameObject, string>();

  constructor(scene: Phaser.Scene, config: PF2eTreeConfig) {
    const treeTheme = PF2E_ELF_THEME.components.tree;
    if (config.nodes.length === 0) {
      throw new Error('PF2eTree requires at least one node');
    }

    super(scene, {
      width: 2,
      height: 2,
      orientation: 'y',
      space: {
        left: treeTheme.inset,
        right: treeTheme.inset,
        top: treeTheme.topInset,
        bottom: treeTheme.inset,
        item: treeTheme.itemGap,
      },
      tree: {
        orientation: 'y',
        expanded: true,
        transition: {
          duration: 0,
        },
        toggleButton: {
          width: PF2E_ELF_THEME.sizes.treeToggle,
          height: PF2E_ELF_THEME.sizes.treeToggle,
          color: PF2E_ELF_THEME.colors.accent,
          strokeColor: PF2E_ELF_THEME.colors.accent,
          strokeWidth: PF2E_ELF_THEME.strokes.control,
          direction: 'down',
          easeDuration: 0,
          padding: treeTheme.togglePadding,
        },
        space: {
          indent: treeTheme.indent,
          nodeTop: Math.round(treeTheme.itemGap / 2),
          nodeBottom: Math.round(treeTheme.itemGap / 2),
          toggleButton: treeTheme.itemGap,
        },
        align: {
          title: 'left',
          child: 'left',
        },
        expand: {
          title: true,
          child: true,
        },
      },
    });

    scene.add.existing(this);
    if (config.showBackground ?? true) {
      this.addBackground(
        new PF2eNinePatch2(scene, {
          variant: 'panel',
          width: 2,
          height: 2,
        }),
      );
    }

    this.rootTree = this.addTree({
      nodeKey: 'pf2eCustomClasses',
      nodeBody: {
        height: PF2E_ELF_THEME.sizes.minimumTouchTarget,
        background: {
          color: PF2E_ELF_THEME.colors.surface,
          strokeColor: PF2E_ELF_THEME.colors.border,
          strokeWidth: PF2E_ELF_THEME.strokes.control,
          radius: PF2E_ELF_THEME.radii.control,
        },
        text: {
          color: PF2E_ELF_THEME.colors.text,
          fontFamily: PF2E_ELF_THEME.typography.display,
          fontSize: `${treeTheme.titleFontSize}px`,
          fontStyle: 'bold',
        },
        space: {
          left: treeTheme.titlePaddingX,
          right: treeTheme.titlePaddingX,
          top: treeTheme.titlePaddingY,
          bottom: treeTheme.titlePaddingY,
        },
      },
      expanded: true,
      transition: {
        duration: 0,
      },
    });
    this.rootTree.setText('PF2e Custom Classes');

    for (const definition of config.nodes) {
      if (this.nodeById.has(definition.id)) {
        throw new Error(`Duplicate PF2e tree node id: ${definition.id}`);
      }
      const node = new PF2eNineLabel(scene, {
        text: definition.text,
        variant: 'status',
        fontSize: treeTheme.rowFontSize,
        height: PF2E_ELF_THEME.sizes.treeRow,
      });
      this.rootTree.addNode(node, definition.id);
      this.nodeById.set(definition.id, node);
      this.idByNode.set(node, definition.id);
    }
  }

  get nodeIds(): readonly string[] {
    return [...this.nodeById.keys()];
  }

  get expanded(): boolean {
    return this.rootTree.expanded;
  }

  getNodeId(node: Phaser.GameObjects.GameObject): string | undefined {
    return this.idByNode.get(node);
  }

  setNodeVisualState(nodeId: string, state: PF2eNinePatchVisualState): this {
    const node = this.nodeById.get(nodeId);
    if (!node) {
      throw new Error(`Unknown PF2e tree node: ${nodeId}`);
    }
    node.setVisualState(state);
    return this;
  }

  setExpanded(expanded: boolean): this {
    this.rootTree.setExpandedState(expanded);
    return this;
  }

  override destroy(fromScene?: boolean): void {
    if (!this.scene || this.ignoreDestroy) {
      return;
    }

    // phaser4-rex-plugins 4.2.0 references an unimported `Clear` helper in
    // Trees.destroy() and Tree.destroy(). Bypass only those broken overrides.
    this.rootTree.ignoreDestroy = true;
    Sizer.prototype.destroy.call(this, fromScene);
    this.rootTree.ignoreDestroy = false;
    Folder.prototype.destroy.call(this.rootTree, fromScene);
  }
}
