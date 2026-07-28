import * as Phaser from 'phaser';

import { validatePlayableSavedDeck, type DataValidationIssue } from '../../game/data/index.js';
import { calculatePhaseSevenLayout } from '../../ui/layout/phaseSevenLayout.js';
import { getGameSession } from '../adapters/sceneBridge.js';
import { PF2eScreenPanel } from '../ui/components/PF2eScreenPanel.js';
import { PF2eStagePanel } from '../ui/components/PF2eStagePanel.js';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController.js';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme.js';

function formatDeckIssues(issues: readonly DataValidationIssue[]): string {
  const messages = [...new Set(issues.map((issue) => issue.message))];
  return messages.length === 0
    ? '합법적인 30장 덱입니다. 전투를 시작할 수 있습니다.'
    : `전투 시작 불가 · ${messages.join(' · ')}`;
}

export class StageScene extends Phaser.Scene {
  private screen?: PF2eScreenPanel;
  private buttonsController?: PF2eButtonsController;
  private status = '';
  private statusDanger = false;
  private busy = false;

  constructor() {
    super('StageScene');
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

    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.refreshDeckStatus();
    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private refreshDeckStatus(): void {
    const session = getGameSession(this);
    const state = session.getState();
    const saveSlot = state.activeSaveSlot;

    if (saveSlot === null) {
      return;
    }

    const deck = session.getSelectedDeck();
    const validation = validatePlayableSavedDeck(deck, {
      collection: saveSlot.collection,
      cardDefinitions: session.getCardDefinitions(),
    });
    this.status = formatDeckIssues(validation.valid ? [] : validation.issues);
    this.statusDanger = !validation.valid;
  }

  private rebuildLayout(width: number, height: number): void {
    const session = getGameSession(this);
    const state = session.getState();
    const saveSlot = state.activeSaveSlot;

    if (saveSlot === null) {
      return;
    }

    const layout = calculatePhaseSevenLayout(width, height);
    const deck = session.getSelectedDeck();
    const stage = session.getStages()[0];

    if (stage === undefined) {
      throw new Error('표시할 Stage 콘텐츠가 없습니다.');
    }
    const stageRuns = saveSlot.completedStageRuns.filter(
      (run) => run.stageId === stage.definition.id,
    );
    const winCount = stageRuns.filter((run) => run.result === 'WIN').length;

    this.buttonsController?.destroy();
    this.screen?.destroy();
    this.buttonsController = undefined;
    this.screen = undefined;

    const stagePanel = new PF2eStagePanel(this, {
      width: Math.max(220, layout.rootWidth - layout.panelInset * 2),
      stage,
      deck,
      ownedCardCount: saveSlot.collection.cardInstances.length,
      completedRunCount: stageRuns.length,
      winCount,
      cleared: saveSlot.progress.clearedStageIds.includes(stage.definition.id),
      compactActions: layout.orientation === 'portrait',
      bodyFontSize: layout.bodyFontSize,
    });
    const screen = new PF2eScreenPanel(this, {
      width: layout.rootWidth,
      height: layout.rootHeight,
      inset: layout.panelInset,
      gap: layout.gap,
      title: 'Stage',
      subtitle: `슬롯 ${saveSlot.slotId} · ${
        state.user?.username ?? '사용자'
      } · ${stage.presentation.name}`,
      titleFontSize: layout.titleFontSize,
      bodyFontSize: layout.bodyFontSize,
      content: stagePanel,
    })
      .setPosition(width / 2, height / 2)
      .layout();
    screen.setStatus(this.status, this.statusDanger ? 'danger' : 'normal');
    this.buttonsController = new PF2eButtonsController(stagePanel.buttons, {
      onButtonClick: (buttonId) => {
        switch (buttonId) {
          case 'deck':
            this.scene.start('DeckBuilderScene');
            break;
          case 'battle':
            void this.startBattle(stage.definition.id);
            break;
          case 'slots':
            this.scene.start('SaveSlotScene');
            break;
          case 'logout':
            void this.logout();
            break;
        }
      },
    });
    this.buttonsController
      .setButtonEnabled('deck', !this.busy)
      .setButtonEnabled('battle', !this.busy && session.canStartStage(stage.definition.id))
      .setButtonEnabled('slots', !this.busy)
      .setButtonEnabled('logout', !this.busy);
    this.screen = screen;
    this.game.canvas.dataset.scene = 'stage';
    this.game.canvas.dataset.orientation = layout.orientation;
    this.game.canvas.dataset.deckPlayable = String(session.canStartBattle());
    this.game.canvas.dataset.stageId = stage.definition.id;
    this.game.canvas.dataset.stageCleared = String(
      saveSlot.progress.clearedStageIds.includes(stage.definition.id),
    );
    this.game.canvas.dataset.collectionCount = String(saveSlot.collection.cardInstances.length);
  }

  private async startBattle(stageId: string): Promise<void> {
    if (this.busy) {
      return;
    }

    const session = getGameSession(this);
    if (!session.canStartStage(stageId)) {
      this.refreshDeckStatus();
      this.screen?.setStatus(this.status, 'danger');
      return;
    }

    this.busy = true;
    this.screen?.setStatus('서버에서 Stage 01 실행 ID와 전투 시드를 발급하는 중입니다…');
    this.buttonsController
      ?.setButtonEnabled('deck', false)
      .setButtonEnabled('battle', false)
      .setButtonEnabled('slots', false)
      .setButtonEnabled('logout', false);

    try {
      await session.startStageBattle(stageId);
      if (this.scene.isActive()) {
        this.scene.start('BattleScene');
      }
    } catch (error: unknown) {
      this.busy = false;
      this.screen?.setStatus(
        error instanceof Error ? error.message : 'Stage 실행을 시작하지 못했습니다.',
        'danger',
      );
      this.buttonsController
        ?.setButtonEnabled('deck', true)
        .setButtonEnabled('battle', session.canStartStage(stageId))
        .setButtonEnabled('slots', true)
        .setButtonEnabled('logout', true);
    }
  }

  private async logout(): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;
    this.screen?.setStatus('로그아웃하는 중입니다…');

    try {
      await getGameSession(this).logout();
      if (this.scene.isActive()) {
        this.scene.start('LoginScene', { status: '로그아웃했습니다.' });
      }
    } catch (error: unknown) {
      this.busy = false;
      this.screen?.setStatus(
        error instanceof Error ? error.message : '로그아웃하지 못했습니다.',
        'danger',
      );
    }
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.buttonsController?.destroy();
    this.buttonsController = undefined;
  };
}
