import type * as Phaser from 'phaser';
import {
  Buttons,
  FixWidthButtons,
  TabPages,
} from 'phaser4-rex-plugins/templates/ui/ui-components.js';

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
}

export class PF2eTabPages extends TabPages {
  constructor(scene: Phaser.Scene, config: PF2eTabPagesConfig) {
    const theme = PF2E_ELF_THEME.components.tabPages;
    const tabPosition = config.tabPosition ?? 'top';
    const wrapTabs = config.wrapTabs ?? (tabPosition === 'top' || tabPosition === 'bottom');

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
    const pageIds = new Set<string>();

    for (const definition of config.pages) {
      if (pageIds.has(definition.id)) {
        throw new Error(`Duplicate PF2e tab page id: ${definition.id}`);
      }

      const tab = new PF2eNineLabel(scene, {
        text: definition.title,
        variant: 'tab',
        width: theme.tabWidth,
        height: theme.tabHeight,
      });
      pageIds.add(definition.id);
      this.addPage(definition.id, tab, definition.page);
    }

    this.on('tab.focus', this.handleTabFocus);
    this.on('tab.blur', this.handleTabBlur);
    const tabs = this.getElement('tabs');
    if (!(tabs instanceof Buttons) && !(tabs instanceof FixWidthButtons)) {
      throw new Error('PF2eTabPages could not resolve its rexUI tabs container');
    }
    tabs
      .on('button.over', this.handleTabOver)
      .on('button.out', this.handleTabOut)
      .on('button.down', this.handleTabDown)
      .on('button.up', this.handleTabUp);
    this.layout();
  }

  private readonly handleTabFocus = (tab: Phaser.GameObjects.GameObject): void => {
    if (tab instanceof PF2eNineLabel) {
      tab.setVisualState('selected');
    }
  };

  private readonly handleTabBlur = (tab: Phaser.GameObjects.GameObject, pageId: string): void => {
    if (tab instanceof PF2eNineLabel && this.currentKey !== pageId) {
      tab.setVisualState('idle');
    }
  };

  private readonly handleTabOver = (tab: Phaser.GameObjects.GameObject): void => {
    if (tab instanceof PF2eNineLabel) {
      tab.setVisualState(this.currentKey === tab.name ? 'selected' : 'hover');
    }
  };

  private readonly handleTabOut = (tab: Phaser.GameObjects.GameObject): void => {
    if (tab instanceof PF2eNineLabel) {
      tab.setVisualState(this.currentKey === tab.name ? 'selected' : 'idle');
    }
  };

  private readonly handleTabDown = (tab: Phaser.GameObjects.GameObject): void => {
    if (tab instanceof PF2eNineLabel) {
      tab.setVisualState('pressed');
    }
  };

  private readonly handleTabUp = (tab: Phaser.GameObjects.GameObject): void => {
    if (tab instanceof PF2eNineLabel) {
      tab.setVisualState(this.currentKey === tab.name ? 'selected' : 'hover');
    }
  };
}
