import type * as Phaser from 'phaser';
import { Label } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import {
  PF2E_ELF_THEME,
  type PF2eLabelVariant,
  type PF2eVisualState,
} from '../theme/pf2eElfTheme.js';
import { PF2eSurface } from './PF2eSurface.js';

export interface PF2eLabelConfig {
  readonly text: string;
  readonly variant: PF2eLabelVariant;
  /**
   * Minimum bounds. A parent rexUI Sizer owns the final bounds and may expand this label.
   */
  readonly width?: number;
  readonly height?: number;
  readonly fontSize?: number;
  readonly wrapWidth?: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
}

/**
 * 이미지 nine-patch 없이 semantic surface와 텍스트를 조립하는 공용 Label이다.
 */
export class PF2eLabel extends Label {
  private readonly background: PF2eSurface;
  private readonly textObject: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PF2eLabelConfig) {
    const style = PF2E_ELF_THEME.label[config.variant];
    const height = Math.max(config.height ?? style.minHeight, style.minHeight);
    const fontSize = config.fontSize ?? style.fontSize;
    const background = new PF2eSurface(scene, {
      variant: style.backgroundVariant,
      width: config.width ?? 2,
      height,
    });
    const text = scene.add.text(0, 0, config.text, {
      color: style.textColor,
      fontFamily: style.fontFamily,
      fontSize: `${fontSize}px`,
      fontStyle: style.fontStyle,
      stroke: style.strokeColor,
      strokeThickness: style.strokeThickness,
      align: 'center',
      wordWrap:
        config.wrapWidth === undefined
          ? undefined
          : {
              width: config.wrapWidth,
              useAdvancedWrap: true,
            },
    });

    super(scene, {
      width: config.width,
      height,
      background,
      text,
      align: 'center',
      space: {
        left: config.paddingX ?? style.paddingX,
        right: config.paddingX ?? style.paddingX,
        top: config.paddingY ?? style.paddingY,
        bottom: config.paddingY ?? style.paddingY,
      },
    });

    scene.add.existing(this);
    this.background = background;
    this.textObject = text;
  }

  setVisualState(state: PF2eVisualState): this {
    this.background.setVisualState(state);
    this.textObject.setAlpha(state === 'disabled' ? 0.62 : 1);
    return this;
  }
}
