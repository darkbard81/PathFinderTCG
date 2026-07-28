import type * as Phaser from 'phaser';
import { RoundRectangle } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import {
  PF2E_ELF_THEME,
  type PF2eSurfaceThemeStyle,
  type PF2eSurfaceVariant,
  type PF2eVisualState,
} from '../theme/pf2eElfTheme.js';

export interface PF2eSurfaceConfig {
  readonly variant: PF2eSurfaceVariant;
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

/**
 * 이미지 슬라이스 없이 semantic theme 값만으로 그리는 기본 UI 표면이다.
 */
export class PF2eSurface extends RoundRectangle {
  private readonly surfaceStyle: PF2eSurfaceThemeStyle;

  constructor(scene: Phaser.Scene, config: PF2eSurfaceConfig) {
    const style: PF2eSurfaceThemeStyle = PF2E_ELF_THEME.surfaces[config.variant];

    super(scene, {
      x: config.x ?? 0,
      y: config.y ?? 0,
      width: config.width,
      height: config.height,
      radius: style.radius,
      color: style.fillColor,
      alpha: style.fillAlpha,
      strokeColor: style.strokeColor,
      strokeAlpha: style.strokeAlpha,
      strokeWidth: style.strokeWidth,
    });

    scene.add.existing(this);
    this.surfaceStyle = style;
    this.setVisualState('idle');
  }

  setVisualState(state: PF2eVisualState): this {
    const visual = PF2E_ELF_THEME.visualStates[state];
    this.setFillStyle(
      this.surfaceStyle.fillColor,
      this.surfaceStyle.fillAlpha * visual.fillAlphaScale,
    );
    this.setStrokeStyle(
      this.surfaceStyle.strokeWidth,
      visual.strokeColor ?? this.surfaceStyle.strokeColor,
      this.surfaceStyle.strokeAlpha * visual.strokeAlphaScale,
    );
    return this;
  }
}
