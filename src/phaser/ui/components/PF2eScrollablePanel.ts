import type * as Phaser from 'phaser';
import { ScrollablePanel } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME, type PF2eNinePatchVariant } from '../theme/pf2eElfTheme';
import {
  bindPF2eScrollbarThumbStates,
  createPF2eScrollbarConfig,
} from './createPF2eScrollbarConfig';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2eScrollablePanelConfig {
  readonly child: Phaser.GameObjects.GameObject;
  readonly width?: number;
  readonly height?: number;
  readonly backgroundVariant?: PF2eNinePatchVariant;
  readonly scrollbarPosition?: 'left' | 'right';
  readonly hideScrollbarWhenUnscrollable?: boolean;
  readonly wheelSpeed?: number;
  readonly dragThreshold?: number;
  readonly onScroll?: (progress: number) => void;
}

export class PF2eScrollablePanel extends ScrollablePanel {
  private readonly onScroll?: (progress: number) => void;

  constructor(scene: Phaser.Scene, config: PF2eScrollablePanelConfig) {
    const theme = PF2E_ELF_THEME.components.scrollablePanel;
    const scrollbar = createPF2eScrollbarConfig(
      scene,
      config.scrollbarPosition ?? 'right',
      config.hideScrollbarWhenUnscrollable ?? true,
    );
    const background =
      config.backgroundVariant === undefined
        ? undefined
        : new PF2eNinePatch2(scene, {
            variant: config.backgroundVariant,
            width: 2,
            height: 2,
          });

    super(scene, {
      width: config.width,
      height: config.height,
      background,
      scrollMode: 'vertical',
      panel: {
        child: config.child,
        mask: {
          padding: theme.maskPadding,
          maskType: 'stencil',
        },
      },
      slider: scrollbar.config,
      scroller: {
        threshold: config.dragThreshold ?? theme.dragThreshold,
        pointerOutRelease: true,
      },
      mouseWheelScroller: {
        focus: true,
        speed: config.wheelSpeed ?? theme.wheelSpeed,
      },
      clampChildOY: true,
      space: {
        sliderY: theme.sliderGap,
      },
    });

    scene.add.existing(this);
    this.onScroll = config.onScroll;
    bindPF2eScrollbarThumbStates(scrollbar.thumb);
    this.on('scroll', this.handleScroll);
  }

  get scrollProgress(): number {
    return this.t;
  }

  setScrollProgress(progress: number): this {
    this.setT(progress, true);
    return this;
  }

  override setChildOY(value: number, clamp?: boolean): this {
    super.setChildOY(value, clamp);
    this.onScroll?.(this.t);
    return this;
  }

  override setT(value: number, clamp?: boolean): this {
    super.setT(value, clamp);
    this.onScroll?.(this.t);
    return this;
  }

  scrollToStart(): this {
    this.scrollToTop();
    this.onScroll?.(this.t);
    return this;
  }

  scrollToEnd(): this {
    this.scrollToBottom();
    this.onScroll?.(this.t);
    return this;
  }

  private readonly handleScroll = (): void => {
    this.onScroll?.(this.t);
  };
}
