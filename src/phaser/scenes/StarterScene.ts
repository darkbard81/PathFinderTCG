import * as Phaser from 'phaser';
import type Label from 'phaser4-rex-plugins/templates/ui/label/Label.js';
import type RoundRectangle from 'phaser4-rex-plugins/templates/ui/roundrectangle/RoundRectangle.js';
import type Sizer from 'phaser4-rex-plugins/templates/ui/sizer/Sizer.js';

import type { GameAction } from '../../game/input/actions';
import { resolveKeyboardAction } from '../../game/input/bindings';
import type { GameState } from '../../game/simulation/GameSession';
import { getGameSession } from '../adapters/sceneBridge';
import { calculateViewportLayout, type ViewportLayout } from '../../ui/layout/viewportLayout';

const COLORS = {
  backdrop: 0x07111f,
  panel: 0x12223a,
  panelSecondary: 0x0d192b,
  border: 0x35567a,
  accent: 0x5fd3bc,
  accentHover: 0x7de6d2,
  danger: 0xd47878,
  dangerHover: 0xe69696,
  accentText: '#5fd3bc',
  text: '#eff8ff',
  mutedText: '#9bb1c8',
} as const;

export class StarterScene extends Phaser.Scene {
  private rootSizer?: Sizer;
  private statusText?: Phaser.GameObjects.Text;
  private viewportText?: Phaser.GameObjects.Text;
  private unsubscribeSession?: () => void;

  constructor() {
    super('StarterScene');
  }

  create(): void {
    const session = getGameSession(this);

    this.cameras.main.setBackgroundColor(COLORS.backdrop);
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
    const innerPadding = Math.max(16, Math.round(layout.padding * 0.75));
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

    panel.addBackground(this.createPanelBackground(COLORS.panel));

    const eyebrow = this.add.text(0, 0, 'PHASER 4 · REXUI · TYPESCRIPT', {
      color: COLORS.mutedText,
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: `${layout.eyebrowFontSize}px`,
      fontStyle: 'bold',
      letterSpacing: 1.5,
    });

    const title = this.add.text(0, 0, 'Pathfinder TCG', {
      color: COLORS.text,
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: `${layout.titleFontSize}px`,
      fontStyle: 'bold',
    });

    const description = this.add.text(
      0,
      0,
      '화면 크기와 방향에 따라 rexUI Sizer 구성이 자동으로 전환됩니다. 게임 규칙 상태는 Phaser Scene 밖의 GameSession이 소유합니다.',
      {
        color: COLORS.mutedText,
        fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
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
      ['✓ Phaser.Scale.RESIZE', '✓ 가로·세로 반응형 rexUI', '✓ 외부 simulation 상태 경계'],
      {
        color: COLORS.accentText,
        fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
        fontSize: `${layout.bodyFontSize}px`,
        lineSpacing: Math.round(layout.bodyFontSize * 0.45),
      },
    );

    return panel
      .add(eyebrow, { align: 'left' })
      .add(title, { align: 'left' })
      .add(description, { align: 'left' })
      .add(features, { align: 'left' });
  }

  private createActionPanel(layout: ViewportLayout): Sizer {
    const innerPadding = Math.max(16, Math.round(layout.padding * 0.75));
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

    panel.addBackground(this.createPanelBackground(COLORS.panelSecondary));

    const sectionTitle = this.add.text(0, 0, 'Starter 상태', {
      color: COLORS.text,
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: `${layout.sectionFontSize}px`,
      fontStyle: 'bold',
    });

    this.statusText = this.add.text(0, 0, '', {
      color: COLORS.accentText,
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: `${layout.bodyFontSize}px`,
      lineSpacing: Math.round(layout.bodyFontSize * 0.35),
      wordWrap: {
        width: layout.actionTextWidth,
        useAdvancedWrap: true,
      },
    });

    this.viewportText = this.add.text(0, 0, '', {
      color: COLORS.mutedText,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: `${layout.eyebrowFontSize}px`,
    });

    const buttons = this.rexUI.add.sizer({
      orientation: 'x',
      space: {
        item: Math.max(10, Math.round(layout.gap * 0.65)),
      },
    });

    buttons
      .add(this.createButton('확인 · Enter', 'confirm', COLORS.accent, COLORS.accentHover), {
        proportion: 1,
        expand: true,
      })
      .add(this.createButton('취소 · Esc', 'cancel', COLORS.danger, COLORS.dangerHover), {
        proportion: 1,
        expand: true,
      });

    return panel
      .add(sectionTitle, { align: 'left' })
      .add(this.statusText, { align: 'left', proportion: 1 })
      .add(this.viewportText, { align: 'left' })
      .add(buttons, { expand: true });
  }

  private createButton(
    labelText: string,
    action: GameAction,
    fillColor: number,
    hoverColor: number,
  ): Label {
    const background = this.rexUI.add.roundRectangle(0, 0, 2, 2, 12, fillColor, 1);
    const text = this.add.text(0, 0, labelText, {
      color: '#07111f',
      fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
    });

    const button = this.rexUI.add.label({
      height: 54,
      background,
      text,
      align: 'center',
      space: {
        left: 18,
        right: 18,
        top: 14,
        bottom: 14,
      },
    });

    button
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        background.setFillStyle(hoverColor, 1);
      })
      .on('pointerout', () => {
        background.setFillStyle(fillColor, 1);
      })
      .on('pointerup', () => {
        this.dispatch(action);
      });

    return button;
  }

  private createPanelBackground(fillColor: number): RoundRectangle {
    return this.rexUI.add
      .roundRectangle(0, 0, 2, 2, 22, fillColor, 0.96)
      .setStrokeStyle(2, COLORS.border, 0.85);
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
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
  };
}
