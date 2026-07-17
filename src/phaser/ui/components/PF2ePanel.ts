import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME, type PF2eNinePatchVisualState } from '../theme/pf2eElfTheme';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2ePanelConfig {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly orientation?: 'x' | 'y';
  readonly inset?: number;
  readonly itemGap?: number;
  readonly visualState?: PF2eNinePatchVisualState;
}

export class PF2ePanel extends Sizer {
  private readonly background: PF2eNinePatch2;

  constructor(scene: Phaser.Scene, config: PF2ePanelConfig = {}) {
    const inset = config.inset ?? PF2E_ELF_THEME.spacing.panelInset;

    super(scene, {
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
      orientation: config.orientation ?? 'y',
      space: {
        left: inset,
        right: inset,
        top: inset,
        bottom: inset,
        item: config.itemGap ?? PF2E_ELF_THEME.spacing.controlGap,
      },
    });

    scene.add.existing(this);
    this.background = new PF2eNinePatch2(scene, {
      variant: 'panel',
      width: 2,
      height: 2,
    });
    this.addBackground(this.background);
    this.setVisualState(config.visualState ?? 'idle');
  }

  setVisualState(state: PF2eNinePatchVisualState): this {
    this.background.setVisualState(state);
    return this;
  }
}
