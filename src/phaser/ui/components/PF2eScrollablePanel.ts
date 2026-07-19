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
}

export class PF2eScrollablePanel extends ScrollablePanel {
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
    bindPF2eScrollbarThumbStates(scrollbar.thumb);
  }
}
