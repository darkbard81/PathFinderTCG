import * as Phaser from 'phaser';
import Folder from 'phaser4-rex-plugins/templates/ui/folder/Folder.js';
import Sizer from 'phaser4-rex-plugins/templates/ui/sizer/Sizer.js';
import { Trees } from 'phaser4-rex-plugins/templates/ui/ui-components.js';
import type Tree from 'phaser4-rex-plugins/templates/ui/trees/tree/Tree.js';

import {
  getAdjacentPF2eCustomClassId,
  PF2E_CUSTOM_CLASS_CATALOG,
  PF2E_DEFAULT_CUSTOM_CLASS_ID,
  type PF2eCustomClassId,
} from '../showcase/pf2eCustomClassCatalog';
import { PF2E_ELF_THEME, type PF2eNinePatchVisualState } from '../theme/pf2eElfTheme';
import { PF2eNineLabel } from './PF2eNineLabel';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2eTreeConfig {
  readonly initialClassId?: PF2eCustomClassId;
  readonly onSelectionChange?: (classId: PF2eCustomClassId) => void;
}

export class PF2eTree extends Trees {
  private readonly rootTree: Tree;
  private readonly nodeById = new Map<PF2eCustomClassId, PF2eNineLabel>();
  private readonly idByNode = new Map<Phaser.GameObjects.GameObject, PF2eCustomClassId>();
  private readonly onSelectionChange?: (classId: PF2eCustomClassId) => void;
  private selectedId: PF2eCustomClassId;
  private focusedId: PF2eCustomClassId;
  private hoveredId?: PF2eCustomClassId;
  private pressedId?: PF2eCustomClassId;

  constructor(scene: Phaser.Scene, config: PF2eTreeConfig = {}) {
    const treeTheme = PF2E_ELF_THEME.components.tree;

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
    this.addBackground(
      new PF2eNinePatch2(scene, {
        variant: 'panel',
        width: 2,
        height: 2,
      }),
    );

    this.selectedId = config.initialClassId ?? PF2E_DEFAULT_CUSTOM_CLASS_ID;
    this.focusedId = this.selectedId;
    this.onSelectionChange = config.onSelectionChange;

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
    const toggleButton = this.rootTree.getElement('toggleButton');
    if (toggleButton instanceof Phaser.GameObjects.GameObject) {
      this.rootTree.disableClick(toggleButton);
      toggleButton.on('pointerup', this.handleToggleClick);
    }

    for (const definition of PF2E_CUSTOM_CLASS_CATALOG) {
      const node = new PF2eNineLabel(scene, {
        text: definition.name,
        variant: 'status',
        fontSize: treeTheme.rowFontSize,
        height: PF2E_ELF_THEME.sizes.treeRow,
      });
      this.rootTree.addNode(node, definition.id);
      this.nodeById.set(definition.id, node);
      this.idByNode.set(node, definition.id);
    }

    this.setChildrenInteractive({
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

  get selectedClassId(): PF2eCustomClassId {
    return this.selectedId;
  }

  get focusedClassId(): PF2eCustomClassId {
    return this.focusedId;
  }

  setSelectedClass(classId: PF2eCustomClassId): this {
    this.focusedId = classId;
    if (this.selectedId === classId) {
      this.updateNodeStates();
      return this;
    }

    this.selectedId = classId;
    this.updateNodeStates();
    this.onSelectionChange?.(classId);
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
    return this.setSelectedClass(this.focusedId);
  }

  override destroy(fromScene?: boolean): void {
    if (!this.scene || this.ignoreDestroy) {
      return;
    }

    // phaser4-rex-plugins 4.2.0 references an unimported `Clear` helper in
    // Trees.destroy() and Tree.destroy(). Bypass only those two broken
    // overrides while preserving the normal Sizer/Folder child cleanup.
    this.rootTree.ignoreDestroy = true;
    Sizer.prototype.destroy.call(this, fromScene);
    this.rootTree.ignoreDestroy = false;
    Folder.prototype.destroy.call(this.rootTree, fromScene);
  }

  private moveFocus(direction: 'previous' | 'next'): this {
    this.ensureExpanded();
    this.focusedId = getAdjacentPF2eCustomClassId(this.focusedId, direction);
    this.updateNodeStates();
    return this;
  }

  private ensureExpanded(): void {
    if (!this.rootTree.expanded) {
      this.rootTree.setExpandedState(true);
    }
  }

  private readonly handleChildDown = (child: Phaser.GameObjects.GameObject): void => {
    const classId = this.idByNode.get(child);
    if (!classId) {
      return;
    }
    this.pressedId = classId;
    this.updateNodeStates();
  };

  private readonly handleChildUp = (child: Phaser.GameObjects.GameObject): void => {
    const classId = this.idByNode.get(child);
    if (this.pressedId === classId) {
      this.pressedId = undefined;
      this.updateNodeStates();
    }
  };

  private readonly handleChildOver = (child: Phaser.GameObjects.GameObject): void => {
    const classId = this.idByNode.get(child);
    if (!classId) {
      return;
    }
    this.hoveredId = classId;
    this.updateNodeStates();
  };

  private readonly handleChildOut = (child: Phaser.GameObjects.GameObject): void => {
    const classId = this.idByNode.get(child);
    if (this.hoveredId === classId) {
      this.hoveredId = undefined;
    }
    if (this.pressedId === classId) {
      this.pressedId = undefined;
    }
    this.updateNodeStates();
  };

  private readonly handleChildClick = (child: Phaser.GameObjects.GameObject): void => {
    if (child === this.rootTree) {
      this.handleToggleClick();
      return;
    }

    const classId = this.idByNode.get(child);
    if (classId) {
      this.setSelectedClass(classId);
    }
  };

  private readonly handleToggleClick = (): void => {
    this.rootTree.setExpandedState(!this.rootTree.expanded);
  };

  private updateNodeStates(): void {
    for (const [classId, node] of this.nodeById) {
      let state: PF2eNinePatchVisualState = 'idle';
      if (classId === this.selectedId) {
        state = 'selected';
      } else if (classId === this.pressedId) {
        state = 'pressed';
      } else if (classId === this.focusedId) {
        state = 'focused';
      } else if (classId === this.hoveredId) {
        state = 'hover';
      }
      node.setVisualState(state);
    }
  }
}
