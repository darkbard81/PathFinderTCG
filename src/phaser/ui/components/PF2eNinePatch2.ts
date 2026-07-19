import type * as Phaser from 'phaser';
import { NinePatch2 } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import {
  PF2E_ELF_THEME,
  type PF2eNinePatchThemeStyle,
  type PF2eNinePatchVariant,
  type PF2eNinePatchVisualState,
} from '../theme/pf2eElfTheme';

export interface PF2eNinePatch2Config {
  readonly variant: PF2eNinePatchVariant;
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

export class PF2eNinePatch2 extends NinePatch2 {
  constructor(scene: Phaser.Scene, config: PF2eNinePatch2Config) {
    const style: PF2eNinePatchThemeStyle = PF2E_ELF_THEME.ninePatch[config.variant];

    super(scene, {
      x: config.x ?? 0,
      y: config.y ?? 0,
      width: config.width,
      height: config.height,
      key: style.key,
      columns: [...style.columns],
      rows: [...style.rows],
      preserveRatio: true,
      maxFixedPartScale: 1,
      stretchMode: style.stretchMode ?? PF2E_ELF_THEME.ninePatchStretchMode,
    });

    scene.add.existing(this);
    this.setVisualState('idle');
  }

  setVisualState(state: PF2eNinePatchVisualState): this {
    const style = PF2E_ELF_THEME.visualStates[state];
    this.setTint(style.tint);
    this.setAlpha(style.alpha);
    return this;
  }
}
