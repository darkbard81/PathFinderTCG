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
  readonly onConfirm?: () => void;
  readonly onCancel?: () => void;
}

export class PF2eConfirmDialog extends ConfirmDialog {
  private readonly onConfirm?: () => void;
  private readonly onCancel?: () => void;

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
            fontSize: '28px',
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
            fontSize: '17px',
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
            fontSize: '17px',
            fontStyle: 'bold',
          },
          align: 'center',
          space: {
            left: 24,
            right: 24,
            top: 12,
            bottom: 12,
          },
        },
        buttonB: {
          width: theme.actionWidth,
          height: PF2E_ELF_THEME.components.buttons.height,
          background: {},
          text: {
            color: PF2E_ELF_THEME.colors.text,
            fontFamily: PF2E_ELF_THEME.typography.body,
            fontSize: '17px',
            fontStyle: 'bold',
          },
          align: 'center',
          space: {
            left: 24,
            right: 24,
            top: 12,
            bottom: 12,
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
        modal: {
          cover: {
            color: PF2E_ELF_THEME.colors.modalCover,
            alpha: theme.coverAlpha,
          },
          destroy: true,
          manualClose: true,
          duration: {
            in: 140,
            out: 110,
          },
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
    this.onConfirm = config.onConfirm;
    this.onCancel = config.onCancel;
    this.on('confirm', this.handleConfirm).on('cancel', this.handleCancel);
    this.resetDisplayContent({
      title: config.title,
      content: config.message,
      buttonA: config.confirmText ?? '확인',
      buttonB: config.cancelText ?? '취소',
    });
    this.layout().setVisible(false);
  }

  openModal(): this {
    this.setDepth(PF2E_ELF_THEME.components.confirmDialog.depth)
      .bringToTop()
      .setPosition(this.scene.scale.gameSize.width / 2, this.scene.scale.gameSize.height / 2)
      .setVisible(true)
      .setScale(1)
      .layout()
      .modal();
    return this;
  }

  private readonly handleConfirm = (): void => {
    this.onConfirm?.();
  };

  private readonly handleCancel = (): void => {
    this.onCancel?.();
  };
}
