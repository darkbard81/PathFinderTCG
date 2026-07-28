import * as Phaser from 'phaser';

import {
  PathfinderApiError,
  type SaveSlotId,
  type SaveSlotSummary,
} from '../../game/client/PathfinderApiClient.js';
import { calculatePhaseSevenLayout } from '../../ui/layout/phaseSevenLayout.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import { PF2eConfirmDialog } from '../ui/components/PF2eConfirmDialog.js';
import { PF2eSaveSlotPanel } from '../ui/components/PF2eSaveSlotPanel.js';
import { PF2eScreenPanel } from '../ui/components/PF2eScreenPanel.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import { PF2eConfirmDialogController } from '../ui/controllers/PF2eConfirmDialogController.js';
import { PF2eGridTableSelectionController } from '../ui/controllers/PF2eGridTableSelectionController.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

function parseSelectedSlotId(itemId: string): SaveSlotId {
  const slotId = Number(itemId);

  if (slotId !== 1 && slotId !== 2 && slotId !== 3) {
    throw new Error(`알 수 없는 세이브 슬롯입니다: ${itemId}`);
  }

  return slotId;
}

function errorMessage(error: unknown): string {
  if (error instanceof PathfinderApiError || error instanceof Error) {
    return error.message;
  }

  return '세이브 슬롯 요청을 처리하지 못했습니다.';
}

export class SaveSlotScene extends Phaser.Scene {
  private screen?: PF2eScreenPanel;
  private buttonsController?: PF2eButtonsController;
  private selectionController?: PF2eGridTableSelectionController;
  private selectedSlotId: SaveSlotId | null = null;
  private summaries: readonly SaveSlotSummary[] = Object.freeze([]);
  private status = '세이브 슬롯을 불러오는 중입니다…';
  private statusDanger = false;
  private busy = false;

  constructor() {
    super('SaveSlotScene');
  }

  create(): void {
    const session = getGameSession(this);

    if (session.getState().user === null) {
      this.scene.start('LoginScene');
      return;
    }

    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    void this.loadSummaries();
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private rebuildLayout(width: number, height: number): void {
    const layout = calculatePhaseSevenLayout(width, height);
    const user = getGameSession(this).getState().user;

    this.buttonsController?.destroy();
    this.selectionController?.destroy();
    this.screen?.destroy();
    this.buttonsController = undefined;
    this.selectionController = undefined;
    this.screen = undefined;

    const slotPanel = new PF2eSaveSlotPanel(this, {
      width: Math.max(220, layout.rootWidth - layout.panelInset * 2),
      height: layout.listHeight,
      summaries: this.summaries,
      columns:
        layout.orientation === 'landscape'
          ? PF2E_ELF_THEME.components.phaseSeven.listColumnsLandscape
          : PF2E_ELF_THEME.components.phaseSeven.listColumnsPortrait,
      compactActions: layout.orientation === 'portrait',
    });
    const screen = new PF2eScreenPanel(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      inset: layout.panelInset,
      gap: layout.gap,
      title: '세이브 슬롯',
      subtitle: `${user?.username ?? '사용자'} · 슬롯은 계정별로 3개까지 사용할 수 있습니다.`,
      titleFontSize: layout.titleFontSize,
      bodyFontSize: layout.bodyFontSize,
      content: slotPanel,
    })
      .setPosition(width / 2, height / 2)
      .layout();
    screen.setStatus(this.status, this.statusDanger ? 'danger' : 'normal');

    this.selectionController = new PF2eGridTableSelectionController(slotPanel.table, {
      items: slotPanel.items,
      initialSelectedId: this.selectedSlotId === null ? undefined : String(this.selectedSlotId),
      onSelectionChange: (item) => {
        this.selectedSlotId = parseSelectedSlotId(item.id);
        this.updateButtonStates();
      },
    });
    this.buttonsController = new PF2eButtonsController(slotPanel.buttons, {
      onButtonClick: (buttonId) => {
        switch (buttonId) {
          case 'enter':
            void this.enterSelectedSlot();
            break;
          case 'reset':
            this.confirmReset();
            break;
          case 'logout':
            void this.logout();
            break;
        }
      },
    });
    this.screen = screen;
    this.updateButtonStates();
    this.game.canvas.dataset.scene = 'save-slot';
    this.game.canvas.dataset.orientation = layout.orientation;
  }

  private async loadSummaries(): Promise<void> {
    this.setBusy(true, '세이브 슬롯을 불러오는 중입니다…');

    try {
      this.summaries = await getGameSession(this).refreshSaveSlots();
      this.selectedSlotId ??= 1;
      this.status = '슬롯을 선택해 계속하거나 빈 슬롯에 새 게임을 만드세요.';
      this.statusDanger = false;
      this.busy = false;
      this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    } catch (error: unknown) {
      if (
        error instanceof PathfinderApiError &&
        error.code === 'UNAUTHENTICATED' &&
        this.scene.isActive()
      ) {
        this.scene.start('LoginScene', { status: error.message });
        return;
      }

      this.setBusy(false, errorMessage(error), true);
    }
  }

  private async enterSelectedSlot(): Promise<void> {
    const summary = this.getSelectedSummary();

    if (summary === undefined || this.busy) {
      return;
    }

    this.setBusy(
      true,
      summary.status === 'EMPTY' ? '새 게임을 만드는 중입니다…' : '슬롯을 여는 중입니다…',
    );

    try {
      const session = getGameSession(this);
      if (summary.status === 'EMPTY') {
        await session.createSaveSlot(summary.slotId);
      } else {
        await session.openSaveSlot(summary.slotId);
      }

      if (this.scene.isActive()) {
        this.scene.start('StageScene');
      }
    } catch (error: unknown) {
      this.setBusy(false, errorMessage(error), true);
    }
  }

  private confirmReset(): void {
    const summary = this.getSelectedSummary();

    if (summary?.status !== 'OCCUPIED' || this.busy) {
      return;
    }

    const dialog = new PF2eConfirmDialog(this, {
      title: `슬롯 ${summary.slotId} 초기화`,
      message:
        '이 슬롯의 카드 컬렉션과 덱 진행을 모두 삭제합니다. 삭제한 데이터는 복구할 수 없습니다.',
      confirmText: '초기화',
      cancelText: '취소',
      danger: true,
      width: Math.min(620, Math.max(300, this.scale.gameSize.width - 40)),
      height: Math.min(420, Math.max(320, this.scale.gameSize.height - 40)),
    });
    new PF2eConfirmDialogController(dialog, {
      onConfirm: () => {
        void this.resetSelectedSlot(summary.slotId);
      },
    }).open();
  }

  private async resetSelectedSlot(slotId: SaveSlotId): Promise<void> {
    this.setBusy(true, `슬롯 ${slotId}을 초기화하는 중입니다…`);

    try {
      const session = getGameSession(this);
      await session.deleteSaveSlot(slotId);
      this.summaries = session.getState().saveSlots;
      this.status = `슬롯 ${slotId}을 초기화했습니다.`;
      this.statusDanger = false;
      this.busy = false;
      this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    } catch (error: unknown) {
      this.setBusy(false, errorMessage(error), true);
    }
  }

  private async logout(): Promise<void> {
    if (this.busy) {
      return;
    }

    this.setBusy(true, '로그아웃하는 중입니다…');

    try {
      await getGameSession(this).logout();
      if (this.scene.isActive()) {
        this.scene.start('LoginScene', { status: '로그아웃했습니다.' });
      }
    } catch (error: unknown) {
      this.setBusy(false, errorMessage(error), true);
    }
  }

  private getSelectedSummary(): SaveSlotSummary | undefined {
    return this.summaries.find((summary) => summary.slotId === this.selectedSlotId);
  }

  private setBusy(busy: boolean, status: string, danger = false): void {
    this.busy = busy;
    this.status = status;
    this.statusDanger = danger;
    this.screen?.setStatus(status, danger ? 'danger' : 'normal');
    this.updateButtonStates();
  }

  private updateButtonStates(): void {
    if (this.buttonsController === undefined) {
      return;
    }

    const selected = this.getSelectedSummary();
    this.buttonsController
      .setButtonEnabled('enter', !this.busy && selected !== undefined)
      .setButtonEnabled('reset', !this.busy && selected?.status === 'OCCUPIED')
      .setButtonEnabled('logout', !this.busy);
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.buttonsController?.destroy();
    this.selectionController?.destroy();
    this.buttonsController = undefined;
    this.selectionController = undefined;
  };
}
