import type * as Phaser from 'phaser';

import type { PF2eConfirmDialog } from '../components/PF2eConfirmDialog';
import { PF2E_ELF_THEME } from '../theme/pf2eElfTheme';

export interface PF2eConfirmDialogControllerConfig {
  readonly onConfirm?: () => void;
  readonly onCancel?: () => void;
}

export class PF2eConfirmDialogController {
  private readonly dialog: PF2eConfirmDialog;
  private readonly onConfirm?: () => void;
  private readonly onCancel?: () => void;
  private cover?: Phaser.GameObjects.Rectangle;
  private modalLayer?: Phaser.GameObjects.Layer;
  private settled = false;

  constructor(dialog: PF2eConfirmDialog, config: PF2eConfirmDialogControllerConfig = {}) {
    this.dialog = dialog;
    this.onConfirm = config.onConfirm;
    this.onCancel = config.onCancel;
    this.dialog.on('button.click', this.handleButtonClick);
  }

  open(): this {
    const theme = PF2E_ELF_THEME.components.confirmDialog;
    this.dialog.scene.game.canvas.dataset.confirmDialog = 'true';
    this.modalLayer = this.dialog.scene.add.layer().setDepth(theme.depth);
    this.cover = this.dialog.scene.add
      .rectangle(
        this.dialog.scene.scale.gameSize.width / 2,
        this.dialog.scene.scale.gameSize.height / 2,
        this.dialog.scene.scale.gameSize.width,
        this.dialog.scene.scale.gameSize.height,
        PF2E_ELF_THEME.colors.modalCover,
        theme.coverAlpha,
      )
      .setInteractive();
    this.modalLayer.add(this.cover);
    this.dialog
      .bringToTop()
      .setPosition(
        this.dialog.scene.scale.gameSize.width / 2,
        this.dialog.scene.scale.gameSize.height / 2,
      )
      .setVisible(true)
      .setScale(1)
      .layout();
    this.dialog.addToLayer(this.modalLayer);
    return this;
  }

  destroy(): void {
    this.dialog.off('button.click', this.handleButtonClick);
    this.cover?.destroy();
    this.cover = undefined;
    this.modalLayer?.destroy();
    this.modalLayer = undefined;
  }

  private readonly handleButtonClick = (
    _button: Phaser.GameObjects.GameObject,
    groupName: string,
    index: number,
  ): void => {
    if (this.settled || groupName !== 'actions') {
      return;
    }

    if (index === 0) {
      this.close();
      this.onConfirm?.();
    } else if (index === 1) {
      this.close();
      this.onCancel?.();
    }
  };

  private close(): void {
    this.settled = true;
    this.dialog.scene.game.canvas.dataset.confirmDialog = 'false';
    this.dialog.off('button.click', this.handleButtonClick).setVisible(false);
    this.cover?.destroy();
    this.cover = undefined;
    const layer = this.modalLayer;
    this.modalLayer = undefined;
    setTimeout(() => {
      if (this.dialog.scene !== undefined) {
        this.dialog.destroy();
      }
      layer?.destroy();
    }, 250);
  }
}
