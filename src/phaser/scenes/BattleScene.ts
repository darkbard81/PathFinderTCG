import * as Phaser from 'phaser';
import { Sizer } from 'phaser4-rex-plugins/templates/ui/ui-components.js';

import {
  DETERMINISTIC_BATTLE_DECISIONS,
  getBattleCard,
  getCardDefinition,
  type BattleAction,
  type BattleState,
} from '../../game/simulation/battle/index.js';
import { calculateThemeModLayout, type ThemeModLayout } from '../../ui/layout/themeModLayout.js';
import { createBattlePresentationRuntime } from '../adapters/createBattlePresentationRuntime.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import type { BattlePlaybackSpeed } from '../adapters/battlePresentationCueAdapter.js';
import { PF2eBattleBoard } from '../ui/components/PF2eBattleBoard.js';
import { PF2eBattleCommandBar } from '../ui/components/PF2eBattleCommandBar.js';
import { PF2eConfirmDialog } from '../ui/components/PF2eConfirmDialog.js';
import { PF2eHandDeck, type PF2eHandDeckItem } from '../ui/components/PF2eHandDeck.js';
import { BattleDecisionCoordinator } from '../ui/controllers/BattleDecisionCoordinator.js';
import { BattleDecisionPromptController } from '../ui/controllers/BattleDecisionPromptController.js';
import { BattlePointerController } from '../ui/controllers/BattlePointerController.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import { PF2eConfirmDialogController } from '../ui/controllers/PF2eConfirmDialogController.js';
import type { PhaserBattlePresentationRuntime } from '../adapters/createBattlePresentationRuntime.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

function battleErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '전투 Action을 처리하지 못했습니다.';
}

export class BattleScene extends Phaser.Scene {
  private root?: Sizer;
  private board?: PF2eBattleBoard;
  private commandBar?: PF2eBattleCommandBar;
  private handDeck?: PF2eHandDeck;
  private presentation?: PhaserBattlePresentationRuntime;
  private promptController?: BattleDecisionPromptController;
  private pointerController?: BattlePointerController;
  private commandController?: PF2eButtonsController;
  private unsubscribeSettings?: () => void;
  private legalActions: readonly BattleAction[] = Object.freeze([]);
  private currentLayout?: ThemeModLayout;
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
    const layout = calculateThemeModLayout(width, height);
    const legalActions = this.createLegalActions(state);
    const board = new PF2eBattleBoard(this, {
      width: layout.battle.boardWidth,
      height: layout.battle.boardHeight,
      cardWidth: layout.battle.boardCardWidth,
      initialState: state,
      cardDefinitions: session.getCardDefinitions(),
      cardPresentations: session.getCardPresentations(),
    });
    const commandBar = new PF2eBattleCommandBar(this, {
      width: layout.rootWidth,
      height: layout.battle.commandBarHeight,
      speed: this.playbackSpeed,
      volume: 0.8,
      muted: false,
    });
    const handDeck = new PF2eHandDeck(this, {
      width: layout.battle.handWidth,
      height: layout.battle.handHeight,
      cardWidth: layout.battle.handCardWidth,
      items: this.createHandItems(state, board),
    });
    const root = new Sizer(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      orientation: 'y',
      space: {
        item: layout.gap,
      },
    });
    this.add.existing(root);
    root
      .add(commandBar, { expand: true })
      .add(board, { proportion: 1, expand: true })
      .setPosition(width / 2, height / 2)
      .layout();
    board.layout();
    handDeck.setPosition(width / 2, layout.battle.handCollapsedY).layout();

    this.root = root;
    this.board = board;
    this.commandBar = commandBar;
    this.handDeck = handDeck;
    this.legalActions = legalActions;
    this.currentLayout = layout;
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
          this.commandBar?.setStatus(diagnostic.message, true);
        }
      },
    });
    this.presentation.controller.setPlaybackSpeed(this.playbackSpeed);
    this.unsubscribeSettings = this.presentation.settings.subscribe((settings) => {
      this.commandBar?.setSettings(this.playbackSpeed, settings.volume, settings.muted);
      this.game.canvas.dataset.playbackSpeed = String(this.playbackSpeed);
      this.game.canvas.dataset.sfxVolume = settings.volume.toFixed(1);
      this.game.canvas.dataset.sfxMuted = String(settings.muted);
    });
    this.promptController = new BattleDecisionPromptController(this, {
      getCardName: (cardId) => this.getCardName(cardId),
    });
    this.bindCommandController();
    this.bindPointerController(state, layout);
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
    this.game.canvas.dataset.battleInput = 'card-pointer';
    this.updateBattleDataset(state);
  }

  override update(): void {
    this.pointerController?.update(this.input.activePointer);
  }

  private createHandItems(state: BattleState, board: PF2eBattleBoard): readonly PF2eHandDeckItem[] {
    return Object.freeze(
      state.players.PLAYER.handIds.map((cardId) =>
        Object.freeze({
          id: cardId,
          model: board.createCardModel(state, cardId),
        }),
      ),
    );
  }

  private bindCommandController(): void {
    const commandBar = this.commandBar;
    if (commandBar === undefined) {
      return;
    }
    this.commandController = new PF2eButtonsController(commandBar.buttons, {
      onButtonClick: (buttonId) => {
        switch (buttonId) {
          case 'end-turn':
            this.pointerController?.requestEndTurn();
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
          default:
            this.updatePresentationSetting(buttonId);
            break;
        }
      },
    });
  }

  private createLegalActions(state: BattleState): readonly BattleAction[] {
    if (state.result.type !== 'ONGOING' || state.activePlayerId !== 'PLAYER' || this.busy) {
      return Object.freeze([]);
    }
    return getGameSession(this).getLegalBattleActions();
  }

  private bindPointerController(state: BattleState, layout: ThemeModLayout): void {
    const board = this.board;
    const handDeck = this.handDeck;
    if (board === undefined || handDeck === undefined) {
      return;
    }
    this.pointerController?.destroy();
    this.pointerController = new BattlePointerController(this, {
      board,
      handDeck,
      state,
      actions: this.legalActions,
      viewportWidth: layout.width,
      viewportHeight: layout.height,
      viewportPadding: layout.padding,
      handExpandedY: layout.battle.handExpandedY,
      handCollapsedY: layout.battle.handCollapsedY,
      handHoverTop: layout.battle.handHoverTop,
      handPeekTop: layout.battle.handPeekTop,
      previewCardWidth: layout.battle.previewCardWidth,
      isEnabled: () => !this.isActionInputLocked(),
      onAction: (action) => {
        void this.executeAction(action);
      },
      onStatus: (message, danger = false) => {
        this.commandBar?.setStatus(message, danger);
      },
      onSelectionChange: (selectedCardId, activeSkillSourceCardId) => {
        this.game.canvas.dataset.selectedCardId = selectedCardId ?? '';
        this.game.canvas.dataset.activeSkillSourceCardId = activeSkillSourceCardId ?? '';
      },
      onHandExpandedChange: (expanded) => {
        this.game.canvas.dataset.handExpanded = String(expanded);
      },
    });
  }

  private refreshAfterPresentation(status = '카드를 누르거나 드래그해 Action을 실행하세요.'): void {
    const state = getGameSession(this).getState().battleState;
    const commandBar = this.commandBar;
    const board = this.board;
    const handDeck = this.handDeck;
    const layout = this.currentLayout;

    if (
      state === null ||
      commandBar === undefined ||
      board === undefined ||
      handDeck === undefined ||
      layout === undefined
    ) {
      return;
    }

    this.pointerController?.destroy();
    this.pointerController = undefined;
    board.renderState(state);
    handDeck.renderItems(this.createHandItems(state, board));
    commandBar.setStatus(status);
    this.legalActions = this.createLegalActions(state);
    this.bindPointerController(state, layout);
    this.game.canvas.dataset.activePlayer = state.activePlayerId.toLowerCase();
    this.updateBattleDataset(state);
    this.updateControlStates();
  }

  private async executeAction(action: BattleAction): Promise<void> {
    const presentation = this.presentation;
    const prompt = this.promptController;

    if (presentation === undefined || prompt === undefined || this.isActionInputLocked()) {
      return;
    }

    this.busy = true;
    this.pointerController?.destroy();
    this.pointerController = undefined;
    this.game.canvas.dataset.skipRequested = 'false';
    this.commandBar?.setStatus('Action을 해결하는 중입니다…');
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
      this.commandBar?.setStatus(battleErrorMessage(error), true);
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

      this.commandBar?.setStatus('적이 Action을 선택했습니다…');
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
      case 'speed': {
        this.playbackSpeed = this.playbackSpeed === 1 ? 2 : this.playbackSpeed === 2 ? 4 : 1;
        presentation.controller.setPlaybackSpeed(this.playbackSpeed);
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
    this.commandBar?.setSettings(this.playbackSpeed, settings.volume, settings.muted);
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
    this.commandBar?.setStatus('Stage 실행을 패배로 저장하는 중입니다…');
    this.updateControlStates();

    try {
      await getGameSession(this).abandonStageBattle();
      if (this.scene.isActive()) {
        this.scene.start('StageScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.commandBar?.setStatus(
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
    this.commandBar?.setStatus('최종 연출 완료 · 서버에서 Stage 결과와 보상을 저장하는 중입니다…');
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
      this.commandBar?.setStatus(
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
    const controller = this.commandController;

    if (controller === undefined) {
      return;
    }

    const locked = this.isActionInputLocked();
    const presenting = this.presentation?.controller.isPresenting === true;
    controller
      .setButtonEnabled(
        'end-turn',
        !locked && this.legalActions.some((action) => action.type === 'END_TURN'),
      )
      .setButtonEnabled('skip', presenting)
      .setButtonEnabled('leave', !locked && !presenting)
      .setButtonEnabled('speed', true)
      .setButtonEnabled('volume-down', true)
      .setButtonEnabled('mute', true)
      .setButtonEnabled('volume-up', true);
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
    this.pointerController?.destroy();
    this.pointerController = undefined;
    this.commandController?.destroy();
    this.commandController = undefined;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = undefined;
    this.promptController?.destroy();
    this.promptController = undefined;
    this.presentation?.destroy();
    this.presentation = undefined;
    this.handDeck?.destroy();
    this.handDeck = undefined;
    this.root?.destroy();
    this.root = undefined;
    this.board = undefined;
    this.commandBar = undefined;
    this.legalActions = Object.freeze([]);
    this.currentLayout = undefined;
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
