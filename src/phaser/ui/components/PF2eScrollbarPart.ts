import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import type { PF2eVisualState } from '../theme/pf2eElfTheme';
import { PF2eSurface } from './PF2eSurface';

export type PF2eScrollbarPartVariant = 'scrollTrack' | 'scrollThumb';

export interface PF2eScrollbarPartConfig {
  readonly variant: PF2eScrollbarPartVariant;
  readonly width: number;
  readonly height: number;
}

export class PF2eScrollbarPart extends Sizer {
  private readonly background: PF2eSurface;

  constructor(scene: Phaser.Scene, config: PF2eScrollbarPartConfig) {
    super(scene, {
      width: config.width,
      height: config.height,
    });

    scene.add.existing(this);
    this.background = new PF2eSurface(scene, {
      variant: config.variant,
      width: 2,
      height: 2,
    });
    this.addBackground(this.background);
    this.resize(config.width, config.height);
  }

  resize(width: number, height: number): this {
    super.setSize(width, height);
    this.background.resize(width, height);
    return this;
  }

  setVisualState(state: PF2eVisualState): this {
    this.background.setVisualState(state);
    return this;
  }
}
