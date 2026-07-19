import type * as Phaser from 'phaser';
import { ConfirmDialog } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme';
import { PF2eNinePatch2 } from './PF2eNinePatch2';

export interface PF2eConfirmDialogConfig {
  readonly title: string;
  readonly message: string;
  readonly confirmText?: string;
  readonly cancelText?: string;
  readonly danger?: boolean;
  readonly width?: number;
  readonly height?: number;
}

export class PF2eConfirmDialog extends ConfirmDialog {
  constructor(scene: Phaser.Scene, config: PF2eConfirmDialogConfig) {
    const theme = PF2E_ELF_THEME.components.confirmDialog;
    const width = config.width ?? 620;
    const height = config.height ?? 420;
    const contentWidth = Math.max(160, width - theme.inset * 2);
    const buttonTextColor = config.danger
      ? PF2E_ELF_THEME.colors.dangerText
      : PF2E_ELF_THEME.colors.text;

    super(
      scene,
      {
        width,
        height,
        background: {},
        title: {
          width: contentWidth,
          text: {
            color: PF2E_ELF_THEME.colors.text,
            fontFamily: PF2E_ELF_THEME.typography.display,
            fontSize: `${theme.titleFontSize}px`,
            fontStyle: 'bold',
            align: 'center',
          },
          expandTextWidth: true,
          align: 'center',
        },
        content: {
          width: contentWidth,
          text: {
            color: PF2E_ELF_THEME.colors.mutedText,
            fontFamily: PF2E_ELF_THEME.typography.body,
            fontSize: `${theme.contentFontSize}px`,
            lineSpacing: 7,
            align: 'center',
            wordWrap: {
              width: contentWidth,
            },
          },
          expandTextWidth: true,
          wrapText: true,
          align: 'center',
        },
        buttonMode: 2,
        buttonA: {
          width: theme.actionWidth,
          height: PF2E_ELF_THEME.components.buttons.height,
          background: {},
          text: {
            color: buttonTextColor,
            fontFamily: PF2E_ELF_THEME.typography.body,
            fontSize: `${theme.buttonFontSize}px`,
            fontStyle: 'bold',
          },
          align: 'center',
          space: {
            left: theme.buttonPaddingX,
            right: theme.buttonPaddingX,
            top: theme.buttonPaddingY,
            bottom: theme.buttonPaddingY,
          },
        },
        buttonB: {
          width: theme.actionWidth,
          height: PF2E_ELF_THEME.components.buttons.height,
          background: {},
          text: {
            color: PF2E_ELF_THEME.colors.text,
            fontFamily: PF2E_ELF_THEME.typography.body,
            fontSize: `${theme.buttonFontSize}px`,
            fontStyle: 'bold',
          },
          align: 'center',
          space: {
            left: theme.buttonPaddingX,
            right: theme.buttonPaddingX,
            top: theme.buttonPaddingY,
            bottom: theme.buttonPaddingY,
          },
        },
        expand: {
          title: true,
          content: true,
        },
        align: {
          title: 'center',
          content: 'center',
          actions: 'center',
        },
        space: {
          left: theme.inset,
          right: theme.inset,
          top: theme.inset,
          bottom: theme.inset,
          title: theme.titleGap,
          content: theme.contentGap,
          action: theme.actionGap,
        },
        click: {
          mode: 'release',
        },
      },
      {
        background: (ownerScene) =>
          new PF2eNinePatch2(ownerScene, {
            variant: 'dialog',
            width: 2,
            height: 2,
          }),
        buttonA: {
          background: (ownerScene) =>
            new PF2eNinePatch2(ownerScene, {
              variant: 'button',
              width: 2,
              height: 2,
            }),
        },
        buttonB: {
          background: (ownerScene) =>
            new PF2eNinePatch2(ownerScene, {
              variant: 'button',
              width: 2,
              height: 2,
            }),
        },
      },
    );

    scene.add.existing(this);
    this.resetDisplayContent({
      title: config.title,
      content: config.message,
      buttonA: config.confirmText ?? '확인',
      buttonB: config.cancelText ?? '취소',
    });
  }
}
