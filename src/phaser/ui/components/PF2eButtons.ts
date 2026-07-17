import type * as Phaser from 'phaser';
import { Buttons } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME, type PF2eNineLabelVariant } from '../theme/pf2eElfTheme';
import { PF2eNineLabel } from './PF2eNineLabel';

export interface PF2eButtonDefinition {
  readonly id: string;
  readonly text: string;
  readonly variant?: Extract<PF2eNineLabelVariant, 'primary' | 'danger'>;
  readonly enabled?: boolean;
}

export interface PF2eButtonsConfig {
  readonly buttons: readonly [PF2eButtonDefinition, ...PF2eButtonDefinition[]];
  readonly orientation?: 'x' | 'y';
  readonly width?: number;
  readonly height?: number;
  readonly buttonWidth?: number;
  readonly onButtonClick?: (buttonId: string) => void;
}

export class PF2eButtons extends Buttons {
  private readonly buttonById: Map<string, PF2eNineLabel>;
  private readonly onButtonClick?: (buttonId: string) => void;

  constructor(scene: Phaser.Scene, config: PF2eButtonsConfig) {
    const theme = PF2E_ELF_THEME.components.buttons;
    const buttonById = new Map<string, PF2eNineLabel>();
    const buttonObjects = config.buttons.map((definition) => {
      if (buttonById.has(definition.id)) {
        throw new Error(`Duplicate PF2e button id: ${definition.id}`);
      }

      const button = new PF2eNineLabel(scene, {
        text: definition.text,
        variant: definition.variant ?? 'primary',
        width: config.buttonWidth ?? theme.width,
        height: theme.height,
        enabled: definition.enabled,
      }).setName(definition.id);
      buttonById.set(definition.id, button);
      return button;
    });

    super(scene, {
      width: config.width,
      height: config.height,
      orientation: config.orientation ?? 'x',
      buttons: buttonObjects,
      space: {
        item: theme.gap,
      },
      click: {
        mode: 'release',
        threshold: 10,
      },
      align: 'center',
    });

    scene.add.existing(this);
    this.buttonById = buttonById;
    this.onButtonClick = config.onButtonClick;
    this.on('button.over', this.handleButtonOver)
      .on('button.out', this.handleButtonOut)
      .on('button.down', this.handleButtonDown)
      .on('button.up', this.handleButtonUp)
      .on('button.enable', this.handleButtonEnable)
      .on('button.disable', this.handleButtonDisable)
      .on('button.click', this.handleButtonClick);

    for (const definition of config.buttons) {
      this.setButtonEnabled(definition.id, definition.enabled ?? true);
    }
  }

  setButtonEnabled(buttonId: string, enabled: boolean): this {
    const button = this.getPF2eButton(buttonId);
    this.setButtonEnable(button, enabled);
    button.setEnabled(enabled);
    return this;
  }

  private getPF2eButton(buttonId: string): PF2eNineLabel {
    const button = this.buttonById.get(buttonId);
    if (!button) {
      throw new Error(`Unknown PF2e button: ${buttonId}`);
    }
    return button;
  }

  private readonly handleButtonOver = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel && this.getButtonEnable(button)) {
      button.setVisualState('hover');
    }
  };

  private readonly handleButtonOut = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel && this.getButtonEnable(button)) {
      button.setVisualState('idle');
    }
  };

  private readonly handleButtonDown = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel && this.getButtonEnable(button)) {
      button.setVisualState('pressed');
    }
  };

  private readonly handleButtonUp = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel && this.getButtonEnable(button)) {
      button.setVisualState('hover');
    }
  };

  private readonly handleButtonEnable = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel) {
      button.setEnabled(true);
    }
  };

  private readonly handleButtonDisable = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel) {
      button.setEnabled(false);
    }
  };

  private readonly handleButtonClick = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel) {
      button.setVisualState('hover');
      this.onButtonClick?.(button.name);
    }
  };
}
