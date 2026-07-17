import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { PF2eNinePatchVisualState } from '../theme/pf2eElfTheme';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export type PF2eScrollbarPartVariant = 'scrollTrack' | 'scrollThumb';

export interface PF2eScrollbarPartConfig {
  readonly variant: PF2eScrollbarPartVariant;
  readonly width: number;
  readonly height: number;
}

export class PF2eScrollbarPart extends Sizer {
  private readonly background: PF2eNinePatch2;

  constructor(scene: Phaser.Scene, config: PF2eScrollbarPartConfig) {
    super(scene, {
      width: config.width,
      height: config.height,
    });

    scene.add.existing(this);
    this.background = new PF2eNinePatch2(scene, {
      variant: config.variant,
      width: 2,
      height: 2,
    });
    this.addBackground(this.background);
  }

  setVisualState(state: PF2eNinePatchVisualState): this {
    this.background.setVisualState(state);
    return this;
  }
}
