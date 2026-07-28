import type * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eTextInput, type PF2eTextInputConfig } from './PF2eTextInput.js';

export interface PF2eFormFieldConfig extends PF2eTextInputConfig {
  readonly label: string;
}

export class PF2eFormField extends Sizer {
  readonly textInput: PF2eTextInput;

  constructor(scene: Phaser.Scene, config: PF2eFormFieldConfig) {
    const theme = PF2E_ELF_THEME.components.phaseSeven;
    const label = scene.add.text(0, 0, config.label, {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${theme.formLabelFontSize}px`,
      fontStyle: 'bold',
    });
    const input = new PF2eTextInput(scene, config);

    super(scene, {
      width: config.width,
      orientation: 'y',
      space: {
        item: theme.formFieldGap,
      },
    });

    scene.add.existing(this);
    this.textInput = input;
    this.add(label, { align: 'left' }).add(input, { expand: true });
  }
}
