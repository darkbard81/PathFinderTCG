import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { toBattleCardTile } from '../../dom/screens/battle-card-tile';
import {
  BATTLE_ROW_IDS,
  listRowSlotIds,
  resolveBattleBoardMetrics,
  type BattleRowId,
} from '../../dom/screens/battlefield-layout';
import {
  createBattlefieldView,
  type BattlefieldView,
  type BattleSlotModel,
} from '../../dom/screens/battlefield-view';
import type { CardTile } from '../../dom/screens/card-tile';
import { calculateSlotDominance, findBattlefieldCardAtSlot } from '../../game/battle/battle-engine';
import { createInitialBattleRuntime } from '../../game/battle/create-battle-runtime';
import type {
  BattlePhase,
  BattleParticipantRuntimeState,
  BattleRuntimeState,
} from '../../game/battle/types';
import type { GameSession } from '../../game/save/session';
import { requireStageDefinition } from '../../game/stage/stage-definitions';
import { UI_THEME } from '../../theme';
import type { ViewportLayout } from '../app/viewport';
import type { Scene } from './scene';

const TITLE_BACKGROUND_ALIAS = 'ui.title-screen';

const PHASE_LABELS: Record<BattlePhase, string> = {
  MAIN: '메인',
  ATTACK: '공격',
  GAME_OVER: '종료',
};

export type BattlefieldSceneOptions = {
  backgroundImageUrl: string;
  assetBaseUrl: string;
  session: GameSession;
  stageId: string;
  onLeave: (session: GameSession) => void;
  view?: BattlefieldView;
  random?: () => number;
};

/**
 * 전장 화면이다.
 * 규칙 판정은 전부 battle-engine이 맡고, 이 Scene은 런타임 상태를 뷰 모델로 옮기는 일만 한다.
 * 이번 단계는 초기 배치를 정적으로 보여주는 데까지다. 조작은 다음 단계에서 붙인다.
 */
export class BattlefieldScene implements Scene {
  public readonly view = new Container({
    label: 'battlefield',
    eventMode: 'none',
  });
  public readonly element: HTMLElement;

  private readonly battlefieldView: BattlefieldView;
  private readonly backdrop = new Graphics({ label: 'battlefield-backdrop', eventMode: 'none' });
  private readonly stageName: string;
  private readonly runtime: BattleRuntimeState;
  private background: Sprite | null = null;
  private layout: ViewportLayout | null = null;
  private active = true;

  public constructor(private readonly options: BattlefieldSceneOptions) {
    const stageDefinition = requireStageDefinition(options.stageId);
    this.stageName = stageDefinition.name;
    this.runtime = createInitialBattleRuntime(
      options.session,
      stageDefinition,
      options.random ?? Math.random,
    );

    this.battlefieldView =
      options.view ??
      createBattlefieldView({
        onEndTurn: () => this.endTurn(),
        onLeave: () => this.options.onLeave(this.options.session),
      });

    this.element = this.battlefieldView.element;
    this.view.addChild(this.backdrop);
  }

  public async enter(): Promise<void> {
    this.active = true;
    this.renderView('전투를 시작합니다.');

    await this.ensureBackground();
    if (this.layout) {
      this.layoutBackground(this.layout);
    }
  }

  public exit(): void {
    this.active = false;
  }

  public resize(layout: ViewportLayout): void {
    this.layout = layout;
    this.layoutBackground(layout);
    // 카드 크기가 뷰포트에 따라 달라진다. 배율이 바뀌면 보드를 다시 그려야 한다.
    this.renderView();
  }

  private endTurn(): void {
    this.renderView('턴 진행은 다음 단계에서 연결합니다.');
  }

  private renderView(status = ''): void {
    const layout = this.layout ?? { width: 1024, height: 768, scale: 1 };

    this.battlefieldView.render({
      metrics: resolveBattleBoardMetrics(layout),
      stageName: this.stageName,
      turnNumber: this.runtime.turnNumber,
      currentSide: this.runtime.currentSide,
      phaseLabel: PHASE_LABELS[this.runtime.phase],
      enemy: {
        ...this.readPileCounts(this.runtime.enemy),
        handCount: this.runtime.enemy.hand.length,
      },
      player: this.readPileCounts(this.runtime.player),
      slots: this.buildSlotModels(),
      hand: this.buildHandTiles(),
      status,
      canEndTurn: false,
    });
  }

  private readPileCounts(participant: BattleParticipantRuntimeState): {
    deckCount: number;
    dropCount: number;
    exileCount: number;
  } {
    return {
      deckCount: participant.deck.length,
      dropCount: participant.drop.length,
      exileCount: participant.exile.length,
    };
  }

  private buildSlotModels(): Record<BattleRowId, BattleSlotModel[]> {
    return Object.fromEntries(
      BATTLE_ROW_IDS.map((row) => [
        row,
        listRowSlotIds(row).map((slotId): BattleSlotModel => {
          const card = findBattlefieldCardAtSlot(this.runtime, slotId);

          return {
            slotId,
            card: card ? this.toTile(card) : null,
            // 빈 칸에만 인접 지배력을 적는다. 무엇을 놓을 수 있는지 집기 전에 읽게 하는 값이다.
            dominance: card ? null : calculateSlotDominance(this.runtime, slotId),
          };
        }),
      ]),
    ) as Record<BattleRowId, BattleSlotModel[]>;
  }

  private buildHandTiles(): CardTile[] {
    return [...this.runtime.player.hand]
      .sort((left, right) => (left.handIndex ?? 0) - (right.handIndex ?? 0))
      .map((card) => this.toTile(card));
  }

  private toTile(card: Parameters<typeof toBattleCardTile>[1]): CardTile {
    return toBattleCardTile(this.runtime, card, this.options.assetBaseUrl);
  }

  private async ensureBackground(): Promise<void> {
    if (this.background) {
      return;
    }

    try {
      const texture = (await Assets.load({
        alias: TITLE_BACKGROUND_ALIAS,
        src: this.options.backgroundImageUrl,
      })) as Texture;

      if (!this.active) {
        return;
      }

      this.background = new Sprite({
        texture,
        label: 'title-background',
        eventMode: 'none',
      });
      this.view.addChildAt(this.background, 0);
    } catch {
      this.background = null;
    }
  }

  private layoutBackground(layout: ViewportLayout): void {
    if (this.background) {
      this.background.width = layout.width;
      this.background.height = layout.height;
    }

    const { screenDim } = UI_THEME.surfaces;

    this.backdrop
      .clear()
      .rect(0, 0, layout.width, layout.height)
      .fill({ color: screenDim.fill.canvas, alpha: screenDim.fillAlpha });
  }
}
