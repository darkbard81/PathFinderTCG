import type * as Phaser from 'phaser';
import { Buttons } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME, type PF2eLabelVariant } from '../theme/pf2eElfTheme';
import { PF2eLabel } from './PF2eLabel';

export interface PF2eButtonDefinition {
  readonly id: string;
  readonly text: string;
  readonly variant?: Extract<PF2eLabelVariant, 'primary' | 'danger'>;
  readonly fontSize?: number;
  readonly paddingX?: number;
}

export interface PF2eButtonsConfig {
  readonly buttons: readonly [PF2eButtonDefinition, ...PF2eButtonDefinition[]];
  readonly orientation?: 'x' | 'y';
  /**
   * Minimum group bounds. A parent rexUI Sizer owns the final bounds and distributes them.
   */
  readonly width?: number;
  readonly height?: number;
}

export class PF2eButtons extends Buttons {
  private readonly buttonById: Map<string, PF2eLabel>;

  constructor(scene: Phaser.Scene, config: PF2eButtonsConfig) {
    const theme = PF2E_ELF_THEME.components.buttons;
    const buttonById = new Map<string, PF2eLabel>();
    const buttonObjects = config.buttons.map((definition) => {
      if (buttonById.has(definition.id)) {
        throw new Error(`Duplicate PF2e button id: ${definition.id}`);
      }

      const button = new PF2eLabel(scene, {
        text: definition.text,
        variant: definition.variant ?? 'primary',
        height: theme.height,
        fontSize: definition.fontSize,
        paddingX: definition.paddingX,
      }).setName(definition.id);
      buttonById.set(definition.id, button);
      return button;
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: config.orientation ?? 'x',
      buttons: buttonObjects,
      expand: true,
      space: {
        item: theme.gap,
      },
      click: {
        mode: 'release',
        threshold: 10,
      },
    });

    scene.add.existing(this);
    this.buttonById = buttonById;
    this.on('button.over', this.handleButtonOver)
      .on('button.out', this.handleButtonOut)
      .on('button.down', this.handleButtonDown)
      .on('button.up', this.handleButtonUp)
      .on('button.enable', this.handleButtonEnable)
      .on('button.disable', this.handleButtonDisable);
  }

  getButtonById(buttonId: string): PF2eLabel {
    const button = this.buttonById.get(buttonId);
    if (!button) {
      throw new Error(`Unknown PF2e button: ${buttonId}`);
    }
    return button;
  }

  private readonly handleButtonOver = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eLabel && this.getButtonEnable(button)) {
      button.setVisualState('hover');
    }
  };

  private readonly handleButtonOut = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eLabel && this.getButtonEnable(button)) {
      button.setVisualState('idle');
    }
  };

  private readonly handleButtonDown = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eLabel && this.getButtonEnable(button)) {
      button.setVisualState('pressed');
    }
  };

  private readonly handleButtonUp = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eLabel && this.getButtonEnable(button)) {
      button.setVisualState('hover');
    }
  };

  private readonly handleButtonEnable = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eLabel) {
      button.setVisualState('idle');
    }
  };

  private readonly handleButtonDisable = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eLabel) {
      button.setVisualState('disabled');
    }
  };
}
