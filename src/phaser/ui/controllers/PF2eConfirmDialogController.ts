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

  constructor(dialog: PF2eConfirmDialog, config: PF2eConfirmDialogControllerConfig = {}) {
    this.dialog = dialog;
    this.onConfirm = config.onConfirm;
    this.onCancel = config.onCancel;
    this.dialog.on('confirm', this.handleConfirm).on('cancel', this.handleCancel);
  }

  open(): this {
    const theme = PF2E_ELF_THEME.components.confirmDialog;
    this.dialog
      .setDepth(theme.depth)
      .bringToTop()
      .setPosition(
        this.dialog.scene.scale.gameSize.width / 2,
        this.dialog.scene.scale.gameSize.height / 2,
      )
      .setVisible(true)
      .setScale(1)
      .layout()
      .modal({
        cover: {
          color: PF2E_ELF_THEME.colors.modalCover,
          alpha: theme.coverAlpha,
        },
        destroy: true,
        manualClose: true,
        duration: {
          in: theme.modalInDuration,
          out: theme.modalOutDuration,
        },
      });
    return this;
  }

  destroy(): void {
    this.dialog.off('confirm', this.handleConfirm).off('cancel', this.handleCancel);
  }

  private readonly handleConfirm = (): void => {
    this.onConfirm?.();
  };

  private readonly handleCancel = (): void => {
    this.onCancel?.();
  };
}
