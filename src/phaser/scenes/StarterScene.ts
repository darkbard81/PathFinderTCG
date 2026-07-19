import * as Phaser from 'phaser';
import type Sizer from 'phaser4-rex-plugins/templates/ui/sizer/Sizer.js';

import type { GameAction } from '../../game/input/actions';
import { resolveKeyboardAction } from '../../game/input/bindings';
import type { GameState } from '../../game/simulation/GameSession';
import { getGameSession } from '../adapters/sceneBridge';
import { calculateViewportLayout, type ViewportLayout } from '../../ui/layout/viewportLayout';
import { PF2eButtons } from '../ui/components/PF2eButtons';
import { PF2eNineLabel } from '../ui/components/PF2eNineLabel';
import { PF2eNinePatch2 } from '../ui/components/PF2eNinePatch2';
import { PF2eButtonsController } from '../ui/controllers/PF2eButtonsController';
import { PF2E_ELF_THEME } from '../ui/theme/pf2eElfTheme';

export class StarterScene extends Phaser.Scene {
  private rootSizer?: Sizer;
  private statusText?: Phaser.GameObjects.Text;
  private viewportText?: Phaser.GameObjects.Text;
  private unsubscribeSession?: () => void;
  private actionButtonsController?: PF2eButtonsController;

  constructor() {
    super('StarterScene');
  }

  create(): void {
    const session = getGameSession(this);

    this.cameras.main.setBackgroundColor(PF2E_ELF_THEME.colors.backdrop);
    this.unsubscribeSession = session.subscribe((state) => {
      this.renderState(state);
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.input.keyboard?.on('keydown', this.handleKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);

    this.rebuildLayout(this.scale.gameSize.width, this.scale.gameSize.height);
  }

  private readonly handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.rebuildLayout(gameSize.width, gameSize.height);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = resolveKeyboardAction(event.code);
    if (action) {
      this.dispatch(action);
    }
  };

  private dispatch(action: GameAction): void {
    getGameSession(this).dispatch(action);
  }

  private rebuildLayout(width: number, height: number): void {
    const layout = calculateViewportLayout(width, height);
    const session = getGameSession(this);

    this.actionButtonsController?.destroy();
    this.actionButtonsController = undefined;
    this.rootSizer?.destroy();
    this.rootSizer = undefined;
    this.statusText = undefined;
    this.viewportText = undefined;

    const usableWidth = Math.max(1, width - layout.padding * 2);
    const usableHeight = Math.max(1, height - layout.padding * 2);
    const landscape = layout.orientation === 'landscape';

    const root = this.rexUI.add.sizer({
      x: width / 2,
      y: height / 2,
      width: usableWidth,
      height: usableHeight,
      orientation: landscape ? 'x' : 'y',
      space: {
        item: layout.gap,
      },
    });

    const informationPanel = this.createInformationPanel(layout);
    const actionPanel = this.createActionPanel(layout);

    root
      .add(informationPanel, {
        proportion: landscape ? 1.35 : 1,
        expand: true,
      })
      .add(actionPanel, {
        proportion: 1,
        expand: true,
      })
      .layout();

    this.rootSizer = root;
    this.game.canvas.dataset.orientation = layout.orientation;
    this.game.canvas.dataset.viewport = `${Math.round(width)}x${Math.round(height)}`;
    this.renderState(session.getState());
  }

  private createInformationPanel(layout: ViewportLayout): Sizer {
    const innerPadding = Math.max(
      PF2E_ELF_THEME.spacing.panelInset,
      Math.round(layout.padding * 0.75),
    );
    const panel = this.rexUI.add.sizer({
      orientation: 'y',
      space: {
        left: innerPadding,
        right: innerPadding,
        top: innerPadding,
        bottom: innerPadding,
        item: layout.gap,
      },
    });

    panel.addBackground(
      new PF2eNinePatch2(this, {
        variant: 'panel',
        width: 2,
        height: 2,
      }),
    );

    const eyebrow = this.add.text(0, 0, 'PHASER 4 · REXUI · TYPESCRIPT', {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${layout.eyebrowFontSize}px`,
      fontStyle: 'bold',
      letterSpacing: 1.5,
    });

    const title = new PF2eNineLabel(this, {
      text: 'Pathfinder TCG',
      variant: 'heading',
      fontSize: layout.titleFontSize,
      height: Math.max(78, layout.titleFontSize + 36),
    });

    const description = this.add.text(
      0,
      0,
      '에메랄드 숲 테마의 PF2eNinePatch2 패널과 PF2eNineLabel 컨트롤을 반응형 rexUI Sizer로 구성합니다. 게임 규칙 상태는 Phaser Scene 밖의 GameSession이 소유합니다.',
      {
        color: PF2E_ELF_THEME.colors.mutedText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${layout.bodyFontSize}px`,
        lineSpacing: Math.round(layout.bodyFontSize * 0.35),
        wordWrap: {
          width: layout.contentTextWidth,
          useAdvancedWrap: true,
        },
      },
    );

    const features = this.add.text(
      0,
      0,
      ['✓ 엘프 테마 NinePatch2 자산', '✓ 표시·입력 계층 분리', '✓ 가로·세로 반응형 rexUI'],
      {
        color: PF2E_ELF_THEME.colors.accentText,
        fontFamily: PF2E_ELF_THEME.typography.body,
        fontSize: `${layout.bodyFontSize}px`,
        lineSpacing: Math.round(layout.bodyFontSize * 0.45),
      },
    );

    return panel
      .add(eyebrow, { align: 'left' })
      .add(title, { align: 'center', expand: true })
      .add(description, { align: 'left' })
      .add(features, { align: 'left' });
  }

  private createActionPanel(layout: ViewportLayout): Sizer {
    const innerPadding = Math.max(
      PF2E_ELF_THEME.spacing.panelInset,
      Math.round(layout.padding * 0.75),
    );
    const panel = this.rexUI.add.sizer({
      orientation: 'y',
      space: {
        left: innerPadding,
        right: innerPadding,
        top: innerPadding,
        bottom: innerPadding,
        item: layout.gap,
      },
    });

    panel.addBackground(
      new PF2eNinePatch2(this, {
        variant: 'panel',
        width: 2,
        height: 2,
      }),
    );

    const sectionTitle = new PF2eNineLabel(this, {
      text: '엘프 테마 상태',
      variant: 'section',
      fontSize: layout.sectionFontSize,
      height: Math.max(62, layout.sectionFontSize + 30),
    });

    this.statusText = this.add.text(0, 0, '', {
      color: PF2E_ELF_THEME.colors.accentText,
      fontFamily: PF2E_ELF_THEME.typography.body,
      fontSize: `${layout.bodyFontSize}px`,
      lineSpacing: Math.round(layout.bodyFontSize * 0.35),
      wordWrap: {
        width: layout.actionTextWidth,
        useAdvancedWrap: true,
      },
    });

    this.viewportText = this.add.text(0, 0, '', {
      color: PF2E_ELF_THEME.colors.mutedText,
      fontFamily: PF2E_ELF_THEME.typography.mono,
      fontSize: `${layout.eyebrowFontSize}px`,
    });

    const stackButtons = layout.orientation === 'portrait' && layout.width < 560;
    const buttons = new PF2eButtons(this, {
      orientation: stackButtons ? 'y' : 'x',
      buttons: [
        {
          id: 'confirm',
          text: '확인 · Enter',
          variant: 'primary',
          fontSize: Math.max(16, layout.bodyFontSize - 1),
        },
        {
          id: 'cancel',
          text: '취소 · Esc',
          variant: 'danger',
          fontSize: Math.max(16, layout.bodyFontSize - 1),
        },
      ],
    });
    this.actionButtonsController = new PF2eButtonsController(buttons, {
      onButtonClick: (buttonId) => {
        if (buttonId === 'confirm' || buttonId === 'cancel') {
          this.dispatch(buttonId);
        }
      },
    });

    return panel
      .add(sectionTitle, { align: 'center', expand: true })
      .add(this.statusText, { align: 'left', proportion: 1 })
      .add(this.viewportText, { align: 'left' })
      .add(buttons, { expand: true });
  }

  private renderState(state: GameState): void {
    if (!this.statusText || !this.viewportText) {
      return;
    }

    const lastAction =
      state.lastAction === null ? '없음' : state.lastAction === 'confirm' ? '확인' : '취소';
    const orientation = this.game.canvas.dataset.orientation === 'landscape' ? '가로' : '세로';

    this.statusText.setText([
      state.message,
      `누적 액션: ${state.actionCount}`,
      `마지막 액션: ${lastAction}`,
    ]);
    this.viewportText.setText(
      `${this.game.canvas.dataset.viewport ?? '-'} · ${orientation} 레이아웃`,
    );
    this.game.canvas.dataset.actionCount = String(state.actionCount);
    this.game.canvas.dataset.lastAction = state.lastAction ?? 'none';
  }

  private readonly handleShutdown = (): void => {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.input.keyboard?.off('keydown', this.handleKeyDown);
    this.actionButtonsController?.destroy();
    this.actionButtonsController = undefined;
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
  };
}
