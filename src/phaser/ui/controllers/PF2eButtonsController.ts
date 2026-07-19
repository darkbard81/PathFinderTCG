import type * as Phaser from 'phaser';

import type { PF2eButtons } from '../components/PF2eButtons';
import { PF2eNineLabel } from '../components/PF2eNineLabel';

export interface PF2eButtonsControllerConfig {
  readonly disabledButtonIds?: readonly string[];
  readonly onButtonClick?: (buttonId: string) => void;
}

export class PF2eButtonsController {
  private readonly buttons: PF2eButtons;
  private readonly onButtonClick?: (buttonId: string) => void;

  constructor(buttons: PF2eButtons, config: PF2eButtonsControllerConfig = {}) {
    this.buttons = buttons;
    this.onButtonClick = config.onButtonClick;
    this.buttons.on('button.click', this.handleButtonClick);

    for (const buttonId of config.disabledButtonIds ?? []) {
      this.setButtonEnabled(buttonId, false);
    }
  }

  setButtonEnabled(buttonId: string, enabled: boolean): this {
    const button = this.buttons.getButtonById(buttonId);
    this.buttons.setButtonEnable(button, enabled);
    return this;
  }

  destroy(): void {
    this.buttons.off('button.click', this.handleButtonClick);
  }

  private readonly handleButtonClick = (button: Phaser.GameObjects.GameObject): void => {
    if (button instanceof PF2eNineLabel) {
      this.onButtonClick?.(button.name);
    }
  };
}
