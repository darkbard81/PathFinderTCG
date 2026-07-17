import * as Phaser from 'phaser';
import { Label } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import {
  PF2E_ELF_THEME,
  type PF2eNineLabelVariant,
  type PF2eNinePatchVisualState,
} from '../theme/pf2eElfTheme';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2eNineLabelConfig {
  readonly text: string;
  readonly variant: PF2eNineLabelVariant;
  /**
   * Minimum bounds. A parent rexUI Sizer owns the final bounds and may expand this label.
   */
  readonly width?: number;
  readonly height?: number;
  readonly fontSize?: number;
  readonly wrapWidth?: number;
  readonly onActivate?: () => void;
  readonly enabled?: boolean;
}

export class PF2eNineLabel extends Label {
  private readonly background: PF2eNinePatch2;
  private readonly textObject: Phaser.GameObjects.Text;
  private readonly onActivate?: () => void;
  private enabled: boolean;

  constructor(scene: Phaser.Scene, config: PF2eNineLabelConfig) {
    const style = PF2E_ELF_THEME.label[config.variant];
    const height = Math.max(config.height ?? style.minHeight, style.minHeight);
    const fontSize = config.fontSize ?? style.fontSize;
    const background = new PF2eNinePatch2(scene, {
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
        left: style.paddingX,
        right: style.paddingX,
        top: style.paddingY,
        bottom: style.paddingY,
      },
    });

    scene.add.existing(this);
    this.background = background;
    this.textObject = text;
    this.onActivate = config.onActivate;
    this.enabled = config.enabled ?? true;

    if (this.onActivate) {
      this.setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, this.handlePointerOver)
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, this.handlePointerOut)
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.handlePointerDown)
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, this.handlePointerUp);
    }

    this.setEnabled(this.enabled);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    if (this.onActivate) {
      if (enabled) {
        this.setInteractive({ useHandCursor: true });
      } else {
        this.disableInteractive();
      }
    }
    this.setVisualState(enabled ? 'idle' : 'disabled');
    return this;
  }

  setVisualState(state: PF2eNinePatchVisualState): this {
    this.background.setVisualState(state);
    this.textObject.setAlpha(state === 'disabled' ? 0.62 : 1);
    return this;
  }

  private readonly handlePointerOver = (): void => {
    if (this.enabled) {
      this.setVisualState('hover');
    }
  };

  private readonly handlePointerOut = (): void => {
    if (this.enabled) {
      this.setVisualState('idle');
    }
  };

  private readonly handlePointerDown = (): void => {
    if (this.enabled) {
      this.setVisualState('pressed');
    }
  };

  private readonly handlePointerUp = (): void => {
    if (!this.enabled) {
      return;
    }
    this.setVisualState('hover');
    this.onActivate?.();
  };
}
