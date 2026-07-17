import * as Phaser from 'phaser';
import { TabPages } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme';
import { PF2eNineLabel } from './PF2eNineLabel';

export type PF2eTabPosition = 'top' | 'bottom' | 'left' | 'right';

export interface PF2eTabPageDefinition {
  readonly id: string;
  readonly title: string;
  readonly page: Phaser.GameObjects.GameObject;
}

export interface PF2eTabPagesConfig {
  readonly width?: number;
  readonly height?: number;
  readonly tabPosition?: PF2eTabPosition;
  readonly wrapTabs?: boolean;
  readonly pages: readonly [PF2eTabPageDefinition, ...PF2eTabPageDefinition[]];
  readonly initialPageId?: string;
  readonly onPageChange?: (pageId: string) => void;
}

export class PF2eTabPages extends TabPages {
  private readonly tabById = new Map<string, PF2eNineLabel>();
  private readonly onPageChange?: (pageId: string) => void;
  private selectedId = '';

  constructor(scene: Phaser.Scene, config: PF2eTabPagesConfig) {
    const theme = PF2E_ELF_THEME.components.tabPages;
    const tabPosition = config.tabPosition ?? 'top';
    const wrapTabs = config.wrapTabs ?? (tabPosition === 'top' || tabPosition === 'bottom');
    const tabBarBounds = scene.add
      .rectangle(0, 0, 2, 2, PF2E_ELF_THEME.colors.backdrop, 0)
      .setStrokeStyle(PF2E_ELF_THEME.strokes.control, PF2E_ELF_THEME.colors.accent);

    super(scene, {
      width: config.width,
      height: config.height,
      tabPosition,
      wrapTabs,
      expand: {
        tabs: true,
      },
      align: {
        tabs: 'center',
      },
      tabs: {
        // Temporary outline for verifying the rexUI tab-bar layout bounds.
        background: tabBarBounds,
        space: {
          item: theme.tabGap,
        },
      },
      pages: {
        fadeIn: 0,
        swapMode: 'invisible',
      },
      space: {
        left: theme.inset,
        right: theme.inset,
        top: theme.inset,
        bottom: theme.inset,
        item: theme.pageGap,
      },
    });

    scene.add.existing(this);
    this.onPageChange = config.onPageChange;

    for (const definition of config.pages) {
      if (this.tabById.has(definition.id)) {
        throw new Error(`Duplicate PF2e tab page id: ${definition.id}`);
      }

      const tab = new PF2eNineLabel(scene, {
        text: definition.title,
        variant: 'tab',
        width: theme.tabWidth,
        height: theme.tabHeight,
      });
      this.bindTabPointerStates(tab, definition.id);
      this.tabById.set(definition.id, tab);
      this.addPage(definition.id, tab, definition.page);
    }

    this.on('tab.focus', this.handleTabFocus);
    this.on('tab.blur', this.handleTabBlur);
    this.layout();
    this.setSelectedPage(config.initialPageId ?? config.pages[0].id);
  }

  get selectedPageId(): string {
    return this.selectedId;
  }

  setSelectedPage(pageId: string): this {
    if (!this.tabById.has(pageId)) {
      throw new Error(`Unknown PF2e tab page: ${pageId}`);
    }
    if (this.selectedId === pageId && this.currentKey === pageId) {
      return this;
    }

    this.swapPage(pageId, 0);
    return this;
  }

  private bindTabPointerStates(tab: PF2eNineLabel, pageId: string): void {
    tab
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        tab.setVisualState(this.selectedId === pageId ? 'selected' : 'hover');
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        tab.setVisualState(this.selectedId === pageId ? 'selected' : 'idle');
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        tab.setVisualState('pressed');
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        tab.setVisualState(this.selectedId === pageId ? 'selected' : 'hover');
      });
  }

  private readonly handleTabFocus = (tab: Phaser.GameObjects.GameObject, pageId: string): void => {
    this.selectedId = pageId;
    if (tab instanceof PF2eNineLabel) {
      tab.setVisualState('selected');
    }
    this.onPageChange?.(pageId);
  };

  private readonly handleTabBlur = (tab: Phaser.GameObjects.GameObject, pageId: string): void => {
    if (tab instanceof PF2eNineLabel && this.selectedId !== pageId) {
      tab.setVisualState('idle');
    }
  };
}
