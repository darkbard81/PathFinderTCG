import * as Phaser from 'phaser';
import type Sizer from 'phaser4-rex-plugins/templates/ui/sizer/Sizer.js';

import { calculateCustomClassShowcaseLayout } from '../../ui/layout/customClassShowcaseLayout';
import { PF2eCustomClassShowcase } from '../ui/components/PF2eCustomClassShowcase';
import { PF2eScrollablePanel } from '../ui/components/PF2eScrollablePanel';
import { PF2eTree } from '../ui/components/PF2eTree';
import { PF2eScrollablePanelController } from '../ui/controllers/PF2eScrollablePanelController';
import { PF2eTreeKeyboardController } from '../ui/controllers/PF2eTreeKeyboardController';
import { PF2eTreeNavigationController } from '../ui/controllers/PF2eTreeNavigationController';
import {
  PF2E_CUSTOM_CLASS_CATALOG,
  PF2E_CUSTOM_CLASS_IDS,
  PF2E_DEFAULT_CUSTOM_CLASS_ID,
  type PF2eCustomClassId,
} from '../ui/showcase/pf2eCustomClassCatalog';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme';

export class PF2eCustomClassShowcaseScene extends Phaser.Scene {
  private rootSizer?: Sizer;
  private navigationViewport?: PF2eScrollablePanel;
  private showcase?: PF2eCustomClassShowcase;
  private treeNavigation?: PF2eTreeNavigationController<PF2eCustomClassId>;
  private treeKeyboard?: PF2eTreeKeyboardController<PF2eCustomClassId>;
  private navigationScroll?: PF2eScrollablePanelController;
  private selectedClassId: PF2eCustomClassId = PF2E_DEFAULT_CUSTOM_CLASS_ID;

  constructor() {
    super('PF2eCustomClassShowcaseScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);

    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private rebuildLayout(width: number, height: number): void {
    if (this.treeNavigation) {
      this.selectedClassId = this.treeNavigation.selectedNodeId;
    }

    this.destroyControllers();
    this.rootSizer?.destroy();
    this.rootSizer = undefined;
    this.navigationViewport = undefined;
    this.showcase = undefined;

    const layout = calculateCustomClassShowcaseLayout(width, height);
    const contentWidth = Math.max(
      220,
      layout.crossExtent -
        PF2E_ELF_THEME.components.showcase.inset * 2 -
        PF2E_ELF_THEME.sizes.scrollbar -
        PF2E_ELF_THEME.spacing.controlGap,
    );
    const root = this.rexUI.add.sizer({
      x: width / 2,
      y: height / 2,
      width: layout.usableWidth,
      height: layout.usableHeight,
      orientation: layout.axis,
      space: {
        item: layout.gap,
      },
    });
    const showcase = new PF2eCustomClassShowcase(this, {
      contentWidth,
      initialClassId: this.selectedClassId,
    });
    this.showcase = showcase;

    const classTree = new PF2eTree(this, {
      nodes: PF2E_CUSTOM_CLASS_CATALOG.map(({ id, name }) => ({ id, text: name })),
      showBackground: layout.orientation === 'landscape',
    });
    const treeNavigation = new PF2eTreeNavigationController(classTree, {
      nodeIds: PF2E_CUSTOM_CLASS_IDS,
      initialSelectedId: this.selectedClassId,
      onFocusChange: () => {
        this.syncNavigationScroll();
        this.syncCanvasDataset();
      },
      onSelectionChange: (classId) => {
        this.selectedClassId = classId;
        this.showcase?.showClass(classId);
        this.syncNavigationScroll();
        this.syncCanvasDataset();
      },
    });
    this.treeNavigation = treeNavigation;
    this.treeKeyboard = new PF2eTreeKeyboardController(this, treeNavigation);
    let navigation: PF2eTree | PF2eScrollablePanel = classTree;
    if (layout.orientation === 'portrait') {
      classTree
        .setMinWidth(
          Math.max(
            1,
            layout.usableWidth -
              PF2E_ELF_THEME.sizes.scrollbar -
              PF2E_ELF_THEME.components.scrollablePanel.sliderGap,
          ),
        )
        .layout();
      navigation = new PF2eScrollablePanel(this, {
        child: classTree,
        backgroundVariant: 'panel',
        hideScrollbarWhenUnscrollable: true,
      });
      this.navigationViewport = navigation;
      this.navigationScroll = new PF2eScrollablePanelController(navigation);
    }

    root
      .add(navigation, {
        proportion: layout.navigationProportion,
        expand: true,
      })
      .add(showcase, {
        proportion: layout.showcaseProportion,
        expand: true,
      })
      .layout();

    this.rootSizer = root;
    this.syncNavigationScroll();
    this.game.canvas.dataset.scene = this.scene.key;
    this.game.canvas.dataset.orientation = layout.orientation;
    this.game.canvas.dataset.viewport = `${Math.round(width)}x${Math.round(height)}`;
    this.syncCanvasDataset();
  }

  private syncCanvasDataset(): void {
    this.game.canvas.dataset.selectedClass = this.selectedClassId;
    this.game.canvas.dataset.focusedClass =
      this.treeNavigation?.focusedNodeId ?? this.selectedClassId;
  }

  private syncNavigationScroll(): void {
    if (!this.navigationViewport || !this.navigationScroll || !this.treeNavigation) {
      return;
    }
    const focusedIndex = PF2E_CUSTOM_CLASS_IDS.indexOf(this.treeNavigation.focusedNodeId);
    const maximumIndex = PF2E_CUSTOM_CLASS_IDS.length - 1;
    this.navigationScroll.setProgress(maximumIndex <= 0 ? 0 : focusedIndex / maximumIndex);
  }

  private destroyControllers(): void {
    this.treeKeyboard?.destroy();
    this.treeNavigation?.destroy();
    this.navigationScroll?.destroy();
    this.treeKeyboard = undefined;
    this.treeNavigation = undefined;
    this.navigationScroll = undefined;
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.destroyControllers();
  };
}
