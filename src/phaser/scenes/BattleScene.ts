import * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import {
  DETERMINISTIC_BATTLE_DECISIONS,
  getBattleCard,
  getCardDefinition,
  type BattleAction,
  type BattleState,
} from '../../game/simulation/battle/index.js';
import { calculatePhaseSevenLayout } from '../../ui/layout/phaseSevenLayout.js';
import { createBattlePresentationRuntime } from '../adapters/createBattlePresentationRuntime.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import type { BattlePlaybackSpeed } from '../adapters/battlePresentationCueAdapter.js';
import { PF2eBattleBoard } from '../ui/components/PF2eBattleBoard.js';
import { PF2eBattleHud } from '../ui/components/PF2eBattleHud.js';
import { PF2eConfirmDialog } from '../ui/components/PF2eConfirmDialog.js';
import { BattleDecisionCoordinator } from '../ui/controllers/BattleDecisionCoordinator.js';
import { BattleDecisionPromptController } from '../ui/controllers/BattleDecisionPromptController.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import { PF2eConfirmDialogController } from '../ui/controllers/PF2eConfirmDialogController.js';
import { PF2eGridTableSelectionController } from '../ui/controllers/PF2eGridTableSelectionController.js';
import {
  createBattleActionListItems,
  type BattleActionListItem,
} from '../ui/controllers/battleUiModels.js';
import type { PhaserBattlePresentationRuntime } from '../adapters/createBattlePresentationRuntime.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

function battleErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '전투 Action을 처리하지 못했습니다.';
}

export class BattleScene extends Phaser.Scene {
  private root?: Sizer;
  private board?: PF2eBattleBoard;
  private hud?: PF2eBattleHud;
  private presentation?: PhaserBattlePresentationRuntime;
  private promptController?: BattleDecisionPromptController;
  private actionSelection?: PF2eGridTableSelectionController;
  private navigationController?: PF2eButtonsController;
  private settingsControllers: PF2eButtonsController[] = [];
  private unsubscribeSettings?: () => void;
  private actionItems: readonly BattleActionListItem[] = Object.freeze([]);
  private selectedAction?: BattleAction;
  private busy = false;
  private presentationUserLocked = false;
  private presentationAiLocked = false;
  private playbackSpeed: BattlePlaybackSpeed = 1;
  private pendingResize?: Phaser.Structs.Size;
  private completingBattle = false;
  private completionRetryHandler?: () => void;
  private readonly decisionCoordinator = new BattleDecisionCoordinator();

  constructor() {
    super('BattleScene');
  }

  create(): void {
    const session = getGameSession(this);
    const state = session.getState();

    if (state.user === null) {
      this.scene.start('LoginScene');
      return;
    }
    if (state.activeSaveSlot === null) {
      this.scene.start('SaveSlotScene');
      return;
    }
    if (state.activeStageRun === null || state.battleState === null) {
      this.scene.start('StageScene');
      return;
    }

    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    if (this.busy || this.presentation?.controller.isPresenting === true) {
      this.pendingResize = gameSize;
      return;
    }

    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private rebuildLayout(width: number, height: number): void {
    const session = getGameSession(this);
    const gameState = session.getState();
    const state = gameState.battleState;
    const stageRun = gameState.activeStageRun;

    if (state === null || stageRun === null) {
      return;
    }

    this.destroyBattleView();
    const layout = calculatePhaseSevenLayout(width, height);
    const boardWidth =
      layout.orientation === 'landscape'
        ? layout.rootWidth - layout.battleSidebarWidth - layout.gap
        : layout.rootWidth;
    const boardHeight =
      layout.orientation === 'landscape'
        ? layout.rootHeight
        : layout.rootHeight - layout.battleHudHeight - layout.gap;
    const hudWidth =
      layout.orientation === 'landscape' ? layout.battleSidebarWidth : layout.rootWidth;
    const hudHeight =
      layout.orientation === 'landscape' ? layout.rootHeight : layout.battleHudHeight;
    const actionItems = this.createActionItems(state);
    const board = new PF2eBattleBoard(this, {
      width: boardWidth,
      height: boardHeight,
      cardWidth: layout.battleCardWidth,
      initialState: state,
      cardDefinitions: session.getCardDefinitions(),
      cardPresentations: session.getCardPresentations(),
    });
    const hud = new PF2eBattleHud(this, {
      width: hudWidth,
      height: hudHeight,
      orientation: layout.orientation,
      actionItems,
      state,
      speed: this.playbackSpeed,
      volume: 0.8,
      muted: false,
    });
    const root = new Sizer(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      orientation: layout.orientation === 'landscape' ? 'x' : 'y',
      space: {
        item: layout.gap,
      },
    });
    this.add.existing(root);
    root
      .add(board, { proportion: 1, expand: true })
      .add(hud, {
        expand: true,
      })
      .setPosition(width / 2, height / 2)
      .layout();
    board.layout();

    this.root = root;
    this.board = board;
    this.hud = hud;
    this.actionItems = actionItems;
    this.presentation = createBattlePresentationRuntime(this, {
      view: board.viewCallbacks,
      interactionGate: {
        setUserInputLocked: (locked) => {
          this.presentationUserLocked = locked;
          this.updateControlStates();
        },
        setAiActionLocked: (locked) => {
          this.presentationAiLocked = locked;
          this.updateControlStates();
        },
      },
      onDiagnostic: (diagnostic) => {
        if (diagnostic.code !== 'AUDIO_BLOCKED') {
          this.hud?.setStatus(diagnostic.message, true);
        }
      },
    });
    this.presentation.controller.setPlaybackSpeed(this.playbackSpeed);
    this.unsubscribeSettings = this.presentation.settings.subscribe((settings) => {
      this.hud?.setSettings(this.playbackSpeed, settings.volume, settings.muted);
      this.game.canvas.dataset.playbackSpeed = String(this.playbackSpeed);
      this.game.canvas.dataset.sfxVolume = settings.volume.toFixed(1);
      this.game.canvas.dataset.sfxMuted = String(settings.muted);
    });
    this.promptController = new BattleDecisionPromptController(this, {
      getCardName: (cardId) => this.getCardName(cardId),
    });
    this.bindHudControllers(actionItems);
    this.updateControlStates();
    this.game.canvas.dataset.scene = 'battle';
    this.game.canvas.dataset.orientation = layout.orientation;
    this.game.canvas.dataset.presentationLocked = 'false';
    this.game.canvas.dataset.activePlayer = state.activePlayerId.toLowerCase();
    this.game.canvas.dataset.decisionPrompt = 'false';
    this.game.canvas.dataset.skipRequested = 'false';
    this.game.canvas.dataset.stageRunId = stageRun.runId;
    this.game.canvas.dataset.stageId = stageRun.stageId;
    this.game.canvas.dataset.stageSeed = String(stageRun.seed);
    this.updateBattleDataset(state);
  }

  private bindHudControllers(items: readonly BattleActionListItem[]): void {
    const hud = this.hud;

    if (hud === undefined) {
      return;
    }

    this.actionSelection?.destroy();
    const initial = items[0];
    this.selectedAction = initial?.action;
    this.actionSelection = new PF2eGridTableSelectionController(hud.actionTable, {
      items,
      initialSelectedId: initial?.id,
      isEnabled: () => !this.isActionInputLocked(),
      onSelectionChange: (_item, index) => {
        if (this.isActionInputLocked()) {
          return;
        }
        this.selectedAction = this.actionItems[index]?.action;
        this.updateControlStates();
      },
    });
    this.navigationController = new PF2eButtonsController(hud.navigationButtons, {
      onButtonClick: (buttonId) => {
        switch (buttonId) {
          case 'execute':
            void this.executeSelectedAction();
            break;
          case 'skip':
            this.game.canvas.dataset.skipRequested = String(
              this.presentation?.controller.requestSkip() ?? false,
            );
            this.updateControlStates();
            break;
          case 'leave':
            this.confirmLeaveBattle();
            break;
        }
      },
    });
    this.settingsControllers = hud.settingsButtonGroups.map(
      (buttons) =>
        new PF2eButtonsController(buttons, {
          onButtonClick: (buttonId) => {
            this.updatePresentationSetting(buttonId);
          },
        }),
    );
  }

  private createActionItems(state: BattleState): readonly BattleActionListItem[] {
    if (state.result.type !== 'ONGOING' || state.activePlayerId !== 'PLAYER' || this.busy) {
      return Object.freeze([]);
    }

    const session = getGameSession(this);
    return createBattleActionListItems(
      state,
      session.getLegalBattleActions(),
      session.getCardDefinitions(),
    );
  }

  private refreshAfterPresentation(status = '실행할 Action을 선택하세요.'): void {
    const state = getGameSession(this).getState().battleState;
    const hud = this.hud;

    if (state === null || hud === undefined) {
      return;
    }

    this.board?.renderState(state);
    hud.setBattleState(state).setStatus(status);
    this.actionItems = this.createActionItems(state);
    hud.setActionItems(this.actionItems);
    this.actionSelection?.destroy();
    const initial = this.actionItems[0];
    this.selectedAction = initial?.action;
    this.actionSelection = new PF2eGridTableSelectionController(hud.actionTable, {
      items: this.actionItems,
      initialSelectedId: initial?.id,
      isEnabled: () => !this.isActionInputLocked(),
      onSelectionChange: (_item, index) => {
        if (!this.isActionInputLocked()) {
          this.selectedAction = this.actionItems[index]?.action;
          this.updateControlStates();
        }
      },
    });
    this.game.canvas.dataset.activePlayer = state.activePlayerId.toLowerCase();
    this.updateBattleDataset(state);
    this.updateControlStates();
  }

  private async executeSelectedAction(): Promise<void> {
    const action = this.selectedAction;
    const presentation = this.presentation;
    const prompt = this.promptController;

    if (
      action === undefined ||
      presentation === undefined ||
      prompt === undefined ||
      this.isActionInputLocked()
    ) {
      return;
    }

    this.busy = true;
    this.game.canvas.dataset.skipRequested = 'false';
    this.hud?.setStatus('Action을 해결하는 중입니다…');
    this.updateControlStates();

    try {
      const session = getGameSession(this);
      const resolution = await this.decisionCoordinator.resolveAction(session, action, prompt);
      await presentation.controller.presentAction(resolution);

      if (!this.scene.isActive()) {
        return;
      }
      if (resolution.finalState.result.type !== 'ONGOING') {
        await this.finishBattle();
        return;
      }

      await this.runEnemyTurn();
      if (!this.scene.isActive()) {
        return;
      }

      const current = session.getState().battleState;
      if (current?.result.type !== 'ONGOING') {
        await this.finishBattle();
        return;
      }

      this.busy = false;
      this.refreshAfterPresentation();
    } catch (error: unknown) {
      if (!this.scene.isActive()) {
        return;
      }

      this.busy = false;
      this.refreshAfterPresentation(battleErrorMessage(error));
      this.hud?.setStatus(battleErrorMessage(error), true);
    } finally {
      this.applyPendingResize();
    }
  }

  private async runEnemyTurn(): Promise<void> {
    const session = getGameSession(this);

    while (true) {
      const state = session.getState().battleState;

      if (
        state === null ||
        state.result.type !== 'ONGOING' ||
        state.activePlayerId !== 'ENEMY' ||
        !this.scene.isActive()
      ) {
        return;
      }
      if (this.presentationAiLocked) {
        throw new Error('전투 연출 중에는 AI Action을 시작할 수 없습니다.');
      }

      this.hud?.setStatus('적이 Action을 선택했습니다…');
      const action = session.chooseEnemyBattleAction();
      const resolution = session.resolveBattleAction(action, DETERMINISTIC_BATTLE_DECISIONS);
      const presentation = this.presentation;

      if (presentation === undefined) {
        return;
      }

      await presentation.controller.presentAction(resolution);
    }
  }

  private updatePresentationSetting(buttonId: string): void {
    const presentation = this.presentation;

    if (presentation === undefined) {
      return;
    }

    switch (buttonId) {
      case 'speed-1':
      case 'speed-2':
      case 'speed-4': {
        const speed = Number(buttonId.at(-1));
        if (speed === 1 || speed === 2 || speed === 4) {
          this.playbackSpeed = speed;
          presentation.controller.setPlaybackSpeed(speed);
        }
        break;
      }
      case 'volume-down':
        presentation.settings.setVolume(presentation.settings.value.volume - 0.1);
        break;
      case 'volume-up':
        presentation.settings.setVolume(presentation.settings.value.volume + 0.1);
        break;
      case 'mute':
        presentation.settings.setMuted(!presentation.settings.value.muted);
        break;
    }

    const settings = presentation.settings.value;
    this.hud?.setSettings(this.playbackSpeed, settings.volume, settings.muted);
    this.game.canvas.dataset.playbackSpeed = String(this.playbackSpeed);
  }

  private confirmLeaveBattle(): void {
    if (this.isActionInputLocked()) {
      return;
    }

    const dialog = new PF2eConfirmDialog(this, {
      title: '전투에서 나가기',
      message:
        '현재 Stage 실행을 패배로 완료하고 Stage 화면으로 돌아갑니다. 포기한 실행에는 보상이 없습니다.',
      confirmText: '나가기',
      cancelText: '계속 전투',
      danger: true,
      width: Math.min(620, Math.max(300, this.scale.gameSize.width - 40)),
      height: Math.min(400, Math.max(300, this.scale.gameSize.height - 40)),
    });
    new PF2eConfirmDialogController(dialog, {
      onConfirm: () => {
        void this.abandonStageBattle();
      },
    }).open();
  }

  private async abandonStageBattle(): Promise<void> {
    this.busy = true;
    this.hud?.setStatus('Stage 실행을 패배로 저장하는 중입니다…');
    this.updateControlStates();

    try {
      await getGameSession(this).abandonStageBattle();
      if (this.scene.isActive()) {
        this.scene.start('StageScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.hud?.setStatus(
        error instanceof Error ? error.message : 'Stage 포기 결과를 저장하지 못했습니다.',
        true,
      );
      this.updateControlStates();
    }
  }

  private async finishBattle(): Promise<void> {
    if (this.completingBattle) {
      return;
    }

    this.completingBattle = true;
    this.busy = true;
    this.hud?.setStatus('최종 연출 완료 · 서버에서 Stage 결과와 보상을 저장하는 중입니다…');
    this.updateControlStates();

    try {
      await getGameSession(this).completeStageBattle();
      this.clearCompletionRetry();
      if (this.scene.isActive()) {
        this.scene.start('BattleResultScene');
      }
    } catch (error: unknown) {
      if (!this.scene.isActive()) {
        return;
      }

      this.completingBattle = false;
      this.busy = false;
      this.hud?.setStatus(
        `${
          error instanceof Error ? error.message : 'Stage 결과를 저장하지 못했습니다.'
        } · 화면을 눌러 다시 시도하세요.`,
        true,
      );
      this.clearCompletionRetry();
      this.completionRetryHandler = () => {
        this.completionRetryHandler = undefined;
        void this.finishBattle();
      };
      this.input.once(Phaser.Input.Events.POINTER_DOWN, this.completionRetryHandler);
      this.updateControlStates();
    }
  }

  private getCardName(cardId: string): string {
    const session = getGameSession(this);
    const state = session.getState().battleState;

    if (state === null) {
      return cardId;
    }

    const card = getBattleCard(state, cardId);
    return getCardDefinition(session.getCardDefinitions(), card.cardDefinitionId).name;
  }

  private isActionInputLocked(): boolean {
    const state = getGameSession(this).getState().battleState;
    return (
      this.busy ||
      this.presentationUserLocked ||
      state === null ||
      state.activePlayerId !== 'PLAYER' ||
      state.result.type !== 'ONGOING'
    );
  }

  private updateControlStates(): void {
    const controller = this.navigationController;

    if (controller === undefined) {
      return;
    }

    const locked = this.isActionInputLocked();
    const presenting = this.presentation?.controller.isPresenting === true;
    controller
      .setButtonEnabled('execute', !locked && this.selectedAction !== undefined)
      .setButtonEnabled('skip', presenting)
      .setButtonEnabled('leave', !locked && !presenting);
    this.game.canvas.dataset.presentationLocked = String(
      this.presentationUserLocked || this.presentationAiLocked,
    );
  }

  private updateBattleDataset(state: BattleState): void {
    this.game.canvas.dataset.turnNumber = String(state.turnNumber);
    this.game.canvas.dataset.actionCount = String(state.actionCount);
    this.game.canvas.dataset.battleResult = state.result.type.toLowerCase();
  }

  private applyPendingResize(): void {
    if (
      this.pendingResize === undefined ||
      this.busy ||
      this.presentation?.controller.isPresenting === true ||
      !this.scene.isActive()
    ) {
      return;
    }

    const pending = this.pendingResize;
    this.pendingResize = undefined;
    this.rebuildLayout(pending.width, pending.height);
  }

  private destroyBattleView(): void {
    this.actionSelection?.destroy();
    this.navigationController?.destroy();
    for (const controller of this.settingsControllers) {
      controller.destroy();
    }
    this.settingsControllers = [];
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = undefined;
    this.promptController?.destroy();
    this.promptController = undefined;
    this.presentation?.destroy();
    this.presentation = undefined;
    this.root?.destroy();
    this.root = undefined;
    this.board = undefined;
    this.hud = undefined;
    this.actionSelection = undefined;
    this.navigationController = undefined;
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.pendingResize = undefined;
    this.clearCompletionRetry();
    this.destroyBattleView();
  };

  private clearCompletionRetry(): void {
    if (this.completionRetryHandler !== undefined) {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.completionRetryHandler);
      this.completionRetryHandler = undefined;
    }
  }
}
