import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eButtons } from './PF2eButtons.js';
import { PF2eFormField } from './PF2eFormField.js';
import { PF2ePanel } from './PF2ePanel.js';

export interface PF2eAuthPanelConfig {
  readonly width: number;
  readonly compact: boolean;
}

export class PF2eAuthPanel extends Sizer {
  readonly usernameField: PF2eFormField;
  readonly passwordField: PF2eFormField;
  readonly buttons: PF2eButtons;

  constructor(scene: Phaser.Scene, config: PF2eAuthPanelConfig) {
    const theme = PF2E_ELF_THEME.components.phaseSeven;
    const fieldWidth = Math.max(
      220,
      Math.min(theme.formWidth, config.width - theme.formSectionGap * 2),
    );
    const usernameField = new PF2eFormField(scene, {
      label: '사용자명',
      width: fieldWidth,
      maximumLength: 24,
    });
    const passwordField = new PF2eFormField(scene, {
      label: '비밀번호',
      width: fieldWidth,
      password: true,
      maximumLength: 128,
    });
    const buttons = new PF2eButtons(scene, {
      orientation: config.compact ? 'y' : 'x',
      buttons: [
        {
          id: 'login',
          text: '로그인',
          variant: 'primary',
        },
        {
          id: 'register',
          text: '가입 후 로그인',
          variant: 'primary',
        },
      ],
    });
    const panel = new PF2ePanel(scene, {
      width: Math.min(config.width, fieldWidth + theme.formSectionGap * 2),
      orientation: 'y',
      inset: theme.formSectionGap,
      itemGap: theme.formSectionGap,
    });
    panel
      .add(usernameField, { align: 'center', expand: true })
      .add(passwordField, { align: 'center', expand: true })
      .add(buttons, { align: 'center', expand: true });

    super(scene, {
      width: config.width,
      orientation: 'y',
    });

    scene.add.existing(this);
    this.usernameField = usernameField;
    this.passwordField = passwordField;
    this.buttons = buttons;
    this.add(panel, { align: 'center' });
  }

  getCredentials(): { readonly username: string; readonly password: string } {
    return Object.freeze({
      username: this.usernameField.textInput.getValue(),
      password: this.passwordField.textInput.getValue(),
    });
  }

  setEnabled(enabled: boolean): this {
    this.usernameField.textInput.setInputEnabled(enabled);
    this.passwordField.textInput.setInputEnabled(enabled);
    for (const buttonId of ['login', 'register']) {
      const button = this.buttons.getButtonById(buttonId);
      this.buttons.setButtonEnable(button, enabled);
    }
    return this;
  }
}
