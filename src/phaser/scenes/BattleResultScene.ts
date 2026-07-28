import * as Phaser from 'phaser';

import { calculatePhaseSevenLayout } from '../../ui/layout/phaseSevenLayout.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import { PF2eBattleResultPanel } from '../ui/components/PF2eBattleResultPanel.js';
import { PF2eScreenPanel } from '../ui/components/PF2eScreenPanel.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

export class BattleResultScene extends Phaser.Scene {
  private screen?: PF2eScreenPanel;
  private buttonsController?: PF2eButtonsController;
  private busy = false;

  constructor() {
    super('BattleResultScene');
  }

  create(): void {
    const state = getGameSession(this).getState();

    if (state.user === null) {
      this.scene.start('LoginScene');
      return;
    }
    if (state.activeSaveSlot === null) {
      this.scene.start('SaveSlotScene');
      return;
    }
    if (state.lastBattle === null) {
      this.scene.start('StageScene');
      return;
    }

    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private rebuildLayout(width: number, height: number): void {
    const session = getGameSession(this);
    const state = session.getState();
    const battle = state.lastBattle;

    if (battle === null || state.activeSaveSlot === null) {
      return;
    }

    const layout = calculatePhaseSevenLayout(width, height);
    this.buttonsController?.destroy();
    this.screen?.destroy();

    const panel = new PF2eBattleResultPanel(this, {
      width: Math.max(240, layout.rootWidth - layout.panelInset * 2),
      height: layout.screenContentHeight,
      orientation: layout.orientation,
      battle,
      ownedCardCount: state.activeSaveSlot.collection.cardInstances.length,
    });
    const screen = new PF2eScreenPanel(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      inset: layout.panelInset,
      gap: layout.gap,
      title: '전투 결과 / 보상',
      subtitle: `${battle.stage.presentation.name} · 서버 Stage 실행 완료`,
      titleFontSize: layout.titleFontSize,
      bodyFontSize: layout.bodyFontSize,
      content: panel,
    })
      .setPosition(width / 2, height / 2)
      .layout();
    screen.setStatus('최종 연출 뒤 서버 트랜잭션으로 결과와 보상을 저장했습니다.');
    this.buttonsController = new PF2eButtonsController(panel.buttons, {
      onButtonClick: (buttonId) => {
        switch (buttonId) {
          case 'rematch':
            void this.rematch(battle.stage.definition.id);
            break;
          case 'stage':
            if (!this.busy) {
              this.scene.start('StageScene');
            }
            break;
          case 'slots':
            if (!this.busy) {
              this.scene.start('SaveSlotScene');
            }
            break;
        }
      },
    });
    this.screen = screen;
    this.game.canvas.dataset.scene = 'battle-result';
    this.game.canvas.dataset.orientation = layout.orientation;
    this.game.canvas.dataset.stageRunId = battle.stageRun.runId;
    this.game.canvas.dataset.stageRunResult = battle.stageRun.result.toLowerCase();
    this.game.canvas.dataset.reward = battle.stageRun.rewardCardInstanceId ?? 'none';
    this.game.canvas.dataset.rewardDefinition = battle.reward?.card.cardDefinitionId ?? 'none';
    this.game.canvas.dataset.collectionCount = String(
      state.activeSaveSlot.collection.cardInstances.length,
    );
    this.game.canvas.dataset.stageCleared = String(
      state.activeSaveSlot.progress.clearedStageIds.includes(battle.stage.definition.id),
    );
    this.game.canvas.dataset.deckPlayable = String(
      session.canStartStage(battle.stage.definition.id),
    );
    this.game.canvas.dataset.turnNumber = String(battle.finalState.turnNumber);
    this.game.canvas.dataset.actionCount = String(battle.finalState.actionCount);
    this.game.canvas.dataset.battleResult = battle.stageRun.result.toLowerCase();
    this.game.canvas.dataset.presentationLocked = 'false';
    this.game.canvas.dataset.decisionPrompt = 'false';
    this.game.canvas.dataset.skipRequested = 'false';
  }

  private async rematch(stageId: string): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;
    this.screen?.setStatus('새 Stage 실행 ID와 전투 시드를 발급하는 중입니다…');
    this.buttonsController
      ?.setButtonEnabled('rematch', false)
      .setButtonEnabled('stage', false)
      .setButtonEnabled('slots', false);

    try {
      await getGameSession(this).startStageBattle(stageId);
      if (this.scene.isActive()) {
        this.scene.start('BattleScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.screen?.setStatus(
        error instanceof Error ? error.message : '다시 전투를 시작하지 못했습니다.',
        'danger',
      );
      this.buttonsController
        ?.setButtonEnabled('rematch', true)
        .setButtonEnabled('stage', true)
        .setButtonEnabled('slots', true);
    }
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.buttonsController?.destroy();
    this.buttonsController = undefined;
  };
}
