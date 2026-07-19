import type * as Phaser from 'phaser';

import type { PF2eTabPages } from '../components/PF2eTabPages';

export interface PF2eTabPagesControllerConfig {
  readonly initialPageId: string;
  readonly onPageChange?: (pageId: string) => void;
}

export class PF2eTabPagesController {
  private readonly tabPages: PF2eTabPages;
  private readonly onPageChange?: (pageId: string) => void;

  constructor(tabPages: PF2eTabPages, config: PF2eTabPagesControllerConfig) {
    this.tabPages = tabPages;
    this.onPageChange = config.onPageChange;
    this.tabPages.on('tab.focus', this.handleTabFocus);
    this.selectPage(config.initialPageId);
  }

  selectPage(pageId: string): this {
    if (!this.tabPages.keys.includes(pageId)) {
      throw new Error(`Unknown PF2e tab page: ${pageId}`);
    }
    if (this.tabPages.currentKey !== pageId) {
      this.tabPages.swapPage(pageId, 0);
    }
    return this;
  }

  destroy(): void {
    this.tabPages.off('tab.focus', this.handleTabFocus);
  }

  private readonly handleTabFocus = (_tab: Phaser.GameObjects.GameObject, pageId: string): void => {
    this.onPageChange?.(pageId);
  };
}
