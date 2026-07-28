import type * as Phaser from 'phaser';
import { CanvasInput, TextAreaInput } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme.js';
import { PF2eNinePatch2 } from './PF2eNinePatch2.js';

export interface PF2eTextInputConfig {
  readonly width: number;
  readonly password?: boolean;
  readonly maximumLength?: number;
  readonly initialValue?: string;
}

function maskPassword(text: string): string {
  return '•'.repeat(Array.from(text).length);
}

export class PF2eTextInput extends TextAreaInput {
  private readonly canvasInput: CanvasInput;
  private readonly password: boolean;

  constructor(scene: Phaser.Scene, config: PF2eTextInputConfig) {
    const theme = PF2E_ELF_THEME.components.phaseSeven;
    const password = config.password ?? false;
    const input = new CanvasInput(
      scene,
      0,
      0,
      Math.max(1, config.width - theme.inputPaddingX * 2),
      theme.inputHeight,
      {
        textArea: false,
        rawText: config.initialValue ?? '',
        maxLength: config.maximumLength,
        background: {
          color: PF2E_ELF_THEME.colors.surface,
          stroke: PF2E_ELF_THEME.colors.border,
          strokeThickness: PF2E_ELF_THEME.strokes.control,
          cornerRadius: PF2E_ELF_THEME.radii.control,
          'focus.color': PF2E_ELF_THEME.colors.surface,
          'focus.stroke': PF2E_ELF_THEME.colors.accent,
          'focus.strokeThickness': PF2E_ELF_THEME.strokes.control,
          'focus.cornerRadius': PF2E_ELF_THEME.radii.control,
        },
        style: {
          color: PF2E_ELF_THEME.colors.text,
          fontFamily: PF2E_ELF_THEME.typography.body,
          fontSize: theme.inputFontSize,
          'cursor.color': theme.inputCursorColor,
          'range.backgroundColor': theme.inputSelectionColor,
        },
        wrap: {
          padding: {
            left: theme.inputPaddingX,
            right: theme.inputPaddingX,
            top: theme.inputPaddingY,
            bottom: theme.inputPaddingY,
          },
        },
        edit: {
          inputType: password ? 'password' : 'text',
          enterClose: true,
          spellCheck: false,
          autoComplete: password ? 'off' : 'on',
          onOpen: () => undefined,
          onClose: () => undefined,
          onUpdate: () => undefined,
        },
        parseTextCallback: password ? maskPassword : (text: string) => text,
      },
    );
    scene.add.existing(input);

    super(scene, {
      width: config.width,
      height: theme.inputHeight,
      background: new PF2eNinePatch2(scene, {
        variant: 'control',
        width: 2,
        height: theme.inputHeight,
      }),
      text: input,
      scroller: false,
      alwaysScrollable: false,
    });

    scene.add.existing(this);
    this.canvasInput = input;
    this.password = password;
  }
  getValue(): string {
    return this.canvasInput.rawText;
  }

  setValue(value: string): this {
    this.canvasInput.setRawText(value);
    this.canvasInput.setDisplayText(this.password ? maskPassword(value) : value);
    return this;
  }

  setInputEnabled(enabled: boolean): this {
    this.canvasInput.setReadOnly(!enabled);
    this.setAlpha(enabled ? 1 : PF2E_ELF_THEME.visualStates.disabled.alpha);
    return this;
  }
}
