import * as Phaser from 'phaser';

import { TEST_CARD_CATALOG } from '../../game/content/index.js';
import {
  validatePlayableSavedDeck,
  type DataValidationIssue,
  type SavedDeck,
} from '../../game/data/index.js';
import { calculateThemeModLayout } from '../../ui/layout/themeModLayout.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import {
  createDeckBuilderCardModels,
  PF2eDeckBuilderPanel,
} from '../ui/components/PF2eDeckBuilderPanel.js';
import { PF2eConfirmDialog } from '../ui/components/PF2eConfirmDialog.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import {
  PF2eCardGridPointerController,
  type PF2eCardGridTransfer,
} from '../ui/controllers/PF2eCardGridPointerController.js';
import { PF2eConfirmDialogController } from '../ui/controllers/PF2eConfirmDialogController.js';
import { DeckDraftController } from '../ui/controllers/DeckDraftController.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

function playableMessage(issues: readonly DataValidationIssue[], dirty: boolean): string {
  if (issues.length === 0) {
    return dirty
      ? '합법적인 30장 덱입니다. 저장한 뒤 전투를 시작할 수 있습니다.'
      : '합법적인 30장 덱입니다. 전투를 시작할 수 있습니다.';
  }

  return `미완성 덱 저장 가능 · ${[...new Set(issues.map((issue) => issue.message))].join(' · ')}`;
}

export class DeckBuilderScene extends Phaser.Scene {
  private panel?: PF2eDeckBuilderPanel;
  private draft?: DeckDraftController;
  private savedDeck?: SavedDeck;
  private cardPointerController?: PF2eCardGridPointerController;
  private navigationButtonsController?: PF2eButtonsController;
  private status = '';
  private statusDanger = false;
  private busy = false;

  constructor() {
    super('DeckBuilderScene');
  }

  create(): void {
    const session = getGameSession(this);
    const state = session.getState();

    if (state.activeSaveSlot === null) {
      this.scene.start(state.user === null ? 'LoginScene' : 'SaveSlotScene');
      return;
    }

    const savedDeck = session.getSelectedDeck();
    this.savedDeck = savedDeck;
    this.draft = new DeckDraftController(
      savedDeck,
      state.activeSaveSlot.collection,
      session.getCardDefinitions(),
    );
    this.refreshValidationStatus();
    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private get dirty(): boolean {
    return (
      this.draft !== undefined &&
      this.savedDeck !== undefined &&
      JSON.stringify(this.draft.value) !== JSON.stringify(this.savedDeck)
    );
  }

  private refreshValidationStatus(): void {
    if (this.draft === undefined) {
      return;
    }

    const issues = this.draft.getPlayableIssues();
    this.status = playableMessage(issues, this.dirty);
    this.statusDanger = issues.length > 0;
  }

  private rebuildLayout(width: number, height: number): void {
    const session = getGameSession(this);
    const saveSlot = session.getState().activeSaveSlot;

    if (saveSlot === null || this.draft === undefined) {
      return;
    }

    const layout = calculateThemeModLayout(width, height);
    const deck = this.draft.value;
    const models = createDeckBuilderCardModels(
      saveSlot.collection,
      deck,
      session.getCardDefinitions(),
      TEST_CARD_CATALOG.cardPresentations,
    );

    this.destroyControllers();
    this.panel?.destroy();
    this.panel = undefined;

    const panel = new PF2eDeckBuilderPanel(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      orientation: layout.orientation,
      gap: layout.gap,
      headerHeight: layout.deck.headerHeight,
      footerHeight: layout.deck.footerHeight,
      collectionWidth: layout.deck.collectionWidth,
      collectionHeight: layout.deck.collectionHeight,
      collectionColumns: layout.deck.collectionColumns,
      collectionCardWidth: layout.deck.collectionCardWidth,
      deckWidth: layout.deck.deckWidth,
      deckHeight: layout.deck.deckHeight,
      deckColumns: layout.deck.deckColumns,
      deckCardWidth: layout.deck.deckCardWidth,
      collectionCount: saveSlot.collection.cardInstances.length,
      deckCount: deck.unitInstanceIds.length + (deck.leaderInstanceId === null ? 0 : 1),
      status: this.status,
      statusDanger: this.statusDanger,
      ...models,
    })
      .setPosition(width / 2, height / 2)
      .layout();

    this.cardPointerController = new PF2eCardGridPointerController(this, {
      collection: panel.collectionGrid,
      deck: panel.deckGrid,
      isEnabled: () => !this.busy,
      onTransfer: (transfer) => {
        this.editDeck(transfer);
      },
    });
    this.navigationButtonsController = new PF2eButtonsController(panel.navigationButtons, {
      onButtonClick: (buttonId) => {
        switch (buttonId) {
          case 'save':
            this.confirmSave();
            break;
          case 'battle':
            void this.startBattle();
            break;
          case 'stage':
            this.returnToStage();
            break;
        }
      },
    });
    this.panel = panel;
    this.updateButtonStates();
    this.game.canvas.dataset.scene = 'deck-builder';
    this.game.canvas.dataset.orientation = layout.orientation;
    this.game.canvas.dataset.deckCount = String(
      deck.unitInstanceIds.length + (deck.leaderInstanceId === null ? 0 : 1),
    );
    this.game.canvas.dataset.deckDirty = String(this.dirty);
    this.game.canvas.dataset.deckPlayable = String(this.draft.getPlayableIssues().length === 0);
    this.game.canvas.dataset.deckInput = 'card-pointer';
  }

  private editDeck(transfer: PF2eCardGridTransfer): void {
    if (this.busy || this.draft === undefined) {
      return;
    }

    const result =
      transfer.input === 'click' && transfer.from === 'collection'
        ? this.draft.toggleCard(transfer.cardId)
        : transfer.to === 'deck'
          ? this.draft.addCard(transfer.cardId)
          : this.draft.removeCard(transfer.cardId);

    this.status = result.message;
    this.statusDanger = !result.changed;
    if (!result.changed) {
      this.setStatus(result.message, true);
      return;
    }

    this.refreshValidationStatus();
    this.busy = true;
    this.updateButtonStates();
    this.time.delayedCall(120, () => {
      if (!this.scene.isActive()) {
        return;
      }

      this.busy = false;
      this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    });
  }

  private confirmSave(): void {
    if (this.busy || this.draft === undefined || !this.dirty) {
      if (!this.dirty) {
        this.setStatus('저장할 변경사항이 없습니다.', false);
      }
      return;
    }

    const storageIssues = this.draft.getStorageIssues();

    if (storageIssues.length > 0) {
      this.setStatus(storageIssues.map((issue) => issue.message).join(' · '), true);
      return;
    }

    const dialog = new PF2eConfirmDialog(this, {
      title: '저장 덱 덮어쓰기',
      message:
        '현재 덱 구성을 이 세이브 슬롯에 저장합니다. 30장 미만인 미완성 덱은 저장할 수 있지만 전투는 시작할 수 없습니다.',
      confirmText: '저장',
      cancelText: '취소',
      width: Math.min(620, Math.max(300, this.scale.gameSize.width - 40)),
      height: Math.min(420, Math.max(320, this.scale.gameSize.height - 40)),
    });
    new PF2eConfirmDialogController(dialog, {
      onConfirm: () => {
        void this.saveDraft();
      },
    }).open();
  }

  private async saveDraft(): Promise<void> {
    if (this.draft === undefined || this.busy) {
      return;
    }

    this.busy = true;
    this.setStatus('덱을 저장하는 중입니다…', false);
    this.updateButtonStates();

    try {
      await getGameSession(this).saveDeck(this.draft.value);
      this.savedDeck = this.draft.value;
      this.busy = false;
      this.refreshValidationStatus();
      this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    } catch (error: unknown) {
      this.busy = false;
      this.setStatus(error instanceof Error ? error.message : '덱을 저장하지 못했습니다.', true);
      this.updateButtonStates();
    }
  }

  private async startBattle(): Promise<void> {
    if (this.busy || this.draft === undefined) {
      return;
    }

    if (this.dirty) {
      this.setStatus('변경한 덱을 먼저 저장해야 전투를 시작할 수 있습니다.', true);
      return;
    }

    const session = getGameSession(this);
    const saveSlot = session.getState().activeSaveSlot;
    if (saveSlot === null) {
      return;
    }
    const validation = validatePlayableSavedDeck(this.draft.value, {
      collection: saveSlot.collection,
      cardDefinitions: session.getCardDefinitions(),
    });
    if (!validation.valid) {
      this.setStatus(playableMessage(validation.issues, false), true);
      return;
    }

    const stage = session.getAvailableStages()[0];
    if (stage === undefined) {
      this.setStatus('시작할 수 있는 Stage가 없습니다.', true);
      return;
    }

    this.busy = true;
    this.setStatus('서버에서 Stage 실행 ID와 전투 시드를 발급하는 중입니다…', false);
    this.updateButtonStates();

    try {
      await session.startStageBattle(stage.definition.id);
      if (this.scene.isActive()) {
        this.scene.start('BattleScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.setStatus(
        error instanceof Error ? error.message : 'Stage 실행을 시작하지 못했습니다.',
        true,
      );
      this.updateButtonStates();
    }
  }

  private returnToStage(): void {
    if (this.busy) {
      return;
    }

    if (!this.dirty) {
      this.scene.start('StageScene');
      return;
    }

    const dialog = new PF2eConfirmDialog(this, {
      title: '저장하지 않은 변경사항',
      message: '저장하지 않은 덱 변경을 버리고 Stage 화면으로 돌아갑니다.',
      confirmText: '변경 버리기',
      cancelText: '계속 편집',
      danger: true,
      width: Math.min(620, Math.max(300, this.scale.gameSize.width - 40)),
      height: Math.min(400, Math.max(300, this.scale.gameSize.height - 40)),
    });
    new PF2eConfirmDialogController(dialog, {
      onConfirm: () => {
        this.scene.start('StageScene');
      },
    }).open();
  }

  private setStatus(message: string, danger: boolean): void {
    this.status = message;
    this.statusDanger = danger;
    this.panel?.setStatus(message, danger);
  }

  private updateButtonStates(): void {
    if (this.navigationButtonsController === undefined) {
      return;
    }

    this.navigationButtonsController
      .setButtonEnabled('save', !this.busy && this.dirty)
      .setButtonEnabled('battle', !this.busy)
      .setButtonEnabled('stage', !this.busy);
  }

  private destroyControllers(): void {
    this.cardPointerController?.destroy();
    this.navigationButtonsController?.destroy();
    this.cardPointerController = undefined;
    this.navigationButtonsController = undefined;
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.destroyControllers();
  };
}
